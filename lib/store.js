'use strict';

// Storage selector: use Supabase when configured (serverless / Vercel),
// otherwise fall back to the local file store (development).
//
// The store interface (all async):
//   createSession(formId) -> session
//   readSession(id)       -> session | null
//   writeSession(session) -> session
//   listSessions()        -> session[]  (newest first)
//   deleteSession(id)     -> void
//
// Sessions are the single source of truth; generated PDFs are produced on
// demand from the stored answers, so no binary/blob storage is required.

module.exports = process.env.SUPABASE_URL
  ? require('./store-supabase')
  : require('./store-file');
