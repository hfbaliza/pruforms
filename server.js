'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const store = require('./lib/store');
const { generatePdf } = require('./lib/pdf-filler');
const { visibleQuestions } = require('./lib/conditions');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- admin auth ----------
// The admin area is protected by a shared password (set ADMIN_PASSWORD in the
// environment). Clients never need it; only /admin and admin API calls do.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pruforms-admin';
if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    'WARNING: ADMIN_PASSWORD not set — using the default "pruforms-admin". ' +
    'Set ADMIN_PASSWORD before sharing the link with clients.'
  );
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAdmin(req) {
  const token = req.get('x-admin-token') || '';
  return timingSafeEqual(token, ADMIN_PASSWORD);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
  next();
}

// Wrap an async route so rejected promises become 500s instead of hanging.
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`${req.method} ${req.path} failed:`, err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/health', (req, res) =>
  res.json({ ok: true, backend: store.backend, forms: Object.keys(definitions).length }));

// ---------- form definitions ----------

const definitions = {};
try {
  for (const def of require('./definitions')) definitions[def.id] = def;
} catch (err) {
  // Never crash the whole function at cold start over definitions — log it so
  // it shows up in the platform logs, and let /api/health report the count.
  console.error('Failed to load form definitions:', err);
}

app.get('/api/forms', (req, res) => {
  res.json(
    Object.values(definitions).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
    }))
  );
});

app.get('/api/forms/:id', (req, res) => {
  const def = definitions[req.params.id];
  if (!def) return res.status(404).json({ error: 'Unknown form' });
  res.json(def);
});

// ---------- session summaries ----------

function clientLabel(session) {
  const a = session.answers || {};
  const name =
    [a.given_name, a.surname].filter(Boolean).join(' ') ||
    [a.po_given, a.po_surname].filter(Boolean).join(' ') ||
    [a.li_given, a.li_surname].filter(Boolean).join(' ') ||
    a.po_name || '';
  return name.trim();
}

function summarize(session) {
  return {
    id: session.id,
    formId: session.formId,
    formTitle: definitions[session.formId] ? definitions[session.formId].title : session.formId,
    client: clientLabel(session),
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    submittedAt: session.submittedAt || null,
    reviewedAt: session.reviewedAt || null,
    answered: Object.keys(session.answers || {}).length,
  };
}

// ---------- sessions ----------

app.post('/api/sessions', wrap(async (req, res) => {
  const { formId } = req.body || {};
  if (!definitions[formId]) return res.status(400).json({ error: 'Unknown form' });
  const session = await store.createSession(formId);
  res.json(session);
}));

// Admin: the full submission list.
app.get('/api/sessions', requireAdmin, wrap(async (req, res) => {
  const sessions = await store.listSessions();
  res.json(sessions.map(summarize));
}));

// Clients: summaries of *their own* sessions (ids kept in their browser).
app.post('/api/sessions/lookup', wrap(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.slice(0, 100) : [];
  const out = [];
  for (const id of ids) {
    try {
      const s = await store.readSession(id);
      if (s) out.push(summarize(s));
    } catch {
      /* skip invalid ids */
    }
  }
  res.json(out);
}));

async function loadSession(req, res) {
  let session = null;
  try {
    session = await store.readSession(req.params.id);
  } catch {
    /* invalid id */
  }
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

app.get('/api/sessions/:id', wrap(async (req, res) => {
  const session = await loadSession(req, res);
  if (session) res.json(session);
}));

app.put('/api/sessions/:id/answers', wrap(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  // Once submitted, only the admin may change answers.
  if (session.status !== 'in_progress' && !isAdmin(req)) {
    return res.status(403).json({
      error: 'This form has been submitted for review and can no longer be edited.',
    });
  }
  const body = req.body || {};
  if (body.answers && typeof body.answers === 'object') {
    for (const [k, v] of Object.entries(body.answers)) {
      if (v === null || v === undefined) delete session.answers[k];
      else session.answers[k] = v;
    }
  } else if (typeof body.id === 'string') {
    if (body.value === null || body.value === undefined) {
      delete session.answers[body.id];
    } else {
      session.answers[body.id] = body.value;
    }
  } else {
    return res.status(400).json({ error: 'Provide {id, value} or {answers}' });
  }
  await store.writeSession(session);
  res.json({ ok: true, updatedAt: session.updatedAt });
}));

app.delete('/api/sessions/:id', wrap(async (req, res) => {
  let session = null;
  try {
    session = await store.readSession(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (session && session.status !== 'in_progress' && !isAdmin(req)) {
    return res.status(403).json({ error: 'Submitted forms can only be removed by the admin.' });
  }
  try {
    await store.deleteSession(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid id' });
  }
  res.json({ ok: true });
}));

// ---------- email ----------

function mailTransport() {
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function notifyAdminOfSubmission(session) {
  const def = definitions[session.formId];
  const who = clientLabel(session) || 'A client';
  console.log(`[submission] ${who} submitted "${def ? def.title : session.formId}" (${session.id})`);
  const transport = mailTransport();
  if (!transport || !process.env.ADMIN_EMAIL) return;
  try {
    const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `New form submission: ${def ? def.title : session.formId} — ${who}`,
      text:
        `${who} has submitted a "${def ? def.title : session.formId}" form.\n\n` +
        `Review it in the admin dashboard:\n${base}/admin\n\n` +
        `Submission ID: ${session.id}`,
    });
  } catch (err) {
    console.error('admin notification email failed:', err.message);
  }
}

// ---------- PDF generation & export ----------
// PDFs are always regenerated from the stored answers, so no binary storage
// is needed and the document always reflects the latest (admin-reviewed) data.

app.get('/api/sessions/:id/preview.pdf', wrap(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const def = definitions[session.formId];
  if (!def) return res.status(500).json({ error: 'Definition missing' });
  const { bytes } = await generatePdf(def, session.answers);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(bytes);
}));

app.post('/api/sessions/:id/generate', wrap(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const def = definitions[session.formId];
  if (!def) return res.status(500).json({ error: 'Definition missing' });
  const admin = isAdmin(req);

  if (!admin && session.status !== 'in_progress') {
    return res.status(403).json({ error: 'This form has already been submitted for review.' });
  }

  // Clients must have answered every required client-visible question;
  // the admin finalizes at their own discretion.
  if (!admin) {
    const missing = visibleQuestions(def, session.answers, false)
      .filter(({ question }) => question.required)
      .filter(({ question }) => {
        const v = session.answers[question.id];
        return v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0);
      })
      .map(({ question }) => question.id);
    if (missing.length) {
      return res.status(400).json({ error: 'Missing required answers', missing });
    }
  }

  // Generate once to validate it renders and to surface any mapping problems.
  const { problems } = await generatePdf(def, session.answers);
  if (admin) {
    session.status = 'reviewed';
    session.reviewedAt = new Date().toISOString();
  } else {
    session.status = 'submitted';
    session.submittedAt = new Date().toISOString();
  }
  await store.writeSession(session);
  if (!admin) notifyAdminOfSubmission(session);
  res.json({ ok: true, status: session.status, problems, url: `/api/sessions/${session.id}/pdf` });
}));

app.get('/api/sessions/:id/pdf', wrap(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  if (session.status === 'in_progress' && !isAdmin(req)) {
    return res.status(404).json({ error: 'PDF not generated yet' });
  }
  const def = definitions[session.formId];
  if (!def) return res.status(500).json({ error: 'Definition missing' });
  const { bytes } = await generatePdf(def, session.answers);
  const name = `${def.id}-${session.id.slice(0, 8)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(bytes);
}));

app.post('/api/sessions/:id/email', wrap(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const { to } = req.body || {};
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Valid "to" address required' });
  }
  if (session.status === 'in_progress') {
    return res.status(400).json({ error: 'Generate the PDF first' });
  }
  const transport = mailTransport();
  if (!transport) {
    return res.status(501).json({
      error:
        'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM environment variables.',
    });
  }
  const def = definitions[session.formId];
  const { bytes } = await generatePdf(def, session.answers);
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Completed form: ${def ? def.title : session.formId}`,
    text: 'Please find the completed form attached.',
    attachments: [
      { filename: `${session.formId}.pdf`, content: bytes, contentType: 'application/pdf' },
    ],
  });
  res.json({ ok: true });
}));

// ---------- admin login ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!timingSafeEqual(password || '', ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  // The password itself doubles as the API token; it never leaves this
  // deployment and can be rotated by changing ADMIN_PASSWORD.
  res.json({ ok: true, token: ADMIN_PASSWORD });
});

// Start a server only when run directly; on Vercel the app is exported and
// invoked as a serverless function (see api/index.js).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`pruforms listening on http://localhost:${PORT}`);
    console.log(`storage backend: ${store.backend}`);
    console.log(`client link:  http://localhost:${PORT}/`);
    console.log(`admin panel:  http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
