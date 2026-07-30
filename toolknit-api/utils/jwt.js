const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!SECRET || SECRET === 'CHANGE_ME' || SECRET.length < 16) {
  console.error('FATAL: JWT_SECRET must be set to a random string of at least 16 characters in .env');
  process.exit(1);
}

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { sign, verify };
