// 浏览器端快速验收：真实执行翻译、对照、LoRA、成品、刷新持久化与移动端布局。
// 运行：node scripts/e2e-smoke.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
});
const page = await context.newPage();
const draftInput = page.getByRole('textbox', { name: '中文草稿' });
const englishInput = page.getByRole('textbox', { name: '英文提示词' });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
}

async function screenshot(name, fullPage = true) {
  await mkdir('artifacts', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (fullPage) {
    // 让粘性头部参与整页截图，便于人工检查完整页面。
    await page.addStyleTag({
      content: '.topbar{position:static !important} .side-column{position:static !important;max-height:none !important;overflow:visible !important}',
    });
  }
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage, animations: 'disabled' });
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '知道了' }).click();
  await screenshot('01-editor');

  const draft =
    '一个白发女孩，穿着黑色连衣裙，站在樱花树下，长发，蓝色眼睛，柔和自然光';
  await draftInput.fill(draft);

  await page.locator('.translate-bar .btn-primary').click();
  await page.waitForFunction(
    () => {
      const textarea = document.querySelector('textarea[aria-label="英文提示词"]');
      return textarea && textarea.value.trim().length > 0 && !textarea.value.includes('翻译中');
    },
    undefined,
    { timeout: 45000 },
  );
  const english = await englishInput.inputValue();
  console.log('翻译结果:', english);
  assert(/girl/i.test(english), '英文结果应包含 girl');
  assert(/white[- ]?hair/i.test(english), '英文结果应包含 white hair');
  assert(/black dress/i.test(english), '英文结果应包含 black dress');

  await page.getByRole('switch', { name: '开启英文对照翻译' }).click();
  const pairs = page.locator('.aligned-row');
  assert((await pairs.count()) >= 3, '对照翻译应显示多个片段');
  await pairs.first().click();
  await screenshot('02-aligned');

  // 修改英文后重新翻译的方向提示
  await englishInput.fill(`${english}, soft light`);
  const before = await englishInput.inputValue();
  await page.locator('.translate-bar .btn-primary').click();
  await page.getByRole('heading', { name: '选择翻译方向' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /中文 → 英文/ }).click();
  await page.waitForFunction(
    (previous) => {
      const textarea = document.querySelector('textarea[aria-label="英文提示词"]');
      return textarea && textarea.value !== previous && !textarea.value.includes('翻译中');
    },
    before,
    { timeout: 45000 },
  );
  assert((await englishInput.inputValue()).trim().length > 0, '重新翻译后英文不应为空');

  // LoRA 库
  await page.locator('.toolbar-btn', { hasText: 'LoRA' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '添加 LoRA' }).click();
  await page.getByPlaceholder('例如：清新水彩风').fill('水彩风格');
  await page.getByPlaceholder('style_watercolor.safetensors').fill('watercolor_v1.safetensors');
  await page.getByPlaceholder('例如：my_style, watercolor_style').fill('watercolor_style');
  await page.getByRole('button', { name: '保存 LoRA' }).click();
  await page.getByRole('button', { name: '添加到当前' }).click();
  await page.getByRole('button', { name: '关闭' }).last().click();

  const weightInput = page.getByRole('spinbutton', { name: '水彩风格 权重' });
  await weightInput.fill('0.65');
  await weightInput.blur();
  await screenshot('03-lora');

  // 生成成品
  await page.locator('.products-card .btn-primary').click();
  await page.locator('.product-card').first().waitFor({ timeout: 5000 });
  const productText = await page.locator('.product-card .prompt-text').first().innerText();
  assert(/girl/i.test(productText), '成品应包含英文提示词');
  assert((await page.locator('.product-card .lora-chip').count()) > 0, '成品应显示 LoRA');
  await screenshot('04-product');

  // 刷新后持久化
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelector('textarea[aria-label="中文草稿"]')?.value.length > 0,
    undefined,
    { timeout: 10000 },
  );
  assert((await draftInput.inputValue()) === draft, '刷新后草稿应保留');
  assert((await page.locator('.active-lora .lora-name').innerText()) === '水彩风格', '刷新后 LoRA 应保留');
  assert((await weightInput.inputValue()) === '0.65', '刷新后 LoRA 权重应保留');
  assert((await page.locator('.product-card').count()) >= 1, '刷新后成品应保留');

  // 历史记录
  await page.locator('.toolbar-btn', { hasText: '历史' }).click();
  await page.locator('.history-item').first().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '保存当前版本' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.history-item').length >= 2,
    undefined,
    { timeout: 5000 },
  );
  assert((await page.locator('.history-item').count()) >= 2, '历史应包含成品与手动保存版本');
  await screenshot('05-history');
  await page.getByRole('button', { name: '关闭' }).last().click();

  // 设置面板
  await page.locator('.toolbar-btn', { hasText: '设置' }).click();
  await page.getByRole('heading', { name: '设置' }).waitFor();
  await screenshot('06-settings');
  await page.getByRole('button', { name: '完成' }).click();

  // 深色主题截图
  await page.getByRole('button', { name: '切换到深色主题' }).click();
  await page.waitForTimeout(300);
  await screenshot('07-dark');

  // 移动端
  await page.getByRole('button', { name: '切换到浅色主题' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await screenshot('08-mobile');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert(overflow <= 1, `移动端不应横向溢出（当前 ${overflow}px）`);

  assert(pageErrors.length === 0, `页面脚本错误：${pageErrors.join(' | ')}`);
  assert(
    consoleErrors.filter((message) => !message.includes('favicon')).length === 0,
    `控制台错误：${consoleErrors.join(' | ')}`,
  );

  console.log('浏览器验收通过。截图已保存到 artifacts/。');
} catch (error) {
  await screenshot('99-failure').catch(() => {});
  console.error(error);
  if (consoleErrors.length) console.error('Console errors:', consoleErrors);
  if (pageErrors.length) console.error('Page errors:', pageErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
