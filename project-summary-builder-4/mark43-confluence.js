// mark43-confluence.js
//
// Pulls canonical, current-as-of-right-now product/pricing context straight from
// Confluence at draft time, rather than relying solely on the frozen snapshot in
// mark43-glossary.js. This covers the two page types that turned out to matter most
// for drafting accuracy: the Mark43 Product SKU Catalogue Summary (single page,
// always fetched) and the per-state "Standard Implementation Guide" pages (fetched
// as a set; whichever state is actually relevant to the document being drafted will
// naturally get used by the model, the rest just sit unused in context).
//
// Deliberately self-contained: reads its own copy of the Atlassian env vars rather
// than importing helpers from server.js, so this module has no dependency on
// server.js's internals and can be tested/swapped independently.
//
// If Confluence isn't configured, or a fetch fails, this degrades gracefully to an
// empty string — draftText() in server.js always has the static glossary as a
// fallback, so a Confluence outage never breaks /api/draft or /api/publish-page.

const ATLASSIAN_SITE = process.env.ATLASSIAN_SITE || '';
const ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL || '';
const ATLASSIAN_API_TOKEN = process.env.ATLASSIAN_API_TOKEN || '';

// Hardcoded because these are Mark43-internal pages this app already knows it
// wants — not user input, so no injection concern. Re-verify these IDs
// periodically; Confluence page IDs are stable across edits but a page could be
// moved/archived/renamed. If a fetch 404s, check the URL still resolves in
// Confluence and update the ID here.
const PAGE_IDS = {
  SKU_CATALOG: '5787287560', // "Mark43 Product SKU Catalogue Summary"
  STATE_GUIDES: {
    TX: '5629673544', // "Texas - Standard Implementation Guide"
    CA: '5633802453', // "California - Standard Implementation Guide"
    NY: '5410259112', // "New York - Standard Implementation Guide"
    NJ: '5410914429', // "New Jersey - Standard Implementation Guide"
    MA: '5411143850', // "Massachusetts - Standard Implementation Guide"
    FL: '5600444629', // "Florida - Standard Implementation Guide"
    IL: '5459902603', // "Illinois - Standard Implementation Guide"
  },
};

// How long a fetched page is trusted before re-fetching. SKUs/bundles don't change
// hour to hour, so this just keeps the app from hitting Confluence on every single
// draft — cheap insurance against rate limits and added latency, not a freshness
// guarantee. Restart the app (or wait out the TTL) to pick up edits made on
// Confluence sooner.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Cap how much of this live content rides along in the prompt. The SKU catalogue
// alone is small; seven state guides concatenated is not huge either, but this is
// a deliberate ceiling so a future addition (more states, a bigger page) can't
// silently balloon token usage.
const MAX_CONTEXT_CHARS = 20000;

let cache = {
  skuCatalog: { text: '', fetchedAt: 0 },
  stateGuides: { text: '', fetchedAt: 0 },
};

function confluenceConfigured() {
  return !!(ATLASSIAN_SITE && ATLASSIAN_EMAIL && ATLASSIAN_API_TOKEN);
}

function authHeader() {
  const raw = ATLASSIAN_EMAIL + ':' + ATLASSIAN_API_TOKEN;
  return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
}

// Confluence storage format is XHTML with some custom elements (macros, etc.).
// For prompt purposes we just want readable text, not markup — strip tags crudely
// rather than pull in a full HTML parser dependency for this one use.
function stripHtml(html) {
  return String(html || '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPageText(pageId) {
  const url =
    'https://' + ATLASSIAN_SITE + '/wiki/api/v2/pages/' + pageId + '?body-format=storage';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let resp;
  try {
    resp = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Confluence fetch for page ' + pageId + ' timed out after 8s.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    throw new Error('Confluence fetch failed for page ' + pageId + ': ' + resp.status);
  }
  const data = await resp.json();
  const title = data.title || '';
  const html = data.body && data.body.storage && data.body.storage.value;
  return '## ' + title + '\n' + stripHtml(html);
}

async function getSkuCatalogText() {
  const fresh = Date.now() - cache.skuCatalog.fetchedAt < CACHE_TTL_MS;
  if (fresh && cache.skuCatalog.text) return cache.skuCatalog.text;
  try {
    const text = await fetchPageText(PAGE_IDS.SKU_CATALOG);
    cache.skuCatalog = { text, fetchedAt: Date.now() };
    return text;
  } catch (err) {
    console.warn('mark43-confluence: SKU catalog fetch failed, using cache/fallback:', err.message);
    return cache.skuCatalog.text || '';
  }
}

async function getStateGuidesText() {
  const fresh = Date.now() - cache.stateGuides.fetchedAt < CACHE_TTL_MS;
  if (fresh && cache.stateGuides.text) return cache.stateGuides.text;
  try {
    const entries = Object.entries(PAGE_IDS.STATE_GUIDES);
    const results = await Promise.allSettled(entries.map(([, id]) => fetchPageText(id)));
    const combined = results
      .map((r, i) => (r.status === 'fulfilled' ? r.value : null))
      .filter(Boolean)
      .join('\n\n---\n\n');
    if (combined) {
      cache.stateGuides = { text: combined, fetchedAt: Date.now() };
      return combined;
    }
    return cache.stateGuides.text || '';
  } catch (err) {
    console.warn('mark43-confluence: state guides fetch failed, using cache/fallback:', err.message);
    return cache.stateGuides.text || '';
  }
}

// Main entry point for server.js. Returns a single text block ready to prepend to
// a prompt, or '' if Confluence isn't configured / everything failed (safe no-op).
// Hard-capped overall so a Confluence slowdown can only ever add a bounded delay to
// drafting, never an unbounded one \u2014 individual page fetches already time out at
// 8s each, but this belt-and-suspenders cap protects against any other slow step.
async function getLiveDomainContext() {
  if (!confluenceConfigured()) return '';
  const overallTimeout = new Promise((resolve) => setTimeout(() => resolve(['', '']), 12000));
  const fetchBoth = Promise.all([getSkuCatalogText(), getStateGuidesText()]);
  const [skuText, stateText] = await Promise.race([fetchBoth, overallTimeout]);
  const combined = [
    skuText ? 'CANONICAL SKU CATALOG (live from Confluence, treat as current ground truth for SKU codes):\n' + skuText : '',
    stateText ? 'STATE STANDARD IMPLEMENTATION GUIDES (live from Confluence — the state-standard bundle baseline; an individual SOW/Order Form is still authoritative for what that specific agency purchased):\n' + stateText : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return combined.slice(0, MAX_CONTEXT_CHARS);
}

module.exports = { getLiveDomainContext, PAGE_IDS };
