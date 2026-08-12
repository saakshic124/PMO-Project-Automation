require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '15mb' })); // source text dumps can be large

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

// Current Anthropic MCP connector spec (verified against platform.claude.com docs,
// Aug 2026): beta header is mcp-client-2025-11-20, and tool enablement lives in a
// separate `tools` array as an MCPToolset object — NOT inline on the server definition
// like the older, now-deprecated mcp-client-2025-04-04 header used.
const MCP_BETA_HEADER = 'mcp-client-2025-11-20';
const ATLASSIAN_MCP_URL = process.env.ATLASSIAN_MCP_URL || 'https://mcp.atlassian.com/v1/mcp';
const ATLASSIAN_OAUTH_TOKEN = process.env.ATLASSIAN_OAUTH_TOKEN || '';

if (!ANTHROPIC_API_KEY) {
  console.error(
    '\u26a0 ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example) or your host\'s ' +
    'environment variables before starting the server.'
  );
}

async function anthropicRequest(payload, { beta } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
  if (beta) headers['anthropic-beta'] = beta;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
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

// ---- Draft: plain text generation. No tools attached — nothing is written anywhere. ----
app.post('/api/draft', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing "prompt" string in request body.' });
  }
  try {
    const data = await anthropicRequest({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json(data);
  } catch (err) {
    console.error('draft error:', err.data || err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.data });
  }
});

// ---- Publish: attaches the Atlassian MCP connector server-side. The client sends the ----
// ---- exact, human-reviewed page content; it never sees or controls the OAuth token. ----
app.post('/api/publish', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing "prompt" string in request body.' });
  }
  if (!ATLASSIAN_OAUTH_TOKEN) {
    return res.status(412).json({
      error: 'ATLASSIAN_OAUTH_TOKEN is not configured on this server. See README.md \u2014 ' +
        '"Getting an Atlassian OAuth token" \u2014 before this button will work.',
    });
  }
  try {
    const data = await anthropicRequest(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        mcp_servers: [
          {
            type: 'url',
            url: ATLASSIAN_MCP_URL,
            name: 'atlassian-mcp',
            authorization_token: ATLASSIAN_OAUTH_TOKEN,
          },
        ],
        tools: [{ type: 'mcp_toolset', mcp_server_name: 'atlassian-mcp' }],
      },
      { beta: MCP_BETA_HEADER }
    );
    res.json(data);
  } catch (err) {
    console.error('publish error:', err.data || err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.data });
  }
});

// ---- Placeholder for the next step: Mark43 API integration. ----
// Nothing real here yet — fill in routes/mark43.js once you have Mark43 API
// credentials/docs (e.g. pulling tenant data to cross-reference against a SOW, or
// pushing the generated project summary into a Mark43-side record).
app.use('/api/mark43', require('./routes/mark43'));

app.get('/health', (req, res) => res.json({ ok: true, model: MODEL, hasKey: !!ANTHROPIC_API_KEY }));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Project Summary Builder listening on port ' + PORT);
  console.log('Model: ' + MODEL + ' | Atlassian token configured: ' + !!ATLASSIAN_OAUTH_TOKEN);
});
