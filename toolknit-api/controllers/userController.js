const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { publicUser } = require('../middleware/auth');

function error(msg, status = 400) {
  return { code: status, msg, data: null };
}

const profileValidators = [
  body('username').optional().trim().isLength({ min: 1, max: 64 }).withMessage('Username must be 1-64 characters')
    .matches(/^[^<>\"'&]+$/).withMessage('Username contains invalid characters'),
  body('avatar').optional().trim().isLength({ max: 255 }).withMessage('Avatar URL too long')
    .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Avatar must be a valid URL'),
];

const changePasswordValidators = [
  body('old_password').isLength({ min: 1, max: 64 }).withMessage('Old password required'),
  body('new_password').isLength({ min: 6, max: 64 }).withMessage('New password must be 6-64 characters'),
];

async function updateProfile(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(error(errors.array()[0].msg));
  }

  const { username, avatar } = req.body;
  const updates = [];
  const params = [];

  if (username !== undefined) {
    updates.push('username = ?');
    params.push(username);
  }
  if (avatar !== undefined) {
    updates.push('avatar = ?');
    params.push(avatar);
  }

  if (updates.length === 0) {
    return res.status(400).json(error('No fields to update'));
  }

  params.push(req.user.id);

  try {
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    return res.status(200).json({
      code: 0,
      msg: 'Profile updated',
      data: { user: publicUser(rows[0]) },
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json(error('Server error', 500));
  }
}

async function changePassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(error(errors.array()[0].msg));
  }

  const { old_password, new_password } = req.body;
  const bcrypt = require('bcryptjs');

  try {
    const match = await bcrypt.compare(old_password, req.user.password_hash);
    if (!match) {
      return res.status(401).json(error('Old password incorrect', 401));
    }
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.user.id]);
    return res.status(200).json({ code: 0, msg: 'Password changed successfully', data: null });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json(error('Server error', 500));
  }
}

async function incrementUsage(req, res) {
  const user = req.user;
  const today = new Date().toISOString().split('T')[0];
  const limit = user.plan === 'free' ? parseInt(process.env.DAILY_LIMIT_FREE || '500', 10) : 999999;

  try {
    if (user.daily_date !== today) {
      // 新的一天：原子重置计数
      await pool.query(
        'UPDATE users SET daily_count = 1, daily_date = ?, total_count = total_count + 1 WHERE id = ?',
        [today, user.id]
      );
    } else {
      // 同一天：原子条件更新，防止并发超出限额
      const [result] = await pool.query(
        'UPDATE users SET daily_count = daily_count + 1, total_count = total_count + 1 WHERE id = ? AND (plan != ? OR daily_count < ?)',
        [user.id, 'free', limit]
      );
      if (result.affectedRows === 0) {
        return res.status(429).json(error('Daily usage limit reached', 429));
      }
    }

    // 重新查询确保返回最新数据
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
    return res.status(200).json({
      code: 0,
      msg: 'ok',
      data: publicUser(rows[0]),
    });
  } catch (err) {
    console.error('Usage increment error:', err);
    return res.status(500).json(error('Server error', 500));
  }
}

module.exports = { updateProfile, changePassword, incrementUsage, profileValidators, changePasswordValidators };
