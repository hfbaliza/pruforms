'use strict';

// Agent authentication: verifies a Google ID token from the browser, and
// issues/verifies our own short-lived-ish signed session token for
// subsequent API calls (the same role the shared ADMIN_PASSWORD token used
// to play, just one per agent instead of one shared value).

const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const JWT_SECRET = process.env.SESSION_JWT_SECRET || 'pruforms-dev-secret-change-me';
const JWT_EXPIRY = '30d';

if (!process.env.SESSION_JWT_SECRET) {
  console.warn(
    'WARNING: SESSION_JWT_SECRET not set — using an insecure default. ' +
    'Set SESSION_JWT_SECRET before agents sign in for real.'
  );
}

let _googleClient;
function googleClient() {
  if (_googleClient) return _googleClient;
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured: set GOOGLE_CLIENT_ID.');
  }
  _googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  return _googleClient;
}

// Verifies a Google ID token and returns {sub, email, name} for a
// verified-email Google account, or throws.
async function verifyGoogleIdToken(idToken) {
  const ticket = await googleClient().verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.email_verified) {
    throw new Error('Google account email is not verified.');
  }
  return { sub: payload.sub, email: payload.email, name: payload.name || payload.email };
}

function signAgentToken(agent) {
  return jwt.sign(
    { agentId: agent.id, email: agent.email, name: agent.name, code: agent.code },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// Returns the decoded {agentId, email, name, code} payload, or null if the
// token is missing, malformed, expired, or signed with a different secret.
function verifyAgentToken(token) {
  if (!token) return null;
  try {
    const { agentId, email, name, code } = jwt.verify(token, JWT_SECRET);
    if (!agentId) return null;
    return { agentId, email, name, code };
  } catch {
    return null;
  }
}

module.exports = { GOOGLE_CLIENT_ID, verifyGoogleIdToken, signAgentToken, verifyAgentToken };
