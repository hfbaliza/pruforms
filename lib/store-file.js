'use strict';

// File-backed session store for local development (no Supabase configured).
// Generated PDFs are NOT persisted here — they are regenerated on demand from
// the stored answers, so this store only holds session/agent JSON.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateAgentCode } = require('./agent-code');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const AGENTS_DIR = path.join(DATA_DIR, 'agents');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(AGENTS_DIR, { recursive: true });

function sessionPath(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('invalid session id');
  return path.join(SESSIONS_DIR, `${id}.json`);
}

async function createSession(formId, agentId) {
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    formId,
    agentId: agentId || null,
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

async function listSessions(filter = {}) {
  const all = fs
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
  return filter.agentId ? all.filter((s) => s.agentId === filter.agentId) : all;
}

async function deleteSession(id) {
  const p = sessionPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/* ---------- agents ---------- */

function agentPath(id) {
  return path.join(AGENTS_DIR, `${id}.json`);
}

function readAllAgents() {
  return fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeAgentFile(agent) {
  const p = agentPath(agent.id);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(agent));
  fs.renameSync(tmp, p);
  return agent;
}

async function createAgent({ googleSub, email, name }) {
  const agents = readAllAgents();
  let code = generateAgentCode(name);
  while (agents.some((a) => a.code === code)) code = generateAgentCode(name);
  const agent = {
    id: crypto.randomUUID(),
    googleSub,
    email,
    name,
    code,
    createdAt: new Date().toISOString(),
  };
  return writeAgentFile(agent);
}

async function findAgentByGoogleSub(sub) {
  return readAllAgents().find((a) => a.googleSub === sub) || null;
}

async function findAgentByCode(code) {
  return readAllAgents().find((a) => a.code === code) || null;
}

async function findAgentById(id) {
  const p = agentPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function listAgents() {
  return readAllAgents().sort((a, b) => (a.name > b.name ? 1 : -1));
}

module.exports = {
  backend: 'file',
  createSession,
  readSession,
  writeSession,
  listSessions,
  deleteSession,
  createAgent,
  findAgentByGoogleSub,
  findAgentByCode,
  findAgentById,
  listAgents,
};
