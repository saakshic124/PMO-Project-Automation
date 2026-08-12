# Project Summary Builder

Drop project files (SOW, order form, dealbook, anything) in the browser → give it a title →
Claude drafts a summary you can review (with real rendered tables, not raw markup) → publish
to Confluence when it looks right. The Anthropic key and Confluence credentials live only on
the server; the browser never sees them, and the person using it never has to know a
Confluence space key or ID.

## Architecture

```
Browser (public/index.html)
  → extracts text from uploaded PDFs/xlsx in-browser (pdf.js / xlsx.js / Tesseract OCR)
  → Step 1: POSTs prompt text to /api/draft, renders the result as a real preview
    (tables render as tables, not raw markup) with an editable raw-HTML box underneath
  → Step 2: POSTs the (possibly hand-edited) HTML to /api/publish-page, which writes
    it to Confluence as-is — no re-drafting happens on publish
Backend (server.js, Express)
  → holds ANTHROPIC_API_KEY and Atlassian API token
  → /api/draft         → Claude call, grounded with domain context (see below), no
                          Confluence write
  → /api/publish-page   → { bodyHtml } publishes directly; { prompt } drafts first
                          then publishes (kept for backward compatibility)
  → /api/mark43         → stub, not implemented yet (see "Next: Mark43 integration" below)
  → mark43-glossary.js    → static, hand-maintained notes on patterns/pitfalls seen
                            across customer SOWs/Order Forms (template families,
                            migration entity structure, naming variance to watch for)
  → mark43-confluence.js  → fetches (and caches, 6h TTL) the live Mark43 Product SKU
                            Catalogue Summary and per-state Standard Implementation
                            Guide pages from Confluence, using the same API token as
                            publishing. This is the canonical, current source of truth
                            for SKU codes and state-standard bundles — treated as
                            higher-confidence than anything inferred from customer
                            documents alone. Degrades to a no-op if Confluence isn't
                            configured or a fetch fails; drafting never breaks because
                            of it.
```

Every `/api/draft` call is grounded with both of the above layers, prepended ahead of
the person's own prompt, before it ever reaches Claude. If you add a new agency's
documents to your own review process, update `mark43-glossary.js` directly — no other
code changes needed for that to take effect on the next draft.

## The two-step flow

1. **Generate draft** (Step 1) calls `/api/draft` only — nothing is written to Confluence.
   The result renders inline as an actual formatted preview (headings, real `<table>`
   elements with borders/striping, lists) so you can visually scan the deal snapshot,
   product tables, and roles tables the way they'll actually look on the page.
2. An expandable **"Show/edit raw HTML"** box underneath holds the exact Confluence
   storage-format XHTML that will be published. Edit it directly if you spot something
   wrong — the preview above it won't re-render live off your edits, but whatever is in
   that box is exactly what goes to Confluence.
3. **Publish to Confluence** sends whatever is currently in that box via
   `/api/publish-page` — this does **not** re-run Claude, so an edit you made by hand
   is preserved exactly.
4. **Regenerate draft** re-runs Step 1 from scratch (e.g. after adding another file),
   discarding any manual edits in the raw-HTML box.

## Run locally

Requires Node.js 18+ (for built-in `fetch`).

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY at minimum
npm start
```

Open `http://localhost:3000`.

`/api/draft` works as soon as `ANTHROPIC_API_KEY` is set. Publishing additionally needs
the Atlassian variables below — the same credentials also power the live Confluence
context fetch in `mark43-confluence.js`, so setting them up once gets you both.

## Getting an Atlassian API token

Confluence pages are created (and, for domain context, read) via Confluence's own REST
API, authenticated with a plain Atlassian API token — not Anthropic's MCP connector.
This needs nothing but a web browser: no Terminal, no Node, no OAuth popup flow.

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

**Read access for domain context:** the same token is reused by `mark43-confluence.js` to
read (never write) a handful of internal reference pages — the SKU Catalogue Summary and
per-state Standard Implementation Guide pages — so make sure the account that created the
token has view access to those spaces. If it doesn't, the live-context fetch just fails
silently and drafting falls back to the static glossary alone; nothing breaks, but accuracy
on brand-new SKUs or state bundles will lag until access is granted.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Your real Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-5` | Swap models here, not in the frontend |
| `MAX_TOKENS` | No | `4096` | Response length cap per call |
| `PORT` | No | `3000` | |
| `ATLASSIAN_SITE` | Only for Publish/live context | — | Hostname only, e.g. `mark43.atlassian.net` |
| `ATLASSIAN_EMAIL` | Only for Publish/live context | — | Account that owns the API token |
| `ATLASSIAN_API_TOKEN` | Only for Publish/live context | — | From id.atlassian.com — see above |
| `ATLASSIAN_DEFAULT_SPACE` | Only for Publish | — | Space key or personal space key; the UI never asks for this |

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
I'll wire it in following the same pattern as `/api/draft` and `/api/publish-page` —
credentials stay server-side, the browser only ever sends/receives plain data.

## On accuracy

This is still an LLM reading text, not a deterministic parser — it will occasionally misread
a number, name, or table row, especially on scanned/OCR'd documents. The two-phase draft →
review → publish flow exists specifically so a mistake gets caught in the rendered preview
(or the editable raw-HTML box beneath it) before it reaches Confluence, not after. Treat every
published page as a strong first draft to spot-check against the source documents, not a
guaranteed-correct transcription. `mark43-glossary.js` and the live Confluence context in
`mark43-confluence.js` push accuracy further by grounding drafts in known patterns and
current canonical SKU/bundle data, but neither replaces reading the actual source documents
before hitting publish.
