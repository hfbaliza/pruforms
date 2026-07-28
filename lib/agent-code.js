'use strict';

// Short, URL-safe codes used in an agent's personal client link
// (pruforms.example.com/?a=<code>) — human-readable prefix from their name
// plus a random suffix so codes don't collide without a database round trip.

const crypto = require('crypto');

function baseSlug(name) {
  const slug = String(name || 'agent')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || 'agent';
}

function generateAgentCode(name) {
  return `${baseSlug(name)}-${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = { generateAgentCode };
