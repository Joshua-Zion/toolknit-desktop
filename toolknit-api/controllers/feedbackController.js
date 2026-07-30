const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');

const submitValidators = [
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 64 }),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Invalid email'),
  body('title').trim().isLength({ min: 2, max: 255 }).withMessage('Title required'),
  body('content').trim().isLength({ min: 5, max: 5000 }).withMessage('Content required'),
];

async function submitFeedback(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 400, msg: errors.array()[0].msg, data: null });
  }

  const { name, email, title, content } = req.body;

  try {
    await pool.query(
      'INSERT INTO feedbacks (name, email, title, content) VALUES (?, ?, ?, ?)',
      [name || '', email || '', title, content]
    );
    return res.status(200).json({ code: 0, msg: 'ok' });
  } catch (err) {
    console.error('Feedback submit error:', err);
    return res.status(500).json({ code: 500, msg: 'Server error', data: null });
  }
}

module.exports = { submitFeedback, submitValidators };
