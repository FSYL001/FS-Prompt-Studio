import {
  BackupSchema,
  HistoryEntrySchema,
  LoraSchema,
  ProductSchema,
  SettingsSchema,
  WorkspaceSchema,
  safeParseSettings,
  safeParseWorkspace,
  type Backup,
  type HistoryEntry,
  type Lora,
  type Product,
  type Settings,
  type Workspace,
} from '../domain/types';
import type { ZodTypeAny, z } from 'zod';
import { nowIso } from '../domain/id';
import { DB_VERSION } from './database';
import {
  dbGetAll,
  dbPut,
  dbDelete,
  dbClear,
  describeDbError,
  replaceAllData,
  openDatabase,
  clearAllStores,
} from './database';

const WORKSPACE_KEY = 'workspace:current';
const SETTINGS_KEY = 'settings:current';

export interface LocalData {
  settings: Settings;
  workspace: Workspace;
  loras: Lora[];
  products: Product[];
  history: HistoryEntry[];
}

function parseArray<S extends ZodTypeAny>(raw: unknown[], schema: S): Array<z.infer<S>> {
  const result: Array<z.infer<S>> = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export async function loadLocalData(): Promise<LocalData> {
  const [rawSettings, rawLoras, rawProducts, rawHistory, rawWorkspace] = await Promise.all([
    dbGetAll<unknown>('settings').catch(() => []),
    dbGetAll<unknown>('loras').catch(() => []),
    dbGetAll<unknown>('products').catch(() => []),
    dbGetAll<unknown>('history').catch(() => []),
    dbGetAll<unknown>('workspace').catch(() => []),
  ]);

  const settingsRecord =
    rawSettings.find((item) => (item as { id?: string })?.id === SETTINGS_KEY) ?? rawSettings[0];
  const workspaceRecord =
    rawWorkspace.find((item) => (item as { id?: string })?.id === WORKSPACE_KEY) ?? rawWorkspace[0];

  return {
    settings: safeParseSettings(settingsRecord),
    workspace: safeParseWorkspace(workspaceRecord),
    loras: parseArray(rawLoras, LoraSchema),
    products: parseArray(rawProducts, ProductSchema),
    history: parseArray(rawHistory, HistoryEntrySchema),
  };
}

export async function saveSettingsRecord(settings: Settings): Promise<void> {
  try {
    await dbPut('settings', SettingsSchema.parse({ ...settings, id: SETTINGS_KEY }));
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function saveWorkspaceRecord(workspace: Workspace): Promise<void> {
  try {
    await dbPut('workspace', WorkspaceSchema.parse({ ...workspace, id: WORKSPACE_KEY }));
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function saveLoraRecord(lora: Lora): Promise<void> {
  try {
    await dbPut('loras', LoraSchema.parse(lora));
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function deleteLoraRecord(id: string): Promise<void> {
  try {
    await dbDelete('loras', id);
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function saveProductRecord(product: Product): Promise<void> {
  try {
    await dbPut('products', ProductSchema.parse(product));
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function deleteProductRecord(id: string): Promise<void> {
  try {
    await dbDelete('products', id);
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function saveHistoryRecord(entry: HistoryEntry): Promise<void> {
  try {
    await dbPut('history', HistoryEntrySchema.parse(entry));
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function deleteHistoryRecords(ids: string[]): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('删除历史记录失败'));
      tx.onabort = () => reject(tx.error ?? new Error('删除历史记录被中止'));
      for (const id of ids) tx.objectStore('history').delete(id);
    });
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function clearHistoryRecords(): Promise<void> {
  try {
    await dbClear('history');
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function clearProductsRecords(): Promise<void> {
  try {
    await dbClear('products');
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function clearLorasRecords(): Promise<void> {
  try {
    await dbClear('loras');
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function saveMeta(key: string, value: unknown): Promise<void> {
  await dbPut('meta', { key, value });
}

export function buildBackup(data: LocalData): Backup {
  return BackupSchema.parse({
    app: 'prompt-studio',
    formatVersion: 1,
    exportedAt: nowIso(),
    data: {
      settings: data.settings,
      loras: data.loras,
      products: data.products,
      history: data.history,
      workspace: data.workspace,
    },
  });
}

export type BackupParseResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: string };

export function parseBackupText(raw: string): BackupParseResult {
  if (raw.length > 10 * 1024 * 1024) {
    return { ok: false, error: '备份文件过大（超过 10MB），已拒绝导入。' };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: '文件不是合法的 JSON，请确认选择的是 FS-Prompt Studio 导出的备份文件。' };
  }
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '数据'}：${issue.message}`)
      .join('；');
    return {
      ok: false,
      error: `备份数据结构不正确（${first}）。为避免损坏现有数据，导入已取消。`,
    };
  }
  return { ok: true, backup: parsed.data };
}

export interface BackupStats {
  exportedAt: string;
  loras: number;
  products: number;
  history: number;
  hasWorkspace: boolean;
  dictionaryEntries: number;
  workflows: number;
}

export function getBackupStats(backup: Backup): BackupStats {
  return {
    exportedAt: backup.exportedAt,
    loras: backup.data.loras.length,
    products: backup.data.products.length,
    history: backup.data.history.length,
    hasWorkspace: Boolean(backup.data.workspace),
    dictionaryEntries: backup.data.settings.dictionary.length,
    workflows: backup.data.settings.workflows.length,
  };
}

function newerThan(a: { updatedAt?: string; createdAt?: string }, b: { updatedAt?: string; createdAt?: string }): boolean {
  const left = a.updatedAt ?? a.createdAt ?? '';
  const right = b.updatedAt ?? b.createdAt ?? '';
  return left >= right;
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing || newerThan(item, existing)) map.set(item.id, item);
  }
  return [...map.values()];
}

export async function applyBackup(backup: Backup, mode: 'replace' | 'merge'): Promise<LocalData> {
  try {
    if (mode === 'replace') {
      await replaceAllData({
        settings: backup.data.settings,
        loras: backup.data.loras,
        products: backup.data.products,
        history: backup.data.history,
        workspace: backup.data.workspace,
        meta: [
          { key: 'schemaVersion', value: DB_VERSION },
          { key: 'updatedAt', value: nowIso() },
          { key: 'importedAt', value: nowIso() },
        ],
      });
      return await loadLocalData();
    }

    const current = await loadLocalData();
    const history = mergeById(current.history, backup.data.history)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 10000);
    const merged: LocalData = {
      settings: backup.data.settings,
      loras: mergeById(current.loras, backup.data.loras),
      products: mergeById(current.products, backup.data.products),
      history,
      workspace: backup.data.workspace ?? current.workspace,
    };
    await replaceAllData({
      ...merged,
      meta: [
        { key: 'schemaVersion', value: DB_VERSION },
        { key: 'updatedAt', value: nowIso() },
        { key: 'importedAt', value: nowIso() },
      ],
    });
    return merged;
  } catch (error) {
    throw new Error(`导入数据失败：${describeDbError(error)}`);
  }
}

/** 删除全部本地数据（不改动服务端翻译配置）。 */
export async function clearLocalData(): Promise<void> {
  try {
    await clearAllStores();
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

export async function getStorageSummary(): Promise<{
  loras: number;
  products: number;
  history: number;
  usedBytes: number | null;
  quotaBytes: number | null;
}> {
  const [loras, products, history] = await Promise.all([
    dbGetAll<unknown>('loras'),
    dbGetAll<unknown>('products'),
    dbGetAll<unknown>('history'),
  ]);
  let usedBytes: number | null = null;
  let quotaBytes: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      usedBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
      quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    } catch {
      /* ignore */
    }
  }
  return { loras: loras.length, products: products.length, history: history.length, usedBytes, quotaBytes };
}
