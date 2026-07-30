const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { sign } = require('../utils/jwt');
const { publicUser } = require('../middleware/auth');

function error(msg, status = 400) {
  return { code: status, msg, data: null };
}

const registerValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('password').isLength({ min: 6, max: 64 }).withMessage('Password must be 6-64 characters'),
  body('username').trim().isLength({ min: 1, max: 64 }).withMessage('Username must be 1-64 characters')
    .matches(/^[^<>\"'&]+$/).withMessage('Username contains invalid characters'),
];

const loginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('password').isLength({ min: 1, max: 64 }).withMessage('Password required'),
];

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(error(errors.array()[0].msg));
  }

  const { email, password, username } = req.body;

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length > 0) {
      return res.status(409).json(error('Email already registered', 409));
    }

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)',
      [email, hash, username]
    );

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
    const user = rows[0];
    const token = sign({ uid: user.id, tv: user.token_version || 0 });

    return res.status(200).json({
      code: 0,
      msg: 'Registered successfully',
      data: { token, user: publicUser(user) },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json(error('Server error', 500));
  }
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(error(errors.array()[0].msg));
  }

  const { email, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json(error('Invalid email or password', 401));
    }
    if (user.status !== 'active') {
      return res.status(403).json(error('Account banned', 403));
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const token = sign({ uid: user.id, tv: user.token_version || 0 });

    return res.status(200).json({
      code: 0,
      msg: 'Login successful',
      data: { token, user: publicUser(user) },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json(error('Server error', 500));
  }
}

async function me(req, res) {
  return res.status(200).json({
    code: 0,
    msg: 'ok',
    data: { user: publicUser(req.user) },
  });
}

module.exports = { register, login, me, registerValidators, loginValidators };
