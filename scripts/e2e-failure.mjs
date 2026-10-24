// 翻译失败时不得丢原文 / 不得覆盖已编辑内容的浏览器验收。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8787';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/';

async function setProvider(body) {
  const response = await fetch(`${API}/api/translate/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`设置翻译服务失败：${response.status}`);
}

await setProvider({
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
await mkdir('artifacts', { recursive: true });

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '知道了' }).click().catch(() => {});
  const draftInput = page.getByRole('textbox', { name: '中文草稿' });
  const zhInput = page.getByRole('textbox', { name: '中文翻译' });
  const englishInput = page.getByRole('textbox', { name: '英文提示词' });

  const draft = '一个白发女孩，穿着黑色连衣裙';
  await draftInput.fill(draft);
  await page.locator('.translate-bar .btn-primary').click();
  await page.locator('.inline-error').waitFor({ timeout: 15000 });
  const errorText = await page.locator('.inline-error').innerText();
  if (!/API Key|密钥/i.test(errorText)) throw new Error(`错误提示不应是技术报错：${errorText}`);
  if ((await draftInput.inputValue()) !== draft) throw new Error('翻译失败后草稿被修改');
  if ((await zhInput.inputValue()) !== draft) throw new Error('翻译失败后中文翻译框被修改');
  if ((await englishInput.inputValue()).trim() !== '') throw new Error('翻译失败却写入了英文');
  await page.screenshot({ path: 'artifacts/30-translate-failure.png' });

  await englishInput.fill('keep me');
  await page.locator('.translate-bar .btn-primary').click();
  await page.getByRole('heading', { name: '选择翻译方向' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /中文 → 英文/ }).click();
  await page.waitForTimeout(1200);
  if ((await englishInput.inputValue()) !== 'keep me') {
    throw new Error('翻译失败后已有英文被覆盖');
  }
  const restoreVisible = await page
    .getByRole('button', { name: '恢复翻译前', exact: true })
    .isVisible();
  if (!restoreVisible) throw new Error('失败后应保留恢复入口');
  await page.screenshot({ path: 'artifacts/31-failure-keeps-edit.png' });
  console.log('失败保护验收通过：草稿与已有英文均未被覆盖。');
} finally {
  await setProvider({
    provider: 'google-free',
    baseUrl: '',
    model: '',
    timeoutMs: 20000,
    apiKey: '',
  });
  await browser.close();
}
