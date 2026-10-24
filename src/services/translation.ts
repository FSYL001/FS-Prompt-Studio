import { detectLanguage, needsTranslation, tokenizePrompt, hasCJK, hasLatin } from '../domain/promptParse';
import { composeTranslatedText } from '../domain/promptParse';
import { nowIso } from '../domain/id';
import type { Alignment, DictionaryEntry, Direction, TranslateMode } from '../domain/types';
import { translateBatch } from './translateApi';

export interface TranslationOutcome {
  text: string;
  pairs: Alignment['pairs'];
  alignment: Alignment;
  provider: string;
  providerLabel: string;
  mock: boolean;
  skippedCount: number;
  noop: boolean;
}

function chunkItems<T extends { text: string }>(items: T[], maxItems = 80, maxChars = 30000): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const item of items) {
    if (current.length > 0 && (current.length >= maxItems || chars + item.text.length > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * 翻译整段提示词：
 * - 按顶层分隔符和句末标点切片，保留原文结构；
 * - 只发送需要翻译的片段；
 * - 用真实返回的片段结果生成双语对照，不通过拆英文单词伪造对齐。
 */
export async function translatePromptText(input: {
  sourceText: string;
  direction: Direction;
  mode: TranslateMode;
  dictionary: DictionaryEntry[];
  protectedTerms?: string[];
}): Promise<TranslationOutcome> {
  const tokens = tokenizePrompt(input.sourceText, { splitSentences: true });
  const indexesToTranslate: number[] = [];
  tokens.forEach((token, index) => {
    if (needsTranslation(token, input.direction)) indexesToTranslate.push(index);
  });

  const sourceLang = detectLanguage(input.sourceText);
  const translationMap = new Map<number, string>();
  tokens.forEach((token, index) => {
    if (token.kind === 'content') translationMap.set(index, token.value);
  });

  if (indexesToTranslate.length === 0) {
    const composed = composeTranslatedText(tokens, translationMap, input.direction);
    const alignment: Alignment = {
      direction: input.direction,
      sourceLang: sourceLang === 'en' ? 'en' : sourceLang === 'mixed' ? 'mixed' : 'zh',
      targetLang: input.direction === 'zh-en' ? 'en' : 'zh',
      sourceText: input.sourceText,
      targetText: composed.text,
      pairs: composed.pairs,
      provider: 'none',
      mock: false,
      createdAt: nowIso(),
    };
    return {
      text: composed.text,
      pairs: composed.pairs,
      alignment,
      provider: 'none',
      providerLabel: '无需翻译',
      mock: false,
      skippedCount: tokens.filter((t) => t.kind === 'content').length,
      noop: true,
    };
  }

  const items = indexesToTranslate.map((index) => ({
    index,
    id: `seg_${index}`,
    text: tokens[index].value,
  }));

  const results = new Map<string, string>();
  let provider = '';
  let providerLabel = '翻译服务';
  let mock = false;

  for (const chunk of chunkItems(items)) {
    const response = await translateBatch({
      items: chunk.map((item) => ({ id: item.id, text: item.text })),
      direction: input.direction,
      mode: input.mode,
      dictionary: input.dictionary,
      protectedTerms: input.protectedTerms,
    });
    provider = response.provider;
    providerLabel = response.providerLabel;
    mock = response.mock;
    for (const item of response.results) results.set(item.id, item.text);
  }

  for (const item of items) {
    const translated = results.get(item.id);
    if (translated === undefined) {
      throw new Error('翻译服务没有返回完整的片段结果，本次翻译已取消，原内容没有被修改。');
    }
    translationMap.set(item.index, translated);
  }

  const composed = composeTranslatedText(tokens, translationMap, input.direction);
  const alignment: Alignment = {
    direction: input.direction,
    sourceLang: sourceLang === 'en' ? 'en' : sourceLang === 'mixed' ? 'mixed' : 'zh',
    targetLang: input.direction === 'zh-en' ? 'en' : 'zh',
    sourceText: input.sourceText,
    targetText: composed.text,
    pairs: composed.pairs,
    provider,
    mock,
    createdAt: nowIso(),
  };

  return {
    text: composed.text,
    pairs: composed.pairs,
    alignment,
    provider,
    providerLabel,
    mock,
    skippedCount: tokens.filter((t) => t.kind === 'content' && !needsTranslation(t, input.direction)).length,
    noop: false,
  };
}

/** 单个片段翻译（片段编辑器中单独翻译用）。 */
export async function translateSingleText(input: {
  text: string;
  mode: TranslateMode;
  dictionary: DictionaryEntry[];
  protectedTerms?: string[];
}): Promise<{ text: string; direction: Direction; mock: boolean; providerLabel: string }> {
  const direction: Direction = hasCJK(input.text) ? 'zh-en' : 'en-zh';
  if (direction === 'zh-en' && !hasCJK(input.text)) {
    throw new Error('这个片段里没有中文，无需翻译。');
  }
  if (direction === 'en-zh' && !hasLatin(input.text)) {
    throw new Error('这个片段里没有英文，无需翻译。');
  }
  const response = await translateBatch({
    items: [{ id: 'single', text: input.text }],
    direction,
    mode: input.mode,
    dictionary: input.dictionary,
    protectedTerms: input.protectedTerms,
  });
  const result = response.results[0];
  if (!result) throw new Error('翻译服务没有返回结果。');
  return {
    text: result.text,
    direction,
    mock: response.mock,
    providerLabel: response.providerLabel,
  };
}
