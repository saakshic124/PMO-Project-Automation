require('dotenv').config();
const express = require('express');
const path = require('path');
const { MARK43_DOMAIN_GLOSSARY } = require('./mark43-glossary');
const { getLiveDomainContext } = require('./mark43-confluence');

const app = express();
app.use(express.json({ limit: '15mb' })); // source text dumps can be large

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

// Confluence auth: a plain Atlassian API token (from id.atlassian.com/manage-profile/security/api-tokens)
// used as HTTP Basic Auth (email + token) directly against Confluence's own REST API v2.
// Deliberately NOT using Anthropic's MCP connector for this — that path requires an OAuth
// Bearer token obtained via a local OAuth flow (needs Node + a browser hitting localhost on
// the same machine), which isn't viable on a locked-down machine with no Terminal access.
// A static API token needs nothing but a web browser to generate.
//
// This same token is reused by mark43-confluence.js to read (not write) a couple of
// internal reference pages at draft time — no separate credential needed for that.
const ATLASSIAN_SITE = process.env.ATLASSIAN_SITE || ''; // e.g. "mark43.atlassian.net"
const ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL || '';
const ATLASSIAN_API_TOKEN = process.env.ATLASSIAN_API_TOKEN || '';
// Where pages land when the client doesn't specify a space — a key (e.g. "PMO") or a
// personal space key (e.g. "~712020abc..."). Kept server-side deliberately: the person
// using the app shouldn't have to know or type a space identifier at all.
const ATLASSIAN_DEFAULT_SPACE = process.env.ATLASSIAN_DEFAULT_SPACE || '';

if (!ANTHROPIC_API_KEY) {
  console.error(
    '\u26a0 ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example) or your host\'s ' +
    'environment variables before starting the server.'
  );
}

function confluenceConfigured() {
  return !!(ATLASSIAN_SITE && ATLASSIAN_EMAIL && ATLASSIAN_API_TOKEN);
}

function confluenceAuthHeader() {
  const raw = ATLASSIAN_EMAIL + ':' + ATLASSIAN_API_TOKEN;
  return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
}

// Wraps fetch() with a hard timeout via AbortController, so a slow or unresponsive remote
// API (Confluence, in this app's case) can never cause a request to hang indefinitely with
// no feedback to the person waiting on it.
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request to ' + url + ' timed out after ' + timeoutMs + 'ms.');
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function confluenceRequest(pathSuffix, options = {}) {
  const url = 'https://' + ATLASSIAN_SITE + '/wiki/api/v2' + pathSuffix;
  const resp = await fetchWithTimeout(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: confluenceAuthHeader(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }, 10000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(
      (data && data.errors && data.errors[0] && data.errors[0].title) ||
      ('Confluence API error ' + resp.status)
    );
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

// A space "key" (e.g. "PMO") or personal space key (e.g. "~712020abc...") both need
// resolving to Confluence's internal numeric space ID before the create-page endpoint will
// accept them. If the input is already numeric, skip the lookup.
async function resolveSpaceId(spaceKeyOrId) {
  if (/^\d+$/.test(spaceKeyOrId)) return spaceKeyOrId;
  const lookup = async (key) => {
    const data = await confluenceRequest('/spaces?keys=' + encodeURIComponent(key) + '&limit=1');
    return data.results && data.results[0];
  };
  let match = await lookup(spaceKeyOrId);
  if (!match && !spaceKeyOrId.startsWith('~')) {
    // Personal space keys must be prefixed with "~" (e.g. "~712020abc...") \u2014 a bare
    // account ID pasted without it is a common copy-paste mistake, so retry once with the
    // tilde added before giving up entirely.
    match = await lookup('~' + spaceKeyOrId);
  }
  if (!match) {
    throw new Error(
      'No Confluence space found for key "' + spaceKeyOrId + '" (also tried "~' + spaceKeyOrId +
      '"). If this is meant to be a personal space, double-check ATLASSIAN_DEFAULT_SPACE ' +
      'includes the leading "~".'
    );
  }
  return match.id;
}

async function confluenceCreatePage({ title, spaceKeyOrId, parentId, bodyHtml }) {
  const spaceId = await resolveSpaceId(spaceKeyOrId);
  const payload = {
    spaceId,
    status: 'current',
    title,
    body: { representation: 'storage', value: bodyHtml },
  };
  if (parentId) payload.parentId = parentId;
  const page = await confluenceRequest('/pages', { method: 'POST', body: payload });
  const webui = page._links && page._links.webui;
  const base = (page._links && page._links.base) || ('https://' + ATLASSIAN_SITE + '/wiki');
  return { id: page.id, title: page.title, url: webui ? base + webui : null };
}

async function anthropicRequest(payload) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error((data && data.error && data.error.message) || ('Anthropic API error ' + resp.status));
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

function textOf(data) {
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

function stripFences(s) {
  return String(s ?? '').replace(/^```(?:html|xml)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

// ---- Draft: plain text generation, no Confluence write. Useful standalone, and also what
// ---- /api/publish-page calls internally before it writes anything (unless a pre-drafted
// ---- bodyHtml is passed in, in which case drafting is skipped entirely — see below). ----
//
// Every draft is grounded with two layers of domain context, prepended ahead of the
// person's own prompt:
//   1. MARK43_DOMAIN_GLOSSARY — a static, hand-maintained file distilling patterns seen
//      across customer SOWs/Order Forms (template families, migration entity structure,
//      naming variance to watch for, etc.) — see mark43-glossary.js.
//   2. Live Confluence context — the current SKU Catalogue Summary and per-state Standard
//      Implementation Guides, fetched (and cached) at request time — see
//      mark43-confluence.js. This is the canonical, current source of truth for SKU codes
//      and state-standard bundles, so it's treated as higher-confidence than anything
//      inferred purely from customer documents.
// If Confluence isn't configured or the live fetch fails, layer 2 silently contributes
// nothing — the static glossary alone is still a meaningful accuracy improvement on its
// own, so a Confluence hiccup never breaks drafting.
async function draftText(prompt) {
  const liveContext = await getLiveDomainContext().catch((err) => {
    console.warn('draftText: live Confluence context unavailable:', err.message);
    return '';
  });
  const fullPrompt = [MARK43_DOMAIN_GLOSSARY, liveContext, prompt].filter(Boolean).join('\n\n');
  const data = await anthropicRequest({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: fullPrompt }],
  });
  const text = stripFences(textOf(data));
  if (!text.trim()) {
    const blockTypes = (data.content || []).map((b) => b.type);
    // Don't fail silently: log everything useful about why Claude's response had
    // no usable text, so this is diagnosable from Render logs instead of showing
    // up as a mysteriously empty box in the browser with no error anywhere.
    console.error(
      'draftText: Claude returned no usable text.',
      JSON.stringify({ promptChars: fullPrompt.length, stopReason: data.stop_reason, usage: data.usage, contentBlockTypes: blockTypes })
    );
    let reasonHint;
    if (data.stop_reason === 'max_tokens' && blockTypes.length && !blockTypes.includes('text')) {
      // The entire max_tokens budget was consumed by non-text content (most likely
      // extended thinking) before the model ever got to writing the page itself.
      // Thinking tokens and output tokens draw from the same max_tokens pool, so
      // raising max_tokens (not just a little) is the actual fix here, not a prompt bug.
      reasonHint =
        ' The model spent its entire MAX_TOKENS budget (' + MAX_TOKENS + ') on internal reasoning ' +
        '(content blocks returned: [' + blockTypes.join(', ') + ']) and never got to writing actual ' +
        'output. This happens on large/complex source sets \u2014 raise MAX_TOKENS substantially ' +
        '(try 16000, then higher if it recurs) since reasoning and output share the same budget.';
    } else if (data.stop_reason === 'max_tokens') {
      reasonHint = ' The model hit the MAX_TOKENS limit (' + MAX_TOKENS + ') before producing any output \u2014 try raising MAX_TOKENS.';
    } else {
      reasonHint = ' Content block types returned: [' + blockTypes.join(', ') + ']. stop_reason: ' + data.stop_reason + '. Check server logs for the full response.';
    }
    const err = new Error('Claude returned an empty draft.' + reasonHint);
    err.status = 502;
    throw err;
  }
  return text;
}

app.post('/api/draft', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing "prompt" string in request body.' });
  }
  try {
    const text = await draftText(prompt);
    res.json({ text });
  } catch (err) {
    console.error('draft error:', err.data || err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.data });
  }
});

// ---- Publish: create the page directly via Confluence's own REST API using a static ----
// ---- API token. No MCP connector, no OAuth flow. ----
//
// Two modes, both handled by this one route:
//   - { title, bodyHtml }        -> publish exactly this HTML, no drafting call at all.
//                                    This is what the two-step "review, then publish" UI
//                                    flow in index.html uses: the person already saw and
//                                    optionally edited the draft from /api/draft, so this
//                                    just writes whatever they approved.
//   - { title, prompt }          -> draft it first (same as /api/draft), then publish the
//                                    result. Kept for backward compatibility / any caller
//                                    that wants one-shot draft+publish without a review step.
app.post('/api/publish-page', async (req, res) => {
  const { title, prompt, bodyHtml: providedBodyHtml, parentId } = req.body || {};
  const spaceKeyOrId = req.body && req.body.spaceKeyOrId ? req.body.spaceKeyOrId : ATLASSIAN_DEFAULT_SPACE;
  if (!title || (!prompt && !providedBodyHtml)) {
    return res.status(400).json({ error: 'Missing "title" and either "bodyHtml" or "prompt" in request body.' });
  }
  if (!confluenceConfigured()) {
    return res.status(412).json({
      error: 'ATLASSIAN_SITE / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN are not fully configured on ' +
        'this server. See README.md \u2014 "Getting an Atlassian API token" \u2014 before this button will work.',
    });
  }
  if (!spaceKeyOrId) {
    return res.status(412).json({
      error: 'No destination space configured. Set ATLASSIAN_DEFAULT_SPACE in the server ' +
        'environment (a space key like "PMO", or a personal space key like "~712020abc...").',
    });
  }
  try {
    const bodyHtml = providedBodyHtml || (await draftText(prompt));
    if (!bodyHtml || !bodyHtml.trim()) {
      return res.status(502).json({ error: 'No content to publish \u2014 the draft was empty.' });
    }
    const page = await confluenceCreatePage({ title, spaceKeyOrId, parentId, bodyHtml });
    res.json(page);
  } catch (err) {
    console.error('publish-page error:', err.data || err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.data });
  }
});

// ---- Placeholder for the next step: Mark43 API integration. ----
app.use('/api/mark43', require('./routes/mark43'));

// ---- Diagnostic: list every Confluence space this API token can see, with its exact key. ----
// Exists purely to solve "what's my actual space key" without guessing at formats or needing
// a terminal/curl \u2014 just visit this URL in a browser once credentials are configured.
// Read-only, no secrets exposed (keys/names/types only), safe to leave in place.
app.get('/api/confluence-spaces', async (req, res) => {
  if (!confluenceConfigured()) {
    return res.status(412).json({ error: 'Atlassian credentials are not configured on this server.' });
  }
  try {
    const data = await confluenceRequest('/spaces?limit=100');
    const spaces = (data.results || []).map((s) => ({ id: s.id, key: s.key, name: s.name, type: s.type }));
    res.json({ count: spaces.length, spaces });
  } catch (err) {
    console.error('confluence-spaces error:', err.data || err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.data });
  }
});

app.get('/health', (req, res) => res.json({
  ok: true,
  model: MODEL,
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
  confluenceConfigured: confluenceConfigured(),
}));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Project Summary Builder listening on port ' + PORT);
  console.log('Model: ' + MODEL + ' | Confluence configured: ' + confluenceConfigured());
});
