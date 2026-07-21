'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const store = require('./lib/store');
const { generatePdf } = require('./lib/pdf-filler');
const { visibleQuestions } = require('./lib/conditions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- form definitions ----------

const DEFS_DIR = path.join(__dirname, 'definitions');
const definitions = {};
for (const file of fs.readdirSync(DEFS_DIR).filter((f) => f.endsWith('.json'))) {
  const def = JSON.parse(fs.readFileSync(path.join(DEFS_DIR, file), 'utf8'));
  definitions[def.id] = def;
}

app.get('/api/forms', (req, res) => {
  res.json(
    Object.values(definitions).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      questionCount: d.sections.reduce((n, s) => n + s.questions.length, 0),
    }))
  );
});

app.get('/api/forms/:id', (req, res) => {
  const def = definitions[req.params.id];
  if (!def) return res.status(404).json({ error: 'Unknown form' });
  res.json(def);
});

// ---------- sessions ----------

app.post('/api/sessions', (req, res) => {
  const { formId } = req.body || {};
  if (!definitions[formId]) return res.status(400).json({ error: 'Unknown form' });
  const session = store.createSession(formId);
  res.json(session);
});

app.get('/api/sessions', (req, res) => {
  const sessions = store.listSessions().map((s) => ({
    id: s.id,
    formId: s.formId,
    formTitle: definitions[s.formId] ? definitions[s.formId].title : s.formId,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    answered: Object.keys(s.answers || {}).length,
  }));
  res.json(sessions);
});

function loadSession(req, res) {
  let session = null;
  try {
    session = store.readSession(req.params.id);
  } catch {
    /* invalid id */
  }
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

app.get('/api/sessions/:id', (req, res) => {
  const session = loadSession(req, res);
  if (session) res.json(session);
});

app.put('/api/sessions/:id/answers', (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  const body = req.body || {};
  if (body.answers && typeof body.answers === 'object') {
    Object.assign(session.answers, body.answers);
  } else if (typeof body.id === 'string') {
    if (body.value === null || body.value === undefined) {
      delete session.answers[body.id];
    } else {
      session.answers[body.id] = body.value;
    }
  } else {
    return res.status(400).json({ error: 'Provide {id, value} or {answers}' });
  }
  if (session.status === 'completed') session.status = 'in_progress';
  store.writeSession(session);
  res.json({ ok: true, updatedAt: session.updatedAt });
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    store.deleteSession(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid id' });
  }
  res.json({ ok: true });
});

// ---------- PDF generation & export ----------

app.post('/api/sessions/:id/generate', async (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  const def = definitions[session.formId];
  if (!def) return res.status(500).json({ error: 'Definition missing' });

  // server-side required check over the currently-visible questions
  const missing = visibleQuestions(def, session.answers)
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

  try {
    const { bytes, problems } = await generatePdf(def, session.answers);
    fs.writeFileSync(store.outputPath(session.id), bytes);
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    store.writeSession(session);
    res.json({ ok: true, problems, url: `/api/sessions/${session.id}/pdf` });
  } catch (err) {
    console.error('generate failed', err);
    res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  }
});

// Draft preview: fill the PDF with whatever is answered so far, without
// validating required questions or marking the session complete.
app.get('/api/sessions/:id/preview.pdf', async (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  const def = definitions[session.formId];
  if (!def) return res.status(500).json({ error: 'Definition missing' });
  try {
    const { bytes } = await generatePdf(def, session.answers);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  } catch (err) {
    console.error('preview failed', err);
    res.status(500).json({ error: `Preview failed: ${err.message}` });
  }
});

app.get('/api/sessions/:id/pdf', (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  const p = store.outputPath(session.id);
  if (!fs.existsSync(p)) {
    return res.status(404).json({ error: 'PDF not generated yet' });
  }
  const def = definitions[session.formId];
  const name = `${def ? def.id : 'form'}-${session.id.slice(0, 8)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${name}"`);
  res.send(fs.readFileSync(p));
});

app.post('/api/sessions/:id/email', async (req, res) => {
  const session = loadSession(req, res);
  if (!session) return;
  const { to } = req.body || {};
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Valid "to" address required' });
  }
  const p = store.outputPath(session.id);
  if (!fs.existsSync(p)) {
    return res.status(400).json({ error: 'Generate the PDF first' });
  }
  if (!process.env.SMTP_HOST) {
    return res.status(501).json({
      error:
        'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM environment variables.',
    });
  }
  try {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    const def = definitions[session.formId];
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: `Completed form: ${def ? def.title : session.formId}`,
      text: 'Please find the completed form attached.',
      attachments: [
        { filename: `${session.formId}.pdf`, path: p, contentType: 'application/pdf' },
      ],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Sending failed: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`pruforms listening on http://localhost:${PORT}`);
});
