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
