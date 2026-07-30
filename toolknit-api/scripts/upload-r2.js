import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'toolknit';
const zipPath = process.env.ZIP_PATH || 'toolknit-desktop.zip';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Missing R2 env vars. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const bucket = R2_BUCKET;

async function testConnection() {
  try {
    const cmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 });
    await client.send(cmd);
    console.log('R2 connection OK');
  } catch (e) {
    console.error('R2 connection failed:', e.message);
    throw e;
  }
}

async function upload() {
  await testConnection();
  const fileBuffer = fs.readFileSync(zipPath);
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: 'toolknit-desktop.zip',
    Body: fileBuffer,
    ContentType: 'application/zip',
  });
  await client.send(cmd);
  console.log('Uploaded: https://cdn.24picture.com/toolknit-desktop.zip');
  console.log('Size:', fileBuffer.length, 'bytes');
}

upload().catch(console.error);
