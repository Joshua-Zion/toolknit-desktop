# ToolKnit API

Node.js + Express + MySQL 后端，提供注册、登录、用户管理、头像上传和每日使用限制。

## 安全特性

- **密码**：bcrypt 加密（cost 12）
- **认证**：JWT，7 天过期
- **防 SQL 注入**：全部使用 mysql2 预处理语句
- **输入校验**：express-validator
- **速率限制**：
  - 注册：每 IP 5 次/小时
  - 登录：每 IP 10 次/5分钟
  - 头像上传：每 IP 20 次/小时
  - 写入操作：每 IP 10 次/分钟
  - 通用 API：每 IP 100 次/分钟
- **头像上传防护**：仅允许 jpg/png/webp，最大 2MB，文件名随机化，按 MIME + 扩展名双重校验

## 部署到宝塔面板

1. 宝塔面板 → 数据库 → 添加数据库（已在 `toolknit` 创建完成）
2. 修改 `.env` 文件中的数据库密码和 JWT 密钥
3. 在宝塔面板 → 网站 → 添加 Node 项目，目录指向 `toolknit-api`，启动命令 `node server.js`
4. 安装依赖：

```bash
npm install
npm run init-db
npm start
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 3000 |
| `BASE_URL` | 外部访问地址（用于头像 URL 拼接，必须设置） |
| `DB_HOST` | 数据库地址 |
| `DB_PORT` | 数据库端口 |
| `DB_NAME` | 数据库名 |
| `DB_USER` | 数据库用户名 |
| `DB_PASSWORD` | 数据库密码 |
| `JWT_SECRET` | JWT 签名密钥（必须修改，至少 16 字符） |
| `JWT_EXPIRES_IN` | Token 过期时间 |
| `DAILY_LIMIT_FREE` | Free 用户每日使用上限 |
| `MAX_AVATAR_SIZE_MB` | 头像最大大小 |
| `CORS_ORIGIN` | CORS 允许的来源（逗号分隔，`*` 表示全部） |
| `R2_ACCOUNT_ID` | Cloudflare R2 账户 ID（upload-r2.js 用） |
| `R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |
| `R2_BUCKET` | R2 桶名，默认 toolknit |
| `ZIP_PATH` | 上传的 zip 文件路径 |

## API 路由

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 注册 | 否 |
| POST | `/api/auth/login` | 登录 | 否 |
| GET | `/api/auth/me` | 获取当前用户信息 | 是 |
| POST | `/api/user/profile` | 更新用户名/头像 URL | 是 |
| POST | `/api/user/change-password` | 修改密码 | 是 |
| POST | `/api/user/usage/increment` | 使用次数 +1 | 是 |
| POST | `/api/upload/avatar` | 上传头像（multipart/form-data, field: avatar） | 是 |
| GET | `/health` | 健康检查 | 否 |

## 请求格式

所有 JSON 请求都带 `Content-Type: application/json`。
认证接口在 `Authorization` 头带 `Bearer <token>`。

## 响应格式

```json
{
  "code": 0,
  "msg": "ok",
  "data": {}
}
```

`code !== 0` 表示错误。
