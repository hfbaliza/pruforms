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

Sessions and generated PDFs live in `data/` (gitignored).

## Deploying

This is a plain Node/Express server with file-based storage, so it needs a
host with a **persistent process and disk**:

- **Render / Railway / Fly.io / any VPS** — works as-is (`npm start`), no
  extra services needed. Attach a persistent volume for `data/`.
- **Vercel** — not sufficient on its own: serverless functions have no
  persistent filesystem, so sessions and PDFs would disappear between
  requests. To run on Vercel you would pair it with an external store
  (e.g. Supabase Postgres + Storage, or Vercel Postgres/Blob) and replace
  `lib/store.js` — the storage API (`createSession`, `readSession`,
  `writeSession`, `listSessions`, `deleteSession`, `outputPath`) is the only
  seam that needs swapping.

Environment variables:

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD` | Password for `/admin` (required in production) |
| `ADMIN_EMAIL` | Where new-submission notifications are sent |
| `PUBLIC_URL` | Base URL used in notification links |
| `SMTP_HOST/PORT/USER/PASS/SECURE`, `MAIL_FROM` | Email sending |
| `PORT` | HTTP port (default 3000) |

## API overview

```
GET    /api/forms                    list forms
GET    /api/forms/:id                full definition
POST   /api/sessions {formId}        start an interview
GET    /api/sessions                 list saved sessions
GET    /api/sessions/:id             load a session (resume)
PUT    /api/sessions/:id/answers     autosave one answer {id, value}
POST   /api/sessions/:id/generate    fill + flatten + sign → PDF
GET    /api/sessions/:id/pdf         view/download the PDF (?download=1)
POST   /api/sessions/:id/email {to}  email the PDF (needs SMTP env)
DELETE /api/sessions/:id             discard a session
```
