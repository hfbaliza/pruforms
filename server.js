'use strict';

const express = require('express');
const path = require('path');

const store = require('./lib/store');
const { generatePdf } = require('./lib/pdf-filler');
const { visibleQuestions } = require('./lib/conditions');
const { GOOGLE_CLIENT_ID, verifyGoogleIdToken, signAgentToken, verifyAgentToken } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- agent auth ----------
// Each admin is an "agent" who signs in with their own Google account
// (see lib/auth.js). There is no shared admin password and no company-wide
// view — every agent only ever sees sessions tagged with their own agent id.
if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn(
    'WARNING: GOOGLE_CLIENT_ID not set — agent sign-in will not work until ' +
    'it is configured. See README for how to create one.'
  );
}

// Decodes the caller's agent session token (if any); does not reject the
// request when absent — routes that need to distinguish "the owning agent"
// from "anyone with the session's unguessable id" (the client's own
// in-progress draft) use this instead of a hard requirement.
function agentFromReq(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verifyAgentToken(token);
}

function isSessionOwner(req, session) {
  const agent = agentFromReq(req);
  return !!agent && !!session.agentId && agent.agentId === session.agentId;
}

function requireAgent(req, res, next) {
  const agent = agentFromReq(req);
  if (!agent) return res.status(401).json({ error: 'Sign in required' });
  req.agent = agent;
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

// Public, non-secret config the client needs before it can render anything
// that talks to Google (the OAuth client id is meant to be public).
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

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

function clientLastName(session) {
  const a = session.answers || {};
  const surname = a.surname || a.po_surname || a.li_surname;
  if (surname) return String(surname).trim();
  const label = clientLabel(session);
  return label ? label.split(/\s+/).pop() : '';
}

function filenameSlug(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// PDF file name: <client last name>-<form name>.pdf, falling back to the
// session id when the client hasn't given a name yet.
function pdfFileName(def, session) {
  const lastName = filenameSlug(clientLastName(session));
  const formName = filenameSlug(def ? def.title : session.formId);
  const base = [lastName, formName].filter(Boolean).join('-');
  return `${base || session.id.slice(0, 8)}.pdf`;
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

// ---------- agents (servicing agents / admins) ----------

// Public directory used by the client-side "select your agent" picker —
// only the fields needed to pick someone by name are exposed.
app.get('/api/agents', wrap(async (req, res) => {
  const agents = await store.listAgents();
  res.json(agents.map((a) => ({ id: a.id, code: a.code, name: a.name })));
}));

// Resolves an agent's personal link code (pruforms.example.com/?a=<code>).
app.get('/api/agents/by-code/:code', wrap(async (req, res) => {
  const agent = await store.findAgentByCode(req.params.code);
  if (!agent) return res.status(404).json({ error: 'Unknown agent link' });
  res.json({ id: agent.id, code: agent.code, name: agent.name });
}));

app.post('/api/auth/google', wrap(async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'Missing idToken' });
  let payload;
  try {
    payload = await verifyGoogleIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Google sign-in failed' });
  }
  let agent = await store.findAgentByGoogleSub(payload.sub);
  if (!agent) {
    agent = await store.createAgent({ googleSub: payload.sub, email: payload.email, name: payload.name });
  }
  const token = signAgentToken(agent);
  res.json({ token, agent: { id: agent.id, code: agent.code, name: agent.name, email: agent.email } });
}));

// ---------- sessions ----------

app.post('/api/sessions', wrap(async (req, res) => {
  const { formId, agentId } = req.body || {};
  if (!definitions[formId]) return res.status(400).json({ error: 'Unknown form' });
  if (!agentId) return res.status(400).json({ error: 'Select your agent before starting a form' });
  const agent = await store.findAgentById(agentId);
  if (!agent) return res.status(400).json({ error: 'Unknown agent' });
  const session = await store.createSession(formId, agent.id);
  res.json(session);
}));

// Agent: the submission list for *their own* clients only — every other
// agent's submissions are invisible, there is no company-wide view.
app.get('/api/sessions', requireAgent, wrap(async (req, res) => {
  const sessions = await store.listSessions({ agentId: req.agent.agentId });
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
  // Once submitted, only the owning agent may change answers.
  if (session.status !== 'in_progress' && !isSessionOwner(req, session)) {
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
  if (session && session.status !== 'in_progress' && !isSessionOwner(req, session)) {
    return res.status(403).json({ error: 'Submitted forms can only be removed by the owning agent.' });
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
  if (!transport) return;
  // Notify the owning agent directly — not a shared company inbox, since
  // agents' submissions are otherwise fully isolated from each other.
  // ADMIN_EMAIL, if set, additionally gets a copy of every submission.
  const agent = session.agentId ? await store.findAgentById(session.agentId).catch(() => null) : null;
  const recipients = [agent ? agent.email : null, process.env.ADMIN_EMAIL || null].filter(Boolean);
  if (!recipients.length) return;
  try {
    const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject: `New form submission: ${def ? def.title : session.formId} — ${who}`,
      text:
        `${who} has submitted a "${def ? def.title : session.formId}" form.\n\n` +
        `Review it in the admin dashboard:\n${base}/admin\n\n` +
        `Submission ID: ${session.id}`,
    });
  } catch (err) {
    console.error('submission notification email failed:', err.message);
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
  const admin = isSessionOwner(req, session);

  if (!admin && session.status !== 'in_progress') {
    return res.status(403).json({ error: 'This form has already been submitted for review.' });
  }

  // Clients must have answered every required client-visible question;
  // the admin finalizes at their own discretion.
  if (!admin) {
    const missing = visibleQuestions(def, session.answers, false)
      .filter(({ question }) => question.required && def.id !== 'policy-amendment')
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
  if (session.status === 'in_progress' && !isSessionOwner(req, session)) {
    return res.status(404).json({ error: 'PDF not generated yet' });
  }
  const def = definitions[session.formId];
  if (!def) return res.status(500).json({ error: 'Definition missing' });
  const { bytes } = await generatePdf(def, session.answers);
  const name = pdfFileName(def, session);
  res.setHeader('Content-Type', 'application/pdf');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(bytes);
}));

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
