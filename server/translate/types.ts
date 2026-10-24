export type ProviderId = 'google-free' | 'openai' | 'deepl' | 'mock';
export type Direction = 'zh-en' | 'en-zh';
export type TranslateMode = 'faithful' | 'natural';

export interface DictionaryEntry {
  cn: string;
  en: string;
}

export interface TranslateConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  apiKey: string;
}

export interface ProviderTranslateRequest {
  texts: string[];
  direction: Direction;
  mode: TranslateMode;
  dictionary: DictionaryEntry[];
  config: TranslateConfig;
}

export interface TranslateSegmentPayload {
  segments: Array<{ id: string; text: string }>;
  direction: Direction;
  mode?: TranslateMode;
  dictionary?: DictionaryEntry[];
  /** LoRA 触发词等必须原样保留的词。 */
  protectedTerms?: string[];
}

export interface TranslationProvider {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  /** 单个请求建议的最大字符数 */
  maxChars: number;
  translate(request: ProviderTranslateRequest): Promise<string[]>;
  test(request: ProviderTranslateRequest): Promise<string>;
}

export class TranslationError extends Error {
  code: string;
  hint?: string;
  status?: number;

  constructor(message: string, code = 'TRANSLATE_FAILED', hint?: string, status?: number) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  'google-free': 'Google 翻译公共接口（免费，无需密钥）',
  openai: 'OpenAI 兼容接口',
  deepl: 'DeepL API',
  mock: '本地模拟翻译（仅演示，不是真实翻译）',
};

export const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  'google-free': 'https://translate.googleapis.com',
  openai: 'https://api.openai.com/v1',
  deepl: 'https://api-free.deepl.com',
  mock: '',
};

export function providerRequiresKey(provider: ProviderId): boolean {
  return provider === 'openai' || provider === 'deepl';
}

export function translationTimeoutError(): TranslationError {
  return new TranslationError(
    '翻译请求超时，原内容没有被修改。可以稍后在设置里增大超时时间，或点击重试。',
    'TIMEOUT',
    '网络较慢或翻译服务无响应。',
  );
}
