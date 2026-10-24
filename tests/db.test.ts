import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE,
  ProductLoraSchema,
  type Lora,
} from '../src/domain/types';
import { createProduct } from '../src/domain/product';
import { newId, nowIso } from '../src/domain/id';
import {
  applyBackup,
  buildBackup,
  clearLocalData,
  loadLocalData,
  parseBackupText,
  saveHistoryRecord,
  saveLoraRecord,
  saveProductRecord,
  saveSettingsRecord,
  saveWorkspaceRecord,
} from '../src/db/repositories';

function makeLora(name = 'Watercolor', id = 'lora_test'): Lora {
  return {
    id,
    name,
    file: 'watercolor.safetensors',
    triggerWords: ['watercolor_style'],
    promptPrefix: 'masterpiece, best quality',
    descCn: '水彩风格',
    descEn: 'watercolor style',
    defaultWeight: 0.8,
    weightMin: 0,
    weightMax: 1.5,
    modelTypes: ['sdxl', 'flux'],
    category: '画风',
    notes: '',
    favorite: false,
    enabled: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makeProduct() {
  return createProduct({
    englishText: '1girl, white hair, black dress',
    draftText: '一个白发女孩，穿着黑色连衣裙',
    negativeText: 'lowres',
    segments: [],
    activeLoras: [ProductLoraSchema.parse({ name: 'Watercolor', file: 'w.safetensors', weight: 0.8, triggerWords: [] })],
    params: { ...DEFAULT_WORKSPACE.params },
    presetId: 'sdxl',
    output: { ...DEFAULT_SETTINGS.output },
    name: '测试成品',
  });
}

describe('本地数据层', () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  it('空数据库返回默认设置和空集合', async () => {
    const data = await loadLocalData();
    expect(data.settings.theme).toBe('system');
    expect(data.workspace.draftText).toBe('');
    expect(data.loras).toEqual([]);
    expect(data.products).toEqual([]);
    expect(data.history).toEqual([]);
  });

  it('草稿与设置刷新后仍然存在', async () => {
    const workspace = { ...DEFAULT_WORKSPACE, draftText: '一个白发女孩', englishText: '1girl, white hair' };
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, dictionary: [{ cn: '樱花', en: 'cherry blossoms' }] };
    await saveWorkspaceRecord(workspace);
    await saveSettingsRecord(settings);

    const loaded = await loadLocalData();
    expect(loaded.workspace.draftText).toBe('一个白发女孩');
    expect(loaded.workspace.englishText).toBe('1girl, white hair');
    expect(loaded.settings.theme).toBe('dark');
    expect(loaded.settings.dictionary).toHaveLength(1);
  });

  it('保存 LoRA、成品与历史', async () => {
    const lora = makeLora();
    const product = makeProduct();
    await saveLoraRecord(lora);
    await saveProductRecord(product);
    await saveHistoryRecord({
      id: newId('history'),
      type: 'product',
      name: '测试成品',
      favorite: false,
      createdAt: nowIso(),
      productId: product.id,
      snapshot: {
        draftText: product.draftText,
        translationZhText: product.translationZhText,
        englishText: product.englishText,
        negativeText: product.negativeText,
        alignment: null,
        segments: product.segments,
        activeLoras: product.loras,
        params: product.params,
        presetId: product.presetId,
        notes: product.notes,
      },
    });

    const loaded = await loadLocalData();
    expect(loaded.loras[0].name).toBe('Watercolor');
    expect(loaded.products[0].positive).toContain('white hair');
    expect(loaded.history[0].snapshot.activeLoras[0].file).toBe('w.safetensors');
  });

  it('备份可导出、校验并完整恢复', async () => {
    await saveWorkspaceRecord({ ...DEFAULT_WORKSPACE, draftText: '草稿内容' });
    await saveLoraRecord(makeLora());
    const current = await loadLocalData();
    const backup = buildBackup(current);
    const text = JSON.stringify(backup);
    const parsed = parseBackupText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await clearLocalData();
    const restored = await applyBackup(parsed.backup, 'replace');
    expect(restored.workspace.draftText).toBe('草稿内容');
    expect(restored.loras).toHaveLength(1);
  });

  it('合并导入保留本地数据并采用更新的同 ID 条目', async () => {
    await saveLoraRecord(makeLora('旧名称', 'lora_same'));

    const newer = makeLora('新名称', 'lora_same');
    newer.updatedAt = new Date(Date.now() + 60_000).toISOString();
    const backup = buildBackup({
      settings: { ...DEFAULT_SETTINGS, dictionary: [{ cn: '樱花', en: 'cherry blossoms' }] },
      workspace: { ...DEFAULT_WORKSPACE, draftText: '备份里的草稿' },
      loras: [newer, makeLora('新增 LoRA', 'lora_new')],
      products: [],
      history: [],
    });

    const merged = await applyBackup(backup, 'merge');
    expect(merged.loras.map((lora) => lora.name).sort()).toEqual(['新名称', '新增 LoRA'].sort());
    expect(merged.settings.dictionary[0].en).toBe('cherry blossoms');
    expect(merged.workspace.draftText).toBe('备份里的草稿');
  });

  it('拒绝不合法或不认识的备份结构', () => {
    expect(parseBackupText('not json').ok).toBe(false);
    const bad = parseBackupText(JSON.stringify({ app: 'other', formatVersion: 1, data: {} }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('数据结构不正确');
  });

  it('清除本地数据后回到默认状态', async () => {
    await saveLoraRecord(makeLora());
    await clearLocalData();
    const loaded = await loadLocalData();
    expect(loaded.loras).toEqual([]);
    expect(loaded.workspace.draftText).toBe('');
    expect(loaded.settings.theme).toBe('system');
  });
});
