require('dotenv').config();
const express = require('express');
const path = require('path');

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

async function confluenceRequest(pathSuffix, options = {}) {
  const url = 'https://' + ATLASSIAN_SITE + '/wiki/api/v2' + pathSuffix;
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: confluenceAuthHeader(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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
  const data = await confluenceRequest('/spaces?keys=' + encodeURIComponent(spaceKeyOrId) + '&limit=1');
  const match = data.results && data.results[0];
  if (!match) throw new Error('No Confluence space found for key "' + spaceKeyOrId + '".');
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
// ---- /api/publish-page calls internally before it writes anything. ----
async function draftText(prompt) {
  const data = await anthropicRequest({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });
  return stripFences(textOf(data));
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

// ---- Publish: draft the page body with Claude, then create it directly via Confluence's ----
// ---- own REST API using a static API token. No MCP connector, no OAuth flow. ----
app.post('/api/publish-page', async (req, res) => {
  const { title, prompt, parentId } = req.body || {};
  const spaceKeyOrId = req.body && req.body.spaceKeyOrId ? req.body.spaceKeyOrId : ATLASSIAN_DEFAULT_SPACE;
  if (!title || !prompt) {
    return res.status(400).json({ error: 'Missing "title" or "prompt" in request body.' });
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
    const bodyHtml = await draftText(prompt);
    if (!bodyHtml.trim()) {
      return res.status(502).json({ error: 'Claude returned an empty draft \u2014 nothing was sent to Confluence.' });
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
