import crypto from 'node:crypto';
import { getTranslateConfig } from '../config.js';
import { protectPromptSyntax, restorePromptSyntax } from './guard.js';
import { googleFreeProvider } from './providers/google.js';
import { openaiProvider } from './providers/openai.js';
import { deeplProvider } from './providers/deepl.js';
import { mockProvider } from './providers/mock.js';
import {
  PROVIDER_LABELS,
  TranslationError,
  providerRequiresKey,
} from './types.js';
import type {
  DictionaryEntry,
  Direction,
  ProviderId,
  TranslateConfig,
  TranslateMode,
  TranslationProvider,
} from './types.js';

const providers: Record<ProviderId, TranslationProvider> = {
  'google-free': googleFreeProvider,
  openai: openaiProvider,
  deepl: deeplProvider,
  mock: mockProvider,
};

export function getProvider(id: ProviderId): TranslationProvider {
  return providers[id] ?? googleFreeProvider;
}

export interface TranslateSegmentInput {
  id: string;
  text: string;
}

export interface TranslateRequestInput {
  segments: TranslateSegmentInput[];
  direction: Direction;
  mode?: TranslateMode;
  dictionary?: DictionaryEntry[];
  protectedTerms?: string[];
  config?: TranslateConfig;
}

export interface TranslateResultItem {
  id: string;
  text: string;
  cached: boolean;
  skipped: boolean;
}

export interface TranslateResult {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  mock: boolean;
  direction: Direction;
  mode: TranslateMode;
  results: TranslateResultItem[];
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 3000;

function cacheKey(
  config: TranslateConfig,
  direction: Direction,
  mode: TranslateMode,
  dictionary: DictionaryEntry[],
  text: string,
  protectedTerms: string[] = [],
): string {
  const dictSignature = dictionary
    .map((d) => `${d.cn}=>${d.en}`)
    .join('|');
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        direction,
        mode,
        dictSignature,
        protectedTerms,
        text,
      }),
    )
    .digest('hex');
}

function cacheGet(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearTranslationCache(): void {
  cache.clear();
}

function sourceHasTargetLanguage(text: string, direction: Direction): boolean {
  return direction === 'zh-en' ? /[\u3400-\u4dbf\u4e00-\u9fff]/.test(text) : /[A-Za-z]/.test(text);
}

function chunkEntries<T>(items: T[], lengthOf: (item: T) => number, maxChars: number, maxItems = 20): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;
  for (const item of items) {
    const length = lengthOf(item);
    if (current.length > 0 && (current.length >= maxItems || currentChars + length > maxChars)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function translateSegments(input: TranslateRequestInput): Promise<TranslateResult> {
  const config = input.config ?? getTranslateConfig();
  const mode: TranslateMode = input.mode === 'natural' ? 'natural' : 'faithful';
  const dictionary = input.dictionary ?? [];
  const provider = getProvider(config.provider);

  if (providerRequiresKey(config.provider) && !config.apiKey.trim()) {
    throw new TranslationError(
      `尚未配置${PROVIDER_LABELS[config.provider]}的 API Key。请在「设置 → 翻译服务」中填写并保存。`,
      'NO_KEY',
      '密钥只保存在服务端配置文件或环境变量中，不会写入浏览器存储。',
    );
  }

  const totalChars = input.segments.reduce((sum, s) => sum + s.text.length, 0);
  if (totalChars > 60000) {
    throw new TranslationError(
      '本次翻译内容过长（超过 6 万字符），请分段翻译。',
      'TOO_LONG',
    );
  }

  const results = new Map<string, TranslateResultItem>();
  const pending: Array<{
    index: number;
    id: string;
    text: string;
    guarded: string;
    tokens: string[];
    key: string;
  }> = [];

  input.segments.forEach((segment, index) => {
    const text = segment.text.trim();
    if (!text) {
      results.set(segment.id, { id: segment.id, text: '', cached: false, skipped: true });
      return;
    }
    const guarded = protectPromptSyntax(text, input.protectedTerms ?? []);
    if (!sourceHasTargetLanguage(guarded.text, input.direction)) {
      results.set(segment.id, { id: segment.id, text, cached: false, skipped: true });
      return;
    }
    const key = cacheKey(
      config,
      input.direction,
      mode,
      dictionary,
      guarded.text,
      input.protectedTerms ?? [],
    );
    const cachedValue = cacheGet(key);
    if (cachedValue !== undefined) {
      results.set(segment.id, { id: segment.id, text: cachedValue, cached: true, skipped: false });
      return;
    }
    pending.push({
      index,
      id: segment.id,
      text,
      guarded: guarded.text,
      tokens: guarded.tokens,
      key,
    });
  });

  if (pending.length > 0) {
    for (const entries of chunkEntries(pending, (entry) => entry.guarded.length, provider.maxChars, 20)) {
      const chunk = entries.map((entry) => entry.guarded);
      let translations: string[];
      try {
        translations = await provider.translate({
          texts: chunk,
          direction: input.direction,
          mode,
          dictionary,
          config,
        });
      } catch (error) {
        if (error instanceof TranslationError) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        throw new TranslationError(`翻译失败：${reason}`, 'PROVIDER_ERROR');
      }
      if (translations.length !== entries.length) {
        throw new TranslationError(
          '翻译服务返回的结果数量不正确，本次翻译已取消，原内容没有被修改。',
          'COUNT_MISMATCH',
        );
      }
      entries.forEach((entry, offset) => {
        let restored: string;
        try {
          restored = restorePromptSyntax(translations[offset], entry.tokens);
        } catch (error) {
          if (error instanceof TranslationError) throw error;
          throw new TranslationError('还原提示词语法时出错，本次翻译已取消。', 'SYNTAX_LOST');
        }
        const value = restored.trim();
        if (!value) {
          throw new TranslationError(
            '翻译服务返回了空结果，本次翻译已取消，原内容没有被修改。',
            'EMPTY_RESULT',
          );
        }
        cacheSet(entry.key, value);
        results.set(entry.id, { id: entry.id, text: value, cached: false, skipped: false });
      });
    }
  }

  const ordered = input.segments.map((segment) => {
    const entry = results.get(segment.id);
    if (!entry) {
      return { id: segment.id, text: segment.text, cached: false, skipped: true };
    }
    return entry;
  });

  return {
    provider: config.provider,
    providerLabel: PROVIDER_LABELS[config.provider],
    model: config.model,
    mock: config.provider === 'mock',
    direction: input.direction,
    mode,
    results: ordered,
  };
}

export interface TestTranslationResult {
  ok: true;
  provider: ProviderId;
  providerLabel: string;
  mock: boolean;
  sample: string;
  latencyMs: number;
}

export async function testTranslation(config = getTranslateConfig()): Promise<TestTranslationResult> {
  const provider = getProvider(config.provider);
  if (providerRequiresKey(config.provider) && !config.apiKey.trim()) {
    throw new TranslationError(
      '还没有配置 API Key。请先在下方填写并保存密钥，再测试连接。',
      'NO_KEY',
      '密钥只保存在服务端，浏览器只能看到“已配置”状态。',
    );
  }
  const startedAt = Date.now();
  let sample: string;
  try {
    sample = await provider.test({
      texts: ['一个女孩站在樱花树下，长发'],
      direction: 'zh-en',
      mode: 'faithful',
      dictionary: [],
      config,
    });
  } catch (error) {
    if (error instanceof TranslationError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new TranslationError(`连接测试失败：${reason}`, 'TEST_FAILED');
  }
  return {
    ok: true,
    provider: config.provider,
    providerLabel: PROVIDER_LABELS[config.provider],
    mock: config.provider === 'mock',
    sample,
    latencyMs: Date.now() - startedAt,
  };
}
