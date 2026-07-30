function errorHandler(err, req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    console.error('API Error:', err.message);
  } else {
    console.error('API Error:', err.message, err.stack);
  }
  // 不要暴露 multer 错误细节给客户端
  if (err && err.message && err.message.includes('file size')) {
    return res.status(400).json({ code: 400, msg: 'File too large', data: null });
  }
  if (err && err.message && err.message.includes('file type')) {
    return res.status(400).json({ code: 400, msg: 'Invalid file type', data: null });
  }
  if (err && err.message && err.message.includes('Not allowed by CORS')) {
    return res.status(403).json({ code: 403, msg: 'CORS policy violation', data: null });
  }
  res.status(500).json({ code: 500, msg: 'Server error', data: null });
}

module.exports = errorHandler;
