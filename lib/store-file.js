'use strict';

// File-backed session store for local development (no Supabase configured).
// Generated PDFs are NOT persisted here — they are regenerated on demand from
// the stored answers, so this store only holds session JSON.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

function sessionPath(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('invalid session id');
  return path.join(SESSIONS_DIR, `${id}.json`);
}

async function createSession(formId) {
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    formId,
    answers: {},
    status: 'in_progress',
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    reviewedAt: null,
  };
  await writeSession(session);
  return session;
}

async function readSession(id) {
  let p;
  try {
    p = sessionPath(id);
  } catch {
    return null;
  }
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function writeSession(session) {
  session.updatedAt = new Date().toISOString();
  const p = sessionPath(session.id);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(session));
  fs.renameSync(tmp, p);
  return session;
}

async function listSessions() {
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function deleteSession(id) {
  const p = sessionPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = {
  backend: 'file',
  createSession,
  readSession,
  writeSession,
  listSessions,
  deleteSession,
};
