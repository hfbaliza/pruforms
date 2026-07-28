'use strict';

// Supabase-backed session store for serverless / Vercel deployments.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side key — this
// app enforces its own admin auth, so it uses the service role and the table
// should NOT be exposed via public RLS policies). See supabase/schema.sql.

const { createClient } = require('@supabase/supabase-js');
const { generateAgentCode } = require('./agent-code');

const TABLE = process.env.SUPABASE_TABLE || 'sessions';
const AGENTS_TABLE = process.env.SUPABASE_AGENTS_TABLE || 'agents';

// Build the client lazily so a missing/misnamed key surfaces as a clear API
// error at request time instead of crashing the serverless function on cold
// start (which would take down every route, including static pages).
let _client;
function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function fromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    formId: r.form_id,
    agentId: r.agent_id || null,
    answers: r.answers || {},
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  };
}

function agentFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    googleSub: r.google_sub,
    email: r.email,
    name: r.name,
    code: r.agent_code,
    createdAt: r.created_at,
  };
}

async function createSession(formId, agentId) {
  const { data, error } = await client()
    .from(TABLE)
    .insert({ form_id: formId, agent_id: agentId || null, answers: {}, status: 'in_progress' })
    .select()
    .single();
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return fromRow(data);
}

async function readSession(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return fromRow(data);
}

async function writeSession(session) {
  const patch = {
    answers: session.answers,
    status: session.status,
    submitted_at: session.submittedAt || null,
    reviewed_at: session.reviewedAt || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client()
    .from(TABLE)
    .update(patch)
    .eq('id', session.id)
    .select()
    .single();
  if (error) throw new Error(`Supabase write failed: ${error.message}`);
  return fromRow(data);
}

async function listSessions(filter = {}) {
  let q = client().from(TABLE).select('*').order('updated_at', { ascending: false }).limit(1000);
  if (filter.agentId) q = q.eq('agent_id', filter.agentId);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase list failed: ${error.message}`);
  return (data || []).map(fromRow);
}

async function deleteSession(id) {
  const { error } = await client().from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

/* ---------- agents ---------- */

async function createAgent({ googleSub, email, name }) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateAgentCode(name);
    const { data, error } = await client()
      .from(AGENTS_TABLE)
      .insert({ google_sub: googleSub, email, name, agent_code: code })
      .select()
      .single();
    if (!error) return agentFromRow(data);
    // Unique-violation on the code — vanishingly unlikely, but retry with a
    // fresh random suffix rather than fail the sign-in outright.
    if (error.code !== '23505') throw new Error(`Supabase agent insert failed: ${error.message}`);
    lastError = error;
  }
  throw new Error(`Supabase agent insert failed: ${lastError.message}`);
}

async function findAgentByGoogleSub(sub) {
  const { data, error } = await client()
    .from(AGENTS_TABLE)
    .select('*')
    .eq('google_sub', sub)
    .maybeSingle();
  if (error) throw new Error(`Supabase agent read failed: ${error.message}`);
  return agentFromRow(data);
}

async function findAgentByCode(code) {
  const { data, error } = await client()
    .from(AGENTS_TABLE)
    .select('*')
    .eq('agent_code', code)
    .maybeSingle();
  if (error) throw new Error(`Supabase agent read failed: ${error.message}`);
  return agentFromRow(data);
}

async function findAgentById(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await client()
    .from(AGENTS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Supabase agent read failed: ${error.message}`);
  return agentFromRow(data);
}

async function listAgents() {
  const { data, error } = await client().from(AGENTS_TABLE).select('*').order('name');
  if (error) throw new Error(`Supabase agent list failed: ${error.message}`);
  return (data || []).map(agentFromRow);
}

module.exports = {
  backend: 'supabase',
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
