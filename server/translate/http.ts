import { TranslationError, translationTimeoutError } from './types.js';

export interface FetchOptions {
  timeoutMs: number;
  headers?: Record<string, string>;
}

export async function fetchText(
  url: string,
  init: RequestInit,
  options: FetchOptions,
): Promise<{ status: number; body: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        'User-Agent': 'PromptStudio/1.0 (local prompt editor)',
        ...(init.headers as Record<string, string> | undefined),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw translationTimeoutError();
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new TranslationError(
      `无法连接翻译服务，请检查网络或代理设置（${reason}）。`,
      'NETWORK',
      '如果使用自定义接口，请确认地址可以从本机访问。',
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw translationTimeoutError();
    }
    throw new TranslationError('读取翻译服务响应失败。', 'NETWORK');
  }

  return { status: response.status, body };
}

export function describeHttpError(status: number, detail: string): TranslationError {
  if (status === 401 || status === 403) {
    return new TranslationError(
      `翻译服务拒绝了请求（${status}），通常是 API Key 无效、过期或没有权限。`,
      'AUTH',
      '请在设置中检查密钥，或点击「测试连接」确认配置。',
      status,
    );
  }
  if (status === 404) {
    return new TranslationError(
      '翻译接口地址不存在（404）。请检查设置中的 API 地址是否正确。',
      'NOT_FOUND',
      detail.slice(0, 300),
      status,
    );
  }
  if (status === 429) {
    return new TranslationError(
      '翻译服务请求过于频繁（429），请稍后重试。免费接口限制较严格。',
      'RATE_LIMIT',
      detail.slice(0, 300),
      status,
    );
  }
  if (status === 456) {
    return new TranslationError(
      'DeepL 配额已用尽（456），请检查套餐或更换密钥。',
      'QUOTA',
      detail.slice(0, 300),
      status,
    );
  }
  if (status >= 500) {
    return new TranslationError(
      `翻译服务暂时不可用（${status}），请稍后重试。`,
      'UPSTREAM',
      detail.slice(0, 300),
      status,
    );
  }
  return new TranslationError(
    `翻译请求失败（HTTP ${status}）。`,
    'HTTP_ERROR',
    detail.slice(0, 300),
    status,
  );
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
