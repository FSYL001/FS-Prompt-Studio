/**
 * IndexedDB 基础封装。
 * 所有用户数据默认只保存在浏览器本地；数据库结构带版本号，方便后续迁移。
 */

export type StoreName = 'workspace' | 'loras' | 'products' | 'history' | 'settings' | 'meta';

export const DB_NAME = 'prompt-studio';
export const DB_VERSION = 1;
export const ALL_STORES: StoreName[] = [
  'workspace',
  'loras',
  'products',
  'history',
  'settings',
  'meta',
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB，无法保存数据。请更换浏览器或关闭无痕模式。'));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(
        new Error(
          `无法打开本地数据库：${error instanceof Error ? error.message : String(error)}。请检查浏览器隐私设置。`,
        ),
      );
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('workspace')) {
        db.createObjectStore('workspace', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('loras')) {
        db.createObjectStore('loras', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('history')) {
        const store = db.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(new Error(`打开本地数据库失败：${request.error?.message ?? '未知错误'}`));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('本地数据库正被其它页面占用，请关闭其它 FS-Prompt Studio 标签页后刷新。'));
    };
  });
  return dbPromise;
}

export function describeDbError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return '浏览器本地存储空间不足。请导出备份后清理部分历史记录，或释放磁盘空间。';
    }
    if (error.name === 'SecurityError') {
      return '浏览器禁止了本地存储，可能处于无痕模式或隐私限制。请调整浏览器设置后重试。';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return '本地数据操作失败，请刷新页面后重试。';
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务被中止'));
  });
}

async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest | void,
): Promise<T | undefined> {
  const db = await openDatabase();
  const tx = db.transaction(store, mode);
  const objectStore = tx.objectStore(store);
  const request = run(objectStore);
  const result = request ? await requestResult(request).catch((error) => {
    try {
      tx.abort();
    } catch {
      /* ignore */
    }
    throw error;
  }) : undefined;
  await transactionDone(tx);
  return result as T | undefined;
}

export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T>(store, 'readonly', (os) => os.get(key));
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const result = await withStore<T[]>(store, 'readonly', (os) => os.getAll());
  return result ?? [];
}

export async function dbPut<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  await withStore<void>(store, 'readwrite', (os) => {
    if (key === undefined) os.put(value);
    else os.put(value, key);
  });
}

export async function dbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  await withStore<void>(store, 'readwrite', (os) => os.delete(key));
}

export async function dbClear(store: StoreName): Promise<void> {
  await withStore<void>(store, 'readwrite', (os) => os.clear());
}

export async function dbCount(store: StoreName): Promise<number> {
  return (await withStore<number>(store, 'readonly', (os) => os.count())) ?? 0;
}

/** 单事务替换所有数据，用于导入备份（尽量原子化）。 */
export async function replaceAllData(entries: {
  settings: unknown;
  loras: unknown[];
  products: unknown[];
  history: unknown[];
  workspace: unknown | null;
  meta?: Array<{ key: string; value: unknown }>;
}): Promise<void> {
  const db = await openDatabase();
  const stores: StoreName[] = ['settings', 'loras', 'products', 'history', 'workspace', 'meta'];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('导入事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('导入事务被中止'));
    for (const name of stores) tx.objectStore(name).clear();
    tx.objectStore('settings').put(entries.settings);
    for (const lora of entries.loras) tx.objectStore('loras').put(lora);
    for (const product of entries.products) tx.objectStore('products').put(product);
    for (const item of entries.history) tx.objectStore('history').put(item);
    if (entries.workspace) tx.objectStore('workspace').put(entries.workspace);
    const meta = entries.meta ?? [
      { key: 'schemaVersion', value: DB_VERSION },
      { key: 'updatedAt', value: new Date().toISOString() },
    ];
    for (const item of meta) tx.objectStore('meta').put(item);
  });
}

export async function clearAllStores(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALL_STORES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('清理数据失败'));
    tx.onabort = () => reject(tx.error ?? new Error('清理数据被中止'));
    for (const name of ALL_STORES) tx.objectStore(name).clear();
  });
}
