const rateLimit = require('express-rate-limit');

// 通用 API 限流：每个 IP 100 次/分钟
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: 'Too many requests, please slow down', data: null },
  keyGenerator: (req) => req.ip,
});

// 注册限流：每个 IP 5 次/小时（防止批量注册）
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: 'Registration attempts exceeded, try again later', data: null },
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: false,
});

// 登录限流：每个 IP 10 次/5分钟（防止撞库）
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 分钟
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: 'Login attempts exceeded, try again later', data: null },
  keyGenerator: (req) => req.ip,
});

// 上传限流：每个 IP 20 次/小时（防止滥用头像上传）
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: 'Upload quota exceeded, try again later', data: null },
  keyGenerator: (req) => req.ip,
});

// 严格限流：每个 IP 10 次/分钟（用于写入/更新操作）
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: 'Too many write operations, please slow down', data: null },
  keyGenerator: (req) => req.ip,
});

module.exports = {
  apiLimiter,
  registerLimiter,
  loginLimiter,
  uploadLimiter,
  strictLimiter,
};
