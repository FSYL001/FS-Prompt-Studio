import type { DictionaryEntry, Direction, TranslateMode } from '../domain/types';

/** 与服务端 /api/translate/config 对应的公开配置（永远不包含 API Key 明文）。 */
export interface PublicTranslateConfig {
  provider: 'google-free' | 'mymemory' | 'openai' | 'deepl' | 'mock';
  label: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keySource: 'config' | 'env' | 'none';
  requiresKey: boolean;
  isMock: boolean;
  dataDestination: string;
  defaultBaseUrls: Record<string, string>;
  configPath: string;
  proxyMode: 'auto' | 'manual' | 'off';
  hasProxy: boolean;
  proxyDisplay: string;
  proxySource: 'config' | 'env' | 'system' | 'none';
}

export interface TranslateResultItem {
  id: string;
  text: string;
  cached: boolean;
  skipped: boolean;
}

export interface TranslateApiResult {
  provider: PublicTranslateConfig['provider'];
  providerLabel: string;
  model: string;
  mock: boolean;
  direction: Direction;
  mode: TranslateMode;
  results: TranslateResultItem[];
}

export interface TestResult {
  ok: true;
  provider: PublicTranslateConfig['provider'];
  providerLabel: string;
  mock: boolean;
  sample: string;
  latencyMs: number;
}

export class ApiError extends Error {
  code: string;
  hint?: string;

  constructor(message: string, code = 'REQUEST_FAILED', hint?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.hint = hint;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function connectionHint(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  if (protocol === 'file:') {
    return '你正在直接打开本地 HTML 文件，浏览器会拦截 API 请求。请关闭此页，双击文件夹里的 start.bat，并访问 http://127.0.0.1:8787 。';
  }
  if (port === '5173') {
    return '前端已经打开，但本地 API 8787 没有响应。源码版请确认 npm run dev 的 API 窗口没有退出；便携版请改用 start.bat 打开的 8787 页面。';
  }
  if (port === '8787') {
    return '当前页面由本地服务提供，但 API 请求失败。可能 Node 进程已退出或端口被占用，请关闭窗口后重新双击 start.bat。';
  }
  return `请确认本地服务正在运行，并访问 http://127.0.0.1:8787（当前：${hostname}${port ? `:${port}` : ''}）。`;
}

async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: timeoutSignal(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new ApiError('请求本地翻译服务超时，请检查后端是否正常运行。', 'TIMEOUT');
    }
    throw new ApiError(
      `连不上本地翻译服务（${reason}）。${connectionHint()}`,
      'NETWORK',
    );
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const apiError = (payload as { error?: { message?: unknown; code?: unknown; hint?: unknown } } | null)
      ?.error;
    throw new ApiError(
      typeof apiError?.message === 'string' ? apiError.message : `本地翻译服务返回错误（HTTP ${response.status}）。`,
      typeof apiError?.code === 'string' ? apiError.code : 'HTTP_ERROR',
      typeof apiError?.hint === 'string' ? apiError.hint : undefined,
    );
  }
  return payload as T;
}

export async function fetchTranslateConfig(): Promise<PublicTranslateConfig> {
  const data = await request<{ config: PublicTranslateConfig }>('/api/translate/config', { method: 'GET' }, 15000);
  return data.config;
}

export async function saveTranslateConfig(patch: {
  provider?: PublicTranslateConfig['provider'];
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  proxyMode?: PublicTranslateConfig['proxyMode'];
  proxyUrl?: string;
}): Promise<PublicTranslateConfig> {
  const data = await request<{ config: PublicTranslateConfig }>(
    '/api/translate/config',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    15000,
  );
  return data.config;
}

export async function testTranslation(patch: {
  provider?: PublicTranslateConfig['provider'];
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  proxyMode?: PublicTranslateConfig['proxyMode'];
  proxyUrl?: string;
}): Promise<TestResult> {
  return request<TestResult>(
    '/api/translate/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    90000,
  );
}

export async function translateBatch(options: {
  items: Array<{ id: string; text: string }>;
  direction: Direction;
  mode: TranslateMode;
  dictionary: DictionaryEntry[];
  protectedTerms?: string[];
}): Promise<TranslateApiResult> {
  return request<TranslateApiResult>(
    '/api/translate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: options.items,
        direction: options.direction,
        mode: options.mode,
        dictionary: options.dictionary,
        protectedTerms: options.protectedTerms ?? [],
      }),
    },
    90000,
  );
}
