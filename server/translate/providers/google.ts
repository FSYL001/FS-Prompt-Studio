import { fetchText, describeHttpError, mapWithConcurrency } from './http.js';
import { TranslationError } from './types.js';
import type { Direction, ProviderTranslateRequest, TranslationProvider } from './types.js';

const MAX_CHARS = 1800;

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
  baseUrl: string,
  timeoutMs: number,
): Promise<string> {
  if (text.length > MAX_CHARS) {
    throw new TranslationError(
      `单个片段超过 ${MAX_CHARS} 个字符，免费翻译接口无法处理。请把长句拆成几段后重试。`,
      'TOO_LONG',
      '可以按逗号或句号换行，再重新翻译。',
    );
  }
  const { source, target } = languageCodes(direction);
  const url = new URL('/translate_a/single', baseUrl || 'https://translate.googleapis.com');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source);
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const { status, body } = await fetchText(url.toString(), { method: 'GET' }, { timeoutMs });
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
  return translated;
}

export const googleFreeProvider: TranslationProvider = {
  id: 'google-free',
  label: 'Google 翻译公共接口（免费，无需密钥）',
  requiresKey: false,
  maxChars: MAX_CHARS,
  async translate(request: ProviderTranslateRequest): Promise<string[]> {
    const baseUrl = request.config.baseUrl || 'https://translate.googleapis.com';
    return mapWithConcurrency(request.texts, 3, (text) =>
      translateOne(text, request.direction, baseUrl, request.config.timeoutMs),
    );
  },
  async test(request: ProviderTranslateRequest): Promise<string> {
    const [sample] = await this.translate({ ...request, texts: ['一个女孩站在樱花树下'] });
    return sample;
  },
};
