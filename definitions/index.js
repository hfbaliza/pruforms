'use strict';

// Explicitly require every form definition so bundlers (Vercel's dependency
// tracer) include the JSON files in the serverless function. Reading the
// directory with fs at runtime would miss them and crash on cold start.
module.exports = [
  require('./customer-info-update.json'),
  require('./change-servicing-agent.json'),
  require('./policy-amendment.json'),
  require('./reinstatement.json'),
];
