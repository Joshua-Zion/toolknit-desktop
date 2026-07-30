const pool = require('../config/db');

async function incrementGlobalUsage(req, res) {
  try {
    await pool.query(
      'INSERT INTO global_usage (id, count) VALUES (1, 1) ON DUPLICATE KEY UPDATE count = count + 1'
    );
    return res.status(200).json({ code: 0, msg: 'ok' });
  } catch (err) {
    console.error('Global usage increment error:', err);
    return res.status(500).json({ code: 500, msg: 'Server error', data: null });
  }
}

async function getGlobalUsage(req, res) {
  try {
    const [rows] = await pool.query('SELECT count FROM global_usage WHERE id = 1');
    const count = rows.length > 0 ? rows[0].count : 0;
    return res.status(200).json({ code: 0, msg: 'ok', data: { count } });
  } catch (err) {
    console.error('Global usage fetch error:', err);
    return res.status(500).json({ code: 500, msg: 'Server error', data: null });
  }
}

module.exports = { incrementGlobalUsage, getGlobalUsage };
