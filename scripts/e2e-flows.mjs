// 进一步验收：片段编辑、多个 LoRA、成品编辑/收藏/删除、历史对比与恢复、ComfyUI 导出、备份导出与导入预览。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1360, height: 960 },
  locale: 'zh-CN',
  acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

const draftInput = page.getByRole('textbox', { name: '中文草稿' });
const englishInput = page.getByRole('textbox', { name: '英文提示词' });
const dialog = page.getByRole('dialog');

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
}

async function shot(name) {
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/${name}.png`, animations: 'disabled' });
}

async function addLora(name, file, trigger) {
  await page.locator('.toolbar-btn', { hasText: 'LoRA' }).click();
  await dialog.getByRole('button', { name: '添加 LoRA' }).click();
  await page.getByPlaceholder('例如：清新水彩风').fill(name);
  await page.getByPlaceholder('style_watercolor.safetensors').fill(file);
  await page.getByPlaceholder('例如：@dizzy, watercolor_style').fill(trigger);
  await page.getByRole('button', { name: '保存 LoRA' }).click();
  await dialog.locator('.lora-index-item', { hasText: name }).click();
  await dialog.getByRole('button', { name: '添加到当前作品' }).click();
  await dialog.getByRole('button', { name: '关闭' }).last().click();
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('.onboarding-title').waitFor();
  await shot('10-onboarding');
  await page.getByRole('button', { name: '知道了' }).click();

  const draft = '一个白发女孩，穿着黑色连衣裙，站在樱花树下，长发，蓝色眼睛';
  await draftInput.fill(draft);
  await page.locator('.translate-bar .btn-primary').click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector('textarea[aria-label="英文提示词"]');
      return el && el.value.trim().length > 0;
    },
    undefined,
    { timeout: 45000 },
  );

  // 片段模式：点单词/单句加权，括号写回英文提示词
  await page.getByRole('button', { name: '片段', exact: true }).click();
  await page.locator('.weighted-editor').waitFor();
  await page.getByRole('button', { name: /加权/ }).click();
  await page.locator('.weighted-unit').first().click();
  await page.getByRole('button', { name: '文本', exact: true }).click();
  const weightedEnglish = await englishInput.inputValue();
  assert(/\([^()]+\)/.test(weightedEnglish), '点击加权后英文提示词中应出现圆括号');
  await shot('11-segments');

  // 多个 LoRA 与不同权重
  await addLora('水彩风格', 'watercolor_v1.safetensors', 'watercolor_style');
  await addLora('光影增强', 'lighting_v2.safetensors', 'cinematic_light');

  // 打开 LoRA 记事本，点击 @触发词 加入英文提示词
  await page.locator('.toolbar-btn', { hasText: 'LoRA' }).click();
  await dialog.locator('.lora-index-item', { hasText: '水彩风格' }).click();
  await dialog.locator('.trigger-pill', { hasText: '@watercolor_style' }).click();
  await dialog.getByRole('button', { name: '关闭' }).last().click();
  assert(
    (await englishInput.inputValue()).includes('@watercolor_style'),
    '点击 @触发词 后应加入英文提示词',
  );

  await page.getByRole('spinbutton', { name: '水彩风格 权重' }).fill('0.65');
  await page.getByRole('spinbutton', { name: '光影增强 权重' }).fill('1.1');
  await page.getByRole('spinbutton', { name: '光影增强 权重' }).blur();
  assert((await page.locator('.active-lora').count()) === 2, '应同时使用两个 LoRA');

  // 生成多 LoRA 成品
  await page.locator('.products-card .btn-primary').click();
  await page.locator('.product-card').first().waitFor();
  assert((await page.locator('.product-card .lora-chip').count()) === 2, '成品应包含两个 LoRA');
  await shot('12-multi-lora');

  // 编辑成品
  await page.getByRole('button', { name: '编辑成品' }).first().click();
  await dialog.getByPlaceholder('例如：白发女孩 · 樱花树下').fill('白发女孩 · 双 LoRA');
  await dialog.getByPlaceholder('记录种子、参考图、修改原因等').fill('验收备注');
  await dialog.getByRole('button', { name: '保存修改' }).click();
  await page.locator('.product-name', { hasText: '白发女孩 · 双 LoRA' }).waitFor();

  // 收藏成品
  await page.getByRole('button', { name: '收藏成品' }).first().click();
  await page.getByRole('button', { name: '取消收藏' }).first().waitFor();

  // 历史：保存两个版本并对比
  await page.locator('.toolbar-btn', { hasText: '历史' }).click();
  await page.getByRole('button', { name: '保存当前版本' }).click();
  await page.waitForTimeout(300);
  await dialog.getByRole('button', { name: '关闭' }).last().click();

  await draftInput.fill(`${draft}，微笑`);
  await page.locator('.toolbar-btn', { hasText: '历史' }).click();
  await page.getByRole('button', { name: '保存当前版本' }).click();
  await page.waitForTimeout(300);
  const checks = page.locator('.history-check input');
  assert((await checks.count()) >= 2, '历史应至少有两条');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole('button', { name: '对比选中' }).click();
  await page.getByRole('heading', { name: '版本对比' }).waitFor();
  await dialog.getByRole('button', { name: '中文草稿' }).click();
  const diffText = await page.locator('.diff-view').innerText();
  assert(diffText.includes('微笑'), '版本对比应显示新增内容');
  await shot('13-compare');
  await dialog.getByRole('button', { name: '关闭' }).last().click();
  await page.locator('.toolbar-btn', { hasText: '历史' }).click();
  await page.locator('.history-item').first().waitFor();

  // 恢复较早版本
  await page.locator('.history-item').nth(1).getByRole('button', { name: '恢复' }).click();
  await page.getByRole('button', { name: '恢复版本' }).click();
  await page.waitForTimeout(500);
  assert(!(await draftInput.inputValue()).includes('微笑'), '恢复旧版本后草稿应还原');

  // 仅保留一个 LoRA，生成用于 ComfyUI 导出的成品
  const removeButtons = page.getByRole('button', { name: '从当前作品移除' });
  await removeButtons.last().click();

  // 设置：创建 ComfyUI 工作流模板
  await page.locator('.toolbar-btn', { hasText: '设置' }).click();
  await dialog.getByRole('button', { name: 'ComfyUI 工作流' }).click();
  await dialog.getByRole('button', { name: '添加模板' }).click();
  await dialog.getByRole('button', { name: '填入示例模板' }).click();
  await dialog.getByRole('button', { name: '保存模板' }).click();
  await dialog.getByText('示例：基础文生图').waitFor();
  await shot('14-workflow-settings');
  await dialog.getByRole('button', { name: '完成' }).click();

  await page.getByRole('button', { name: '生成成品' }).click();
  await page.waitForTimeout(500);

  // ComfyUI 工作流导出
  await page.locator('.product-card').first().locator('.export-summary').click();
  await page.getByRole('button', { name: 'ComfyUI 工作流…' }).click();
  await page.locator('.workflow-preview').waitFor();
  const workflowJson = await page.locator('.workflow-preview').innerText();
  assert(workflowJson.includes('LoraLoader'), '工作流应包含 LoraLoader');
  assert(workflowJson.includes('watercolor_v1.safetensors'), '工作流应写入 LoRA 文件名');
  assert(!workflowJson.includes('<lora:'), '工作流文本不应保留 SD LoRA 语法');
  await page.waitForTimeout(500);
  await shot('15-workflow-export');
  await dialog.getByRole('button', { name: '关闭' }).last().click();

  // 数据导出与导入预览
  await page.locator('.toolbar-btn', { hasText: '设置' }).click();
  await dialog.getByRole('button', { name: '数据与备份' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整备份（JSON）' }).click();
  const download = await downloadPromise;
  const backupPath = path.resolve('artifacts/backup-check.json');
  await download.saveAs(backupPath);
  assert(download.suggestedFilename().endsWith('.json'), '备份文件应为 JSON');
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await page.locator('.import-preview').waitFor();
  const previewText = await page.locator('.import-preview').innerText();
  assert(previewText.includes('数据校验通过'), '导入前应通过校验并显示预览');
  await shot('16-import-preview');
  await dialog.getByRole('button', { name: '开始导入' }).click();
  await page.waitForTimeout(1000);
  assert(
    (await page.locator('.settings-layout').count()) === 0,
    '导入完成后设置面板应关闭',
  );
  assert((await page.locator('.product-card').count()) >= 1, '导入后成品应保留');

  // 从成品重新载入编辑器
  await page.getByRole('button', { name: '载入编辑器' }).first().click();
  await page.waitForTimeout(600);
  assert((await englishInput.inputValue()).trim().length > 0, '载入成品后英文应回到编辑器');

  // 删除成品
  const productsBeforeDelete = await page.locator('.product-card').count();
  await page.getByRole('button', { name: '删除成品' }).first().click();
  await page.getByRole('button', { name: '删除成品' }).last().click();
  await page.waitForTimeout(500);
  assert(
    (await page.locator('.product-card').count()) === productsBeforeDelete - 1,
    '成品应被删除',
  );

  // 移动端
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/17-mobile-final.png', fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert(overflow <= 1, `移动端不应横向溢出（当前 ${overflow}px）`);
  const toolbarLabels = await page.locator('.toolbar-btn .btn-label').count();
  assert(toolbarLabels >= 5, '移动端工具栏应保留文字标签');

  assert(pageErrors.length === 0, `页面脚本错误：${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `控制台错误：${consoleErrors.join(' | ')}`);
  console.log('扩展验收通过。');
} catch (error) {
  await page.screenshot({ path: 'artifacts/98-flows-failure.png' }).catch(() => {});
  console.error(error);
  if (pageErrors.length) console.error('Page errors:', pageErrors);
  if (consoleErrors.length) console.error('Console errors:', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
