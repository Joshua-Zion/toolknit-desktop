const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { publicUser } = require('../middleware/auth');

function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  const host = req.headers.host || `${req.hostname}:${process.env.PORT || 3000}`;
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  return `${protocol}://${host}`;
}

async function uploadAvatar(req, res) {
  if (!req.file) {
    return res.status(400).json({ code: 400, msg: 'No avatar file uploaded', data: null });
  }

  try {
    // 删除旧头像文件（如果存在且不是默认）
    if (req.user.avatar) {
      try {
        const oldUrl = new URL(req.user.avatar);
        const oldPath = path.join(__dirname, '..', 'uploads', 'avatars', path.basename(oldUrl.pathname));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      } catch (e) {
        // 忽略旧头像 URL 解析失败
      }
    }

    const avatarUrl = `${getBaseUrl(req)}/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = rows[0] || req.user;
    user.avatar = avatarUrl;

    return res.status(200).json({
      code: 0,
      msg: 'Avatar uploaded successfully',
      data: { avatar: avatarUrl, user: publicUser(user) },
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    // 清理本次上传失败的文件
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ code: 500, msg: 'Server error', data: null });
  }
}

module.exports = { uploadAvatar };
