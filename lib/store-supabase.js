'use strict';

// Supabase-backed session store for serverless / Vercel deployments.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side key — this
// app enforces its own admin auth, so it uses the service role and the table
// should NOT be exposed via public RLS policies). See supabase/schema.sql.

const { createClient } = require('@supabase/supabase-js');

const TABLE = process.env.SUPABASE_TABLE || 'sessions';

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
    answers: r.answers || {},
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  };
}

async function createSession(formId) {
  const { data, error } = await client()
    .from(TABLE)
    .insert({ form_id: formId, answers: {}, status: 'in_progress' })
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

async function listSessions() {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Supabase list failed: ${error.message}`);
  return (data || []).map(fromRow);
}

async function deleteSession(id) {
  const { error } = await client().from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

module.exports = {
  backend: 'supabase',
  createSession,
  readSession,
  writeSession,
  listSessions,
  deleteSession,
};
