import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const dir = '/private/tmp/claudio-ncm-login';
const statePath = join(dir, 'netease-login-key.json');
const baseUrl = process.env.NCM_BASE_URL || 'http://127.0.0.1:3001';

mkdirSync(dir, { recursive: true });

const keyRes = await fetch(`${baseUrl}/login/qr/key?timestamp=${Date.now()}`);
const keyJson = await keyRes.json();
const key = keyJson.data?.unikey;

if (!key) {
  console.error(`二维码 key 生成失败: ${JSON.stringify(keyJson)}`);
  process.exit(1);
}

const qrRes = await fetch(`${baseUrl}/login/qr/create?key=${encodeURIComponent(key)}&platform=web&qrimg=true&timestamp=${Date.now()}&ua=pc`);
const qrJson = await qrRes.json();
const qrimg = qrJson.data?.qrimg;
const match = qrimg?.match(/^data:image\/(png|jpeg);base64,(.+)$/);

if (!match) {
  console.error(`二维码图片生成失败: ${JSON.stringify(qrJson)}`);
  process.exit(1);
}

const imagePath = join(dir, `netease-login-qr-${Date.now()}.png`);
writeFileSync(imagePath, Buffer.from(match[2], 'base64'));
writeFileSync(statePath, JSON.stringify({ key, imagePath, createdAt: new Date().toISOString() }, null, 2));
console.log(imagePath);
