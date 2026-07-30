require('dotenv').config();
const pool = require('../config/db');

async function initFeedbacks() {
  try {
    await pool.query(`
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
    console.log('feedbacks table initialized');
    process.exit(0);
  } catch (err) {
    console.error('Failed to init feedbacks:', err);
    process.exit(1);
  }
}

initFeedbacks();
