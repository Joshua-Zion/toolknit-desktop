require('dotenv').config();
const pool = require('../config/db');

async function init() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(64) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar VARCHAR(255) DEFAULT NULL,
        plan ENUM('free', 'pro', 'premium') DEFAULT 'free',
        status ENUM('active', 'banned') DEFAULT 'active',
        daily_count INT UNSIGNED DEFAULT 0,
        daily_date DATE DEFAULT NULL,
        total_count INT UNSIGNED DEFAULT 0,
        token_version INT UNSIGNED DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP DEFAULT NULL,
        INDEX idx_email (email),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) DEFAULT '',
        email VARCHAR(255) DEFAULT '',
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        status ENUM('pending', 'resolved') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database init failed:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

init();
