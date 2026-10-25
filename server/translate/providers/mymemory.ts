import { describeHttpError, mapWithConcurrency } from '../http.js';
import { requestText } from '../net.js';
import { DEFAULT_BASE_URLS, TranslationError } from '../types.js';
import type { Direction, ProviderTranslateRequest, TranslationProvider } from '../types.js';

const MAX_CHARS = 450;

function languageCodes(direction: Direction): { source: string; target: string } {
  return direction === 'zh-en'
    ? { source: 'zh-CN', target: 'en' }
    : { source: 'en', target: 'zh-CN' };
}

interface MyMemoryResponse {
  responseData?: { translatedText?: unknown };
  responseStatus?: unknown;
  responseDetails?: unknown;
}

async function translateOne(
  text: string,
  direction: Direction,
  baseUrl: string,
  timeoutMs: number,
  proxyUrl: string,
): Promise<string> {
  if (text.length > MAX_CHARS) {
    throw new TranslationError(
      `单个片段超过 ${MAX_CHARS} 个字符，MyMemory 免费接口无法处理。请拆成几段后重试。`,
      'TOO_LONG',
      '可以按逗号或句号换行，再重新翻译。',
    );
  }
  const { source, target } = languageCodes(direction);
  const base = (baseUrl || DEFAULT_BASE_URLS.mymemory).trim().replace(/\/+$/, '');
  const url = new URL('/get', base);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${source}|${target}`);

  const { status, body } = await requestText(url.toString(), { timeoutMs, proxyUrl });
  if (status !== 200) throw describeHttpError(status, body);

  let data: MyMemoryResponse;
  try {
    data = JSON.parse(body) as MyMemoryResponse;
  } catch {
    throw new TranslationError('MyMemory 返回了无法解析的数据。', 'BAD_RESPONSE', body.slice(0, 200));
  }

  const statusValue = Number(data.responseStatus);
  const translated =
    typeof data.responseData?.translatedText === 'string'
      ? data.responseData.translatedText.trim()
      : '';
  if (statusValue !== 200 || !translated) {
    const detail =
      typeof data.responseDetails === 'string' ? data.responseDetails.slice(0, 200) : '';
    throw new TranslationError(
      `MyMemory 暂时没有返回翻译结果${detail ? `：${detail}` : '。'}`,
      statusValue === 429 ? 'RATE_LIMIT' : 'UPSTREAM',
      'MyMemory 免费额度有限；可以稍后重试、配置代理后继续使用 Google，或改用 OpenAI 兼容接口。',
    );
  }
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) {
    throw new TranslationError(
      'MyMemory 免费额度已用完或请求过长。',
      'RATE_LIMIT',
      '请稍后重试，或改用 Google / OpenAI 兼容接口。',
    );
  }
  return translated;
}

export const myMemoryProvider: TranslationProvider = {
  id: 'mymemory',
  label: 'MyMemory 免费备用（无需密钥）',
  requiresKey: false,
  maxChars: MAX_CHARS,
  async translate(request: ProviderTranslateRequest): Promise<string[]> {
    return mapWithConcurrency(request.texts, 2, (text: string) =>
      translateOne(
        text,
        request.direction,
        request.config.baseUrl,
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
