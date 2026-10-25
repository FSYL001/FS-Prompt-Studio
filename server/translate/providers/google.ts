import { describeHttpError, mapWithConcurrency } from '../http.js';
import { requestText } from '../net.js';
import { TranslationError } from '../types.js';
import type { Direction, ProviderTranslateRequest, TranslationProvider } from '../types.js';

const MAX_CHARS = 1800;
const DEFAULT_BASES = ['https://translate.googleapis.com', 'https://translate.google.com'];
const FALLBACK_CODES = new Set([
  'NETWORK',
  'TIMEOUT',
  'RATE_LIMIT',
  'UPSTREAM',
  'HTTP_ERROR',
  'BAD_RESPONSE',
  'EMPTY',
]);

let preferredBase: string | null = null;
let preferredAt = 0;
const PREFERRED_TTL_MS = 10 * 60 * 1000;

/**
 * 通过 node:https（可走代理）调用 Google 公共接口。
 * 不使用全局 fetch：实测 undici 更容易收到 Google 的 429。
 */

function languageCodes(direction: Direction): { source: string; target: string } {
  return direction === 'zh-en'
    ? { source: 'zh-CN', target: 'en' }
    : { source: 'en', target: 'zh-CN' };
}

interface GoogleSegment {
  0?: unknown;
}

async function translateOne(
  text: string,
  direction: Direction,
  bases: string[],
  timeoutMs: number,
  proxyUrl: string,
): Promise<string> {
  if (text.length > MAX_CHARS) {
    throw new TranslationError(
      `单个片段超过 ${MAX_CHARS} 个字符，免费翻译接口无法处理。请把长句拆成几段后重试。`,
      'TOO_LONG',
      '可以按逗号或句号换行，再重新翻译。',
    );
  }
  const { source, target } = languageCodes(direction);
  let lastError: unknown;

  for (const base of bases) {
    const url = new URL('/translate_a/single', base);
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', source);
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);

    try {
      const { status, body } = await requestText(url.toString(), { timeoutMs, proxyUrl });
      if (status !== 200) throw describeHttpError(status, body);

      let data: unknown;
      try {
        data = JSON.parse(body);
      } catch {
        throw new TranslationError('翻译服务返回了无法解析的数据。', 'BAD_RESPONSE', body.slice(0, 200));
      }
      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new TranslationError('翻译服务返回格式异常，请稍后重试。', 'BAD_RESPONSE');
      }
      const translated = (data[0] as GoogleSegment[])
        .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
        .join('')
        .trim();
      if (!translated) {
        throw new TranslationError('翻译服务返回了空结果，请稍后重试。', 'EMPTY');
      }
      preferredBase = base;
      preferredAt = Date.now();
      return translated;
    } catch (error) {
      lastError = error;
      const code = error instanceof TranslationError ? error.code : 'UNKNOWN';
      if (!FALLBACK_CODES.has(code)) throw error;
    }
  }

  const baseError =
    lastError instanceof TranslationError
      ? lastError
      : new TranslationError(
          `翻译服务连接失败：${lastError instanceof Error ? lastError.message : String(lastError)}`,
          'NETWORK',
        );
  throw new TranslationError(
    baseError.message,
    baseError.code,
    `${baseError.hint ? `${baseError.hint} ` : ''}已尝试 ${bases.join(' 和 ')}。如果仍然失败，请在「设置 → 翻译服务」配置代理（例如 http://127.0.0.1:7890），或切换到 MyMemory 免费备用。`,
    baseError.status,
  );
}

function candidateBases(configuredBase: string): string[] {
  const configured = (configuredBase || '').trim().replace(/\/+$/, '');
  const isDefault = !configured || DEFAULT_BASES.includes(configured);
  // 自定义地址（例如用户自己的代理）只使用该地址，不擅自改走 Google 公共域。
  if (!isDefault) return [configured];

  const bases: string[] = [];
  if (preferredBase && Date.now() - preferredAt < PREFERRED_TTL_MS) bases.push(preferredBase);
  for (const base of DEFAULT_BASES) {
    if (!bases.includes(base)) bases.push(base);
  }
  if (configured && !bases.includes(configured)) bases.unshift(configured);
  return bases;
}

export const googleFreeProvider: TranslationProvider = {
  id: 'google-free',
  label: 'Google 翻译公共接口（免费，无需密钥）',
  requiresKey: false,
  maxChars: MAX_CHARS,
  async translate(request: ProviderTranslateRequest): Promise<string[]> {
    const bases = candidateBases(request.config.baseUrl);
    return mapWithConcurrency(request.texts, 3, (text: string) =>
      translateOne(
        text,
        request.direction,
        bases,
        request.config.timeoutMs,
        request.config.proxyUrl,
      ),
    );
  },
  async test(request: ProviderTranslateRequest): Promise<string> {
    const [sample] = await this.translate({ ...request, texts: ['一个女孩站在樱花树下'] });
    return sample;
  },
};
