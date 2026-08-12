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

## Getting an Atlassian API token

Confluence pages are created via Confluence's own REST API, authenticated with a plain
Atlassian API token — not Anthropic's MCP connector. This needs nothing but a web browser:
no Terminal, no Node, no OAuth popup flow. (An earlier version of this app used the MCP
connector's OAuth path, which requires running a local tool that briefly listens on
`localhost` to catch the OAuth redirect — not viable on a locked-down machine with no
Terminal access. The API-token approach sidesteps that entirely.)

1. Go to **id.atlassian.com/manage-profile/security/api-tokens** (log in with your Mark43
   Atlassian account)
2. **Create API token** → give it a label like "Project Summary Builder" → copy the token
   (you won't be able to see it again)
3. In `.env` (or your host's environment variables), set:
   - `ATLASSIAN_SITE` — just the hostname, e.g. `mark43.atlassian.net` (no `https://`, no `/wiki`)
   - `ATLASSIAN_EMAIL` — the email address for the account that created the token
   - `ATLASSIAN_API_TOKEN` — the token you just copied

That's it — no expiring OAuth token to babysit. If the token is ever compromised or you leave
the team, revoke it from the same page and generate a new one.

**Space key vs. space ID:** the app accepts either a space key (e.g. `PMO`) or a personal
space key (e.g. `~712020abc...`) in the "Confluence space key" field — the server resolves it
to Confluence's internal numeric space ID automatically before creating the page.


## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Your real Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-5` | Swap models here, not in the frontend |
| `MAX_TOKENS` | No | `4096` | Response length cap per call |
| `PORT` | No | `3000` | |
| `ATLASSIAN_SITE` | Only for Publish | — | Hostname only, e.g. `mark43.atlassian.net` |
| `ATLASSIAN_EMAIL` | Only for Publish | — | Account that owns the API token |
| `ATLASSIAN_API_TOKEN` | Only for Publish | — | From id.atlassian.com — see above |

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
