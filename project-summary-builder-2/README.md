# Project Summary Builder

Drop project files (SOW, order form, dealbook, anything) in the browser → Claude drafts a
multi-page Confluence project space → you review/edit each draft → publish. The Anthropic API
key lives only on the server; the browser never sees it.

Two independent tools live in the same page:
- **Order Form / SOW / Dealbook reconciliation** — the original offline, regex-based
  cross-checker. No API calls, runs entirely in the browser.
- **Any files → Confluence via Claude** — the new AI-powered flow described below.

## Architecture

```
Browser (public/index.html)
  → extracts text from uploaded PDFs/xlsx in-browser (pdf.js / xlsx.js / Tesseract OCR)
  → POSTs prompt text to this app's own backend
Backend (server.js, Express)
  → holds ANTHROPIC_API_KEY and (optionally) ATLASSIAN_OAUTH_TOKEN
  → /api/draft    → plain Claude call, no tools, nothing written anywhere
  → /api/publish  → Claude call with the Atlassian MCP connector attached server-side
  → /api/mark43   → stub, not implemented yet (see "Next: Mark43 integration" below)
```

## Run locally

Requires Node.js 18+ (for built-in `fetch`).

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY at minimum
npm start
```

Open `http://localhost:3000`.

`/api/draft` works as soon as `ANTHROPIC_API_KEY` is set. `/api/publish` additionally needs
`ATLASSIAN_OAUTH_TOKEN` — see below.

## Getting an Atlassian OAuth token

This is the part that's genuinely more involved than "paste a key in" — Confluence's MCP
server requires an OAuth Bearer token, not a static API key, and the Anthropic MCP connector
doesn't run the OAuth flow for you; you have to obtain the token yourself and hand it over.

**For testing**, the fastest path is Anthropic's own MCP Inspector:

1. `npx @modelcontextprotocol/inspector` (needs Node.js locally)
2. Transport type: **Streamable HTTP**. Server URL: `https://mcp.atlassian.com/v1/mcp`
3. Click **"Need to configure authentication?" → Open Auth Settings → Quick OAuth Flow**,
   authorize against your Atlassian account in the browser window that opens
4. Follow "OAuth Flow Progress" until it says **Authentication complete**, then copy the
   `access_token` value
5. Paste it into `.env` as `ATLASSIAN_OAUTH_TOKEN`

**For production**, that token will expire. You'd want a real Atlassian OAuth 2.0 (3LO) app
registration with a refresh-token flow that re-mints `ATLASSIAN_OAUTH_TOKEN` automatically
instead of a person pasting a token in by hand — that's not built here yet. Flag it if you
want that added; it's a distinct, non-trivial piece of work (Atlassian app registration,
callback endpoint, token storage/refresh).

Until then: no token in `.env` → the "Publish" button returns a clear error telling you it's
not configured, rather than failing silently or against a placeholder value.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Your real Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-5` | Swap models here, not in the frontend |
| `MAX_TOKENS` | No | `4096` | Response length cap per call |
| `PORT` | No | `3000` | |
| `ATLASSIAN_MCP_URL` | No | `https://mcp.atlassian.com/v1/mcp` | |
| `ATLASSIAN_OAUTH_TOKEN` | Only for Publish | — | See above |

## Deploying

Any Node host works since this is a plain Express app with no database. Two easy options:

### Render / Railway / Fly.io (simplest)
1. Push this folder to a GitHub repo
2. Connect the repo, set the build command to `npm install` and start command to `npm start`
3. Add the environment variables from the table above in the host's dashboard (never commit
   `.env`)

### Docker
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```
```bash
docker build -t project-summary-builder .
docker run -p 3000:3000 --env-file .env project-summary-builder
```

## Next: Mark43 integration

`routes/mark43.js` is a stub — intentionally not fake-implemented, since I don't have
Mark43's actual API docs/credentials. Once you have those, likely useful directions:
- Look up an existing tenant/deal by name to cross-reference against a parsed SOW
- Push the generated project summary/timeline into a Mark43-side project record
- Pull product catalog / order form data server-side instead of relying on an uploaded file

Tell me what Mark43's API actually looks like (auth method, base URL, relevant endpoints) and
I'll wire it in following the same pattern as `/api/draft` and `/api/publish` — credentials
stay server-side, the browser only ever sends/receives plain data.

## On accuracy

This is still an LLM reading text, not a deterministic parser — it will occasionally misread
a number, name, or table row, especially on scanned/OCR'd documents. The two-phase draft →
review → publish flow exists specifically so a mistake gets caught in an editable textarea
before it reaches Confluence, not after. Treat every published page as a strong first draft to
spot-check against the source documents, not a guaranteed-correct transcription.
