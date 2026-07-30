require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const uploadRoutes = require('./routes/upload');
const usageRoutes = require('./routes/usage');
const feedbackRoutes = require('./routes/feedback');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全头部
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  } : false,
  noSniff: true,
  frameguard: { action: 'deny' },
}));

// CORS
const corsOrigin = process.env.CORS_ORIGIN || '*';
const allowedOrigins = corsOrigin.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (allowedOrigins.includes('*') || !origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 解析 JSON
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// 静态资源：头像目录
app.use('/uploads/avatars', apiLimiter, express.static(path.join(__dirname, 'uploads', 'avatars'), {
  maxAge: '1d',
  dotfiles: 'deny',
  index: false,
}));

// 通用限流
app.use(apiLimiter);

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({ code: 0, msg: 'ok', data: { time: new Date().toISOString() } });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/feedback', feedbackRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ code: 404, msg: 'Not found', data: null });
});

// 全局错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`ToolKnit API running on port ${PORT}`);
});
