'use strict';

// Vercel serverless entry point. All routes are rewritten to this function
// (see vercel.json); the Express app in ../server.js handles them, including
// static assets, the client UI, the admin UI, and the API.
module.exports = require('../server');
