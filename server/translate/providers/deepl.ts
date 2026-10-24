import { fetchText, describeHttpError } from '../http.js';
import { TranslationError, DEFAULT_BASE_URLS } from '../types.js';
import type { ProviderTranslateRequest, TranslationProvider } from '../types.js';

function translateUrl(baseUrl: string): string {
  const base = (baseUrl || DEFAULT_BASE_URLS.deepl).trim().replace(/\/+$/, '');
  if (base.endsWith('/v2/translate')) return base;
  return `${base}/v2/translate`;
}

export const deeplProvider: TranslationProvider = {
  id: 'deepl',
  label: 'DeepL API',
  requiresKey: true,
  maxChars: 5000,
  async translate(request: ProviderTranslateRequest): Promise<string[]> {
    if (!request.config.apiKey.trim()) {
      throw new TranslationError(
        '尚未配置 DeepL API Key。请在「设置 → 翻译服务」中填写并保存。',
        'NO_KEY',
        'DeepL 免费版地址通常以 api-free.deepl.com 开头。',
      );
    }
    const form = new URLSearchParams();
    form.set('source_lang', request.direction === 'zh-en' ? 'ZH' : 'EN');
    form.set('target_lang', request.direction === 'zh-en' ? 'EN-US' : 'ZH');
    form.set('preserve_formatting', '1');
    for (const text of request.texts) form.append('text', text);

    const { status, body } = await fetchText(
      translateUrl(request.config.baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `DeepL-Auth-Key ${request.config.apiKey.trim()}`,
        },
        body: form.toString(),
      },
      { timeoutMs: request.config.timeoutMs },
    );

    if (status < 200 || status >= 300) throw describeHttpError(status, body);
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new TranslationError('DeepL 返回了无法解析的数据。', 'BAD_RESPONSE', body.slice(0, 200));
    }
    const translations = (payload as { translations?: unknown }).translations;
    if (!Array.isArray(translations) || translations.length !== request.texts.length) {
      throw new TranslationError(
        'DeepL 返回的翻译数量与请求不一致，本次翻译已取消。',
        'COUNT_MISMATCH',
      );
    }
    return translations.map((item) => {
      const value = (item as { text?: unknown }).text;
      if (typeof value !== 'string') {
        throw new TranslationError('DeepL 返回了无法识别的翻译结果。', 'BAD_RESPONSE');
      }
      return value.trim();
    });
  },
  async test(request: ProviderTranslateRequest): Promise<string> {
    const [sample] = await this.translate({ ...request, texts: ['一个女孩站在樱花树下，长发'] });
    return sample;
  },
};
