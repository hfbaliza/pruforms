'use strict';

// Storage selector: use Supabase when configured (serverless / Vercel),
// otherwise fall back to the local file store (development).
//
// The store interface (all async):
//   createSession(formId, agentId) -> session
//   readSession(id)                -> session | null
//   writeSession(session)          -> session
//   listSessions({agentId?})       -> session[]  (newest first)
//   deleteSession(id)              -> void
//
//   createAgent({googleSub, email, name}) -> agent
//   findAgentByGoogleSub(sub)             -> agent | null
//   findAgentByCode(code)                 -> agent | null
//   findAgentById(id)                     -> agent | null
//   listAgents()                          -> agent[]  (for the client-side
//                                            "pick your agent" directory)
//
// Sessions are the single source of truth; generated PDFs are produced on
// demand from the stored answers, so no binary/blob storage is required.
// Every agent only ever sees sessions tagged with their own agent_id — there
// is no company-wide/super-admin view, by design.

module.exports = process.env.SUPABASE_URL
  ? require('./store-supabase')
  : require('./store-file');
