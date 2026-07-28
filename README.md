# Pru Forms — Electronic Form Filler

Turns four Pru Life UK PDF forms into clean electronic forms, filled page by
page. Each page groups one topic (e.g. *Details of Policyowner*, *Addresses*,
*Signatures*), with typed inputs, a signature drawing pad, automatic saving,
a live **document preview** showing the answers placed on the official PDF,
a review step, and a professionally filled, flattened PDF at the end.

While filling, the toolbar offers **← All forms** (exit — keep or discard the
answers if the wrong form was opened), **💾 Save**, and **👁 Preview PDF**
(side-by-side view of the real form with current answers inserted). Answers
autosave on every change, so an unfinished form can always be resumed from
the home page.

## Client / Agent (admin) workflow

Every admin is an **agent** — a Pru Life UK servicing agent with their own
Google-authenticated account. There's no shared admin password and no
company-wide view: each agent only ever sees the submissions tagged as
theirs. Signing in with Google for the first time creates that agent's
account automatically (open self-service, no invite step).

- **Clients** use the root link (`/`). The first time a client visits, they
  either arrive via an agent's personal link (`/?a=<agent-code>`, which tags
  every form they start) or pick their agent by name from a directory shown
  on first visit. That choice is remembered in their browser. Clients only
  ever see their own forms. On submit, the form is locked, a copy is
  downloadable, and the submission lands in that agent's queue. Witness and
  agent-signature questions are hidden from clients.
- **Agents** use `/admin` and sign in with Google. The dashboard lists their
  own submissions with a **Needs review** badge; opening one allows editing
  *any* answer, filling the admin-only witness/agent signature pads,
  previewing, and **Finalize** — which regenerates the PDF and marks the
  submission *Reviewed*. The dashboard also shows the agent's personal
  client link so they can share it.
- The server enforces the roles: once submitted, edits/regeneration/deletes
  require being signed in as the owning agent; the submission list only ever
  returns that agent's own sessions.
- If `SMTP_*` is configured, the owning agent is emailed on each new
  submission; set `ADMIN_EMAIL` too to additionally CC a shared company
  inbox on every submission across all agents (set `PUBLIC_URL` so the email
  links to your deployment).

## Supported forms

| Form | Fill strategy |
|------|---------------|
| Policy Amendment Request (Individual Policyowner) | AcroForm fields + overlay for 2 boxes the source PDF left non-fillable |
| Customer Information Update | AcroForm fields |
| Change of Servicing Agent | AcroForm fields |
| Reinstatement Form (Individual Policyowner) | Full coordinate overlay (source PDF has no fillable fields) |

## Run

```bash
npm install
npm start          # http://localhost:3000
```

Optional email export — configure SMTP via environment variables:

```bash
SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USER=me SMTP_PASS=secret \
MAIL_FROM="Forms <forms@example.com>" npm start
```

## How it works

- `definitions/*.json` — one file per form: ordered sections and questions,
  each with an input type (`text`, `number`, `date`, `email`, `phone`,
  `dropdown`, `radio`, `checkbox`, `checkboxes`, `textarea`, `signature`),
  conditional logic (`showIf`), and PDF mapping actions:
  - `text` / `lines` / `comb` — fill AcroForm text fields (incl. per-character
    box rows and two-line wrapping)
  - `check` / `checkEach` / `radio` — tick checkboxes and radio groups
  - `draw` / `drawWrap` / `drawComb` / `drawX` — draw text or tick marks at
    coordinates (for pages without fillable fields)
  - `image` — place a drawn signature (PNG) into a signature box
- `lib/pdf-filler.js` — applies mappings with pdf-lib, regenerates
  appearances, **flattens** the form, then draws signatures/overlays on top.
- `server.js` — Express API: forms, sessions (auto-saved answers, resume
  later), PDF generation, download/print/email endpoints.
- `public/` — dependency-free single-page app: page-per-section form UI with
  progress steps, live PDF preview panel (`/api/sessions/:id/preview.pdf`),
  signature pad (Clear/Undo/Redraw), save/exit controls, review-and-edit
  step, and export actions (download, print, save, email).

## Storage

Sessions are the single source of truth; **PDFs are regenerated on demand**
from the stored answers, so no binary/blob storage is needed. Storage is
pluggable (`lib/store.js` selects the backend):

- **No `SUPABASE_URL` set** → local file store under `data/` (gitignored) —
  used for development.
- **`SUPABASE_URL` set** → Supabase Postgres (`lib/store-supabase.js`) —
  used in serverless / Vercel deployments.

## Deploying to Vercel + Supabase

**1. Supabase — create the tables.** In your Supabase project: SQL Editor →
New query → paste the contents of [`supabase/schema.sql`](supabase/schema.sql)
→ Run. This creates `sessions` and `agents` tables (RLS on, no public
policies — the server uses the service-role key). Already have an older
`sessions` table without `agent_id`? Run just the migration snippet at the
bottom of that file instead.

**2. Supabase — copy two values.** Project Settings → API:
- **Project URL** → `SUPABASE_URL`
- **`service_role` secret key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret,
  never commit it or expose it to the browser)

**3. Google — create an OAuth Client ID.** In the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials):
create an OAuth 2.0 Client ID, application type **Web application**, and add
your deployed URL (and `http://localhost:3000` for local dev) under
**Authorized JavaScript origins**. Copy the client ID → `GOOGLE_CLIENT_ID`
(this value is public, safe to expose to the browser). Also generate a
random secret for `SESSION_JWT_SECRET`, e.g. `openssl rand -hex 32`.

**4. Vercel — import the repo** (`hfbaliza/pruforms`). No build step is
needed; `vercel.json` routes every request to the Express app in
`api/index.js`.

**5. Vercel — set Environment Variables** (Project → Settings → Environment
Variables), then redeploy:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_CLIENT_ID` | ✅ | OAuth client id agents sign in with |
| `SESSION_JWT_SECRET` | ✅ | Signs each agent's session token |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service-role key (server-side) |
| `ADMIN_EMAIL` | – | CC'd on every submission across all agents (needs SMTP) |
| `PUBLIC_URL` | – | Base URL used in notification links |
| `SMTP_HOST/PORT/USER/PASS/SECURE`, `MAIL_FROM` | – | Email sending |

**6. Verify.** Open `https://your-app.vercel.app/api/health` — it should show
`{"ok":true,"backend":"supabase",...}`. Then `/` is the client link to share
and `/admin` is where agents sign in. The first agent to sign in with Google
there gets their own account and personal client link automatically.

See [`.env.example`](.env.example) for the full list. Other persistent-disk
hosts (Render, Railway, Fly.io, a VPS) also work — with no Supabase, they use
the file store; set `SUPABASE_URL` to use Supabase there too.

## API overview

```
GET    /api/forms                      list forms
GET    /api/forms/:id                  full definition
GET    /api/agents                     public directory (client "pick your agent")
GET    /api/agents/by-code/:code       resolve an agent's personal link
POST   /api/auth/google {idToken}      sign in (or auto-register) an agent
POST   /api/sessions {formId,agentId}  start an interview, tagged to an agent
GET    /api/sessions                   list the signed-in agent's own submissions
POST   /api/sessions/lookup {ids}      summaries for the client's own ids
GET    /api/sessions/:id               load a session (resume)
PUT    /api/sessions/:id/answers       autosave answers (locked after submit)
GET    /api/sessions/:id/preview.pdf   draft PDF from current answers
POST   /api/sessions/:id/generate      submit (client) / finalize (owning agent)
GET    /api/sessions/:id/pdf           view/download the PDF (?download=1)
POST   /api/sessions/:id/email {to}    email the PDF (owning agent, needs SMTP env)
DELETE /api/sessions/:id               discard a session
GET    /api/config                     public config (Google client id)
GET    /api/health                     status + active storage backend
```

Agent-only calls require an `Authorization: Bearer <token>` header, where
`<token>` is the value returned from `/api/auth/google` after signing in.
