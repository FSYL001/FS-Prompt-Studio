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
await page.getByLabel('LoRA 原始链接').fill('https://civitai.com/models/12345');
await page.getByPlaceholder('例如：@dizzy, watercolor_style').fill('watercolor_style');
await page.getByRole('textbox', { name: '推荐提示词前缀' }).fill('masterpiece, best quality\ncinematic lighting');
await page.getByLabel('推荐负面提示词').fill('lowres, blurry, bad anatomy');
await page.getByPlaceholder('这个 LoRA 适合什么画面、效果如何。').fill('清透的水彩质感，适合人物插画与日常场景。');
await page.getByRole('button', { name: '保存 LoRA' }).click();
await page.getByRole('dialog').locator('.lora-index-item', { hasText: '水彩风格' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'docs/screenshots/lora-notebook.png', animations: 'disabled' });
await page.getByRole('dialog').getByRole('button', { name: '添加到当前作品' }).click();
await page.getByRole('dialog').getByRole('button', { name: '关闭' }).last().click();

// 负面提示词一键复制正向翻译
await page.getByRole('button', { name: '复制正向翻译' }).click();
await page.waitForTimeout(500);

// 右侧小翻译：@触发词原样保留
const quick = page.locator('.quick-translate-card');
await quick.getByRole('textbox', { name: '小翻译输入' }).fill('@dizzy 一个白发女孩');
await quick.getByRole('button', { name: '翻译' }).click();
await page.waitForFunction(
  () => {
    const el = document.querySelector('textarea[aria-label="小翻译结果"]');
    return el && el.value.trim().length > 0;
  },
  undefined,
  { timeout: 45000 },
);

await page.locator('.products-card .btn-primary').click();
await page.locator('.product-card').first().waitFor();
await page.waitForTimeout(4200);

// 关于页
await page.locator('.toolbar-btn', { hasText: '设置' }).click();
const aboutDialog = page.getByRole('dialog');
await aboutDialog.getByRole('button', { name: '关于' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'docs/screenshots/about.png', animations: 'disabled' });
await aboutDialog.getByRole('button', { name: '完成' }).click();

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
