require('dotenv').config();
const pool = require('../config/db');

async function initGlobalUsage() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_usage (
        id INT PRIMARY KEY DEFAULT 1,
        count BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query('INSERT IGNORE INTO global_usage (id, count) VALUES (1, 0)');
    console.log('global_usage table initialized');
    process.exit(0);
  } catch (err) {
    console.error('Failed to init global_usage:', err);
    process.exit(1);
  }
}

initGlobalUsage();
