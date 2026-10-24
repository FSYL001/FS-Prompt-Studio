// 生成 README 用截图（需要 Vite 与 API 服务已启动）。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
});
const page = await context.newPage();
await mkdir('docs/screenshots', { recursive: true });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '知道了' }).click().catch(() => {});

await page
  .getByRole('textbox', { name: '中文草稿' })
  .fill('一个白发女孩，穿着黑色连衣裙，站在樱花树下，长发，蓝色眼睛，柔和自然光');
await page
  .getByRole('textbox', { name: '中文翻译' })
  .fill('一个白发女孩，穿着黑色连衣裙，站在樱花树下，长发，蓝色眼睛，柔和自然光');
await page.getByRole('textbox', { name: '英文提示词' }).fill(
  'watercolor_style, a white-haired girl, wearing black dress, standing under the cherry blossom tree, long hair, blue eyes, soft natural light',
);

await page.locator('.toolbar-btn', { hasText: 'LoRA' }).click();
await page.getByRole('dialog').getByRole('button', { name: '添加 LoRA' }).click();
await page.getByPlaceholder('例如：清新水彩风').fill('水彩风格');
await page.getByPlaceholder('style_watercolor.safetensors').fill('watercolor_v1.safetensors');
await page.getByPlaceholder('例如：@dizzy, watercolor_style').fill('watercolor_style');
await page.getByPlaceholder('这个 LoRA 适合什么画面、效果如何。').fill('清透的水彩质感，适合人物插画与日常场景。');
await page.getByRole('button', { name: '保存 LoRA' }).click();
await page.getByRole('dialog').locator('.lora-index-item', { hasText: '水彩风格' }).click();
await page.getByRole('dialog').getByRole('button', { name: '添加到当前作品' }).click();
await page.getByRole('dialog').getByRole('button', { name: '关闭' }).last().click();

await page.locator('.products-card .btn-primary').click();
await page.locator('.product-card').first().waitFor();
await page.waitForTimeout(4200);

const style = `
  html { scroll-behavior: auto !important; }
  .topbar { position: static !important; }
  .side-column { position: static !important; max-height: none !important; overflow: visible !important; }
`;
await page.addStyleTag({ content: style });
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: 'docs/screenshots/editor.png', fullPage: true, animations: 'disabled' });

await page.setViewportSize({ width: 390, height: 844 });
await page.addStyleTag({ content: style });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true, animations: 'disabled' });

console.log('文档截图已生成：docs/screenshots/editor.png, docs/screenshots/mobile.png');
await browser.close();
