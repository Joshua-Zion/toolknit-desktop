const { verify } = require('../utils/jwt');
const pool = require('../config/db');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ code: 401, msg: 'Missing or invalid Authorization header', data: null });
  }

  const token = match[1];
  const payload = verify(token);
  if (!payload || !payload.uid) {
    return res.status(401).json({ code: 401, msg: 'Invalid or expired token', data: null });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [payload.uid]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ code: 401, msg: 'User not found', data: null });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ code: 403, msg: 'Account banned', data: null });
    }
    if (payload.tv !== (user.token_version || 0)) {
      return res.status(401).json({ code: 401, msg: 'Token invalidated, please login again', data: null });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ code: 500, msg: 'Server error', data: null });
  }
}

function publicUser(user) {
  const today = new Date().toISOString().split('T')[0];
  let dailyCount = user.daily_count || 0;
  if (user.daily_date !== today) {
    dailyCount = 0;
  }
  const limit = user.plan === 'free' ? parseInt(process.env.DAILY_LIMIT_FREE || '500', 10) : 999999;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    plan: user.plan,
    daily_count: dailyCount,
    daily_limit: limit,
    remaining: Math.max(0, limit - dailyCount),
    total_count: user.total_count || 0,
    created_at: user.created_at,
  };
}

module.exports = { requireAuth, publicUser };
