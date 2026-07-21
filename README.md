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

## Client / Admin workflow

- **Clients** use the root link (`/`). They only ever see their own forms
  (tracked in their browser). On submit, the form is locked, a copy is
  downloadable, and the submission lands in the admin queue. Witness and
  agent-signature questions are hidden from clients.
- **Admin** uses `/admin`, protected by `ADMIN_PASSWORD` (set it in the
  environment — the default is `pruforms-admin` and prints a warning). The
  dashboard lists every submission with a **Needs review** badge; opening one
  allows editing *any* answer, filling the admin-only witness/agent
  signature pads, previewing, and **Finalize** — which regenerates the PDF
  and marks the submission *Reviewed*.
- The server enforces the roles: once submitted, edits/regeneration/deletes
  require the admin token; the full session list is admin-only.
- If `SMTP_*` and `ADMIN_EMAIL` are configured, the admin is emailed on each
  new submission (set `PUBLIC_URL` so the email links to your deployment).

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

**1. Supabase — create the table.** In your Supabase project: SQL Editor →
New query → paste the contents of [`supabase/schema.sql`](supabase/schema.sql)
→ Run. This creates a `sessions` table (RLS on, no public policies — the
server uses the service-role key).

**2. Supabase — copy two values.** Project Settings → API:
- **Project URL** → `SUPABASE_URL`
- **`service_role` secret key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret,
  never commit it or expose it to the browser)

**3. Vercel — import the repo** (`hfbaliza/pruforms`). No build step is
needed; `vercel.json` routes every request to the Express app in
`api/index.js`.

**4. Vercel — set Environment Variables** (Project → Settings → Environment
Variables), then redeploy:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ADMIN_PASSWORD` | ✅ | Password for the `/admin` dashboard |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service-role key (server-side) |
| `ADMIN_EMAIL` | – | Emailed when a client submits (needs SMTP) |
| `PUBLIC_URL` | – | Base URL used in notification links |
| `SMTP_HOST/PORT/USER/PASS/SECURE`, `MAIL_FROM` | – | Email sending |

**5. Verify.** Open `https://your-app.vercel.app/api/health` — it should show
`{"ok":true,"backend":"supabase",...}`. Then `/` is the client link to share
and `/admin` is the reviewer dashboard.

See [`.env.example`](.env.example) for the full list. Other persistent-disk
hosts (Render, Railway, Fly.io, a VPS) also work — with no Supabase, they use
the file store; set `SUPABASE_URL` to use Supabase there too.

## API overview

```
GET    /api/forms                    list forms
GET    /api/forms/:id                full definition
POST   /api/sessions {formId}        start an interview
GET    /api/sessions                 list all submissions (admin only)
POST   /api/sessions/lookup {ids}     summaries for the client's own ids
GET    /api/sessions/:id             load a session (resume)
PUT    /api/sessions/:id/answers     autosave answers (locked after submit)
GET    /api/sessions/:id/preview.pdf draft PDF from current answers
POST   /api/sessions/:id/generate    submit (client) / finalize (admin)
GET    /api/sessions/:id/pdf         view/download the PDF (?download=1)
POST   /api/sessions/:id/email {to}  email the PDF (admin, needs SMTP env)
DELETE /api/sessions/:id             discard a session
POST   /api/admin/login {password}   exchange password for the admin token
GET    /api/health                   status + active storage backend
```

Admin API calls require the `x-admin-token` header (the value of
`ADMIN_PASSWORD`).
