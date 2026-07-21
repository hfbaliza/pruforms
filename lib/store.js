'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const OUTPUT_DIR = path.join(DATA_DIR, 'output');

for (const dir of [DATA_DIR, SESSIONS_DIR, OUTPUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function sessionPath(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid session id');
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function outputPath(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid session id');
  return path.join(OUTPUT_DIR, `${id}.pdf`);
}

function createSession(formId) {
  const id = crypto.randomUUID();
  const session = {
    id,
    formId,
    answers: {},
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeSession(session);
  return session;
}

function readSession(id) {
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeSession(session) {
  session.updatedAt = new Date().toISOString();
  const p = sessionPath(session.id);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(session));
  fs.renameSync(tmp, p);
}

function listSessions() {
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

function deleteSession(id) {
  for (const p of [sessionPath(id), outputPath(id)]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

module.exports = {
  createSession,
  readSession,
  writeSession,
  listSessions,
  deleteSession,
  outputPath,
};
