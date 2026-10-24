import type { AlignmentPair, Direction, Lang, OutputConfig, PromptSegment } from './types';

/**
 * 提示词解析与双语重组。
 *
 * 设计原则：
 * 1. 原文永远保留，翻译只生成新的目标文本。
 * 2. 分段只发生在“顶层”的逗号 / 分号 / 换行（翻译时额外在句末标点处断句），
 *    括号、方括号、花括号、引号内部不会被切开，权重语法不会被打散。
 * 3. 对照信息来自真实的分段翻译结果，不通过英文空格反推中文对应关系。
 */

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LETTER_OR_NUMBER_RE = /[\p{L}\p{N}]/u;

const SOFT_DELIMS = new Set([',', '，', '、', ';', '；']);
const SENTENCE_DELIMS = new Set(['。', '！', '？', '!', '?']);

export function hasCJK(text: string): boolean {
  return CJK_RE.test(text);
}

export function hasLatin(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

export function detectLanguage(text: string): Lang {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    if (CJK_RE.test(ch)) cjk++;
    else if (/[A-Za-z]/.test(ch)) latin++;
  }
  if (!cjk && !latin) return 'unknown';
  if (cjk > 0 && latin > 0) return 'mixed';
  return cjk > 0 ? 'zh' : 'en';
}

export interface PromptToken {
  kind: 'content' | 'delim' | 'newline' | 'space' | 'protected';
  value: string;
  start: number;
  end: number;
}

export interface TokenizeOptions {
  /** 是否在句号 / 问号 / 感叹号处断句（翻译用 true，片段管理用 false）。 */
  splitSentences?: boolean;
}

function isSentencePeriod(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const prev = text[index - 1] ?? '';
  const next = text[index + 1];
  if (/\d/.test(prev)) return false;
  if (next === undefined) return true;
  return /\s/.test(next);
}

function isProtectedStart(text: string, index: number): number {
  if (text[index] !== '<') return -1;
  const close = text.indexOf('>', index + 1);
  if (close === -1) return -1;
  const inner = text.slice(index + 1, close);
  // <lora:xxx:0.8> / <hypernet:xxx:0.9> 等前端语法
  if (/^[A-Za-z][\w.-]*\s*:/.test(inner)) return close + 1;
  return -1;
}

/** 将提示词拆成保留字符偏移的 token 序列。 */
export function tokenizePrompt(text: string, options: TokenizeOptions = {}): PromptToken[] {
  const splitSentences = options.splitSentences !== false;
  const tokens: PromptToken[] = [];
  let i = 0;
  let depth = 0;
  let quote = false;

  const push = (kind: PromptToken['kind'], start: number, end: number) => {
    tokens.push({ kind, value: text.slice(start, end), start, end });
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\n') {
      push('newline', i, i + 1);
      depth = 0;
      quote = false;
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        push('newline', i, i + 2);
        i += 2;
      } else {
        push('newline', i, i + 1);
        i += 1;
      }
      depth = 0;
      quote = false;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      // 顶层空白（分隔符后 / 片段开头）不单独保留；英文短语内部的空格会包含在 content token 中。
      let j = i + 1;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
      i = j;
      continue;
    }

    const protectedEnd = isProtectedStart(text, i);
    if (protectedEnd > i) {
      push('protected', i, protectedEnd);
      i = protectedEnd;
      continue;
    }
    if (text.startsWith('BREAK', i) && !/[A-Za-z0-9_]/.test(text[i - 1] ?? '') && !/[A-Za-z0-9_]/.test(text[i + 5] ?? '')) {
      push('protected', i, i + 5);
      i += 5;
      continue;
    }

    if (ch === '"' || ch === '“' || ch === '”') {
      push('content', i, i + 1);
      quote = !quote;
      i += 1;
      continue;
    }

    if (depth === 0 && !quote) {
      if (SOFT_DELIMS.has(ch)) {
        push('delim', i, i + 1);
        i += 1;
        continue;
      }
      if (splitSentences && (SENTENCE_DELIMS.has(ch) || isSentencePeriod(text, i))) {
        push('delim', i, i + 1);
        i += 1;
        continue;
      }
    }

    // 消费一段普通内容，遇到分隔符 / 换行 / 语法标记时停下。
    // 注意：空格会被包含在内容里，这样英文短语和完整句子不会被拆成单个单词。
    let j = i;
    while (j < text.length) {
      const c = text[j];
      if (c === '\n' || c === '\r' || c === '<') break;
      if (c === '"' || c === '“' || c === '”') break;
      if (depth === 0 && !quote) {
        if (SOFT_DELIMS.has(c)) break;
        if (splitSentences && (SENTENCE_DELIMS.has(c) || isSentencePeriod(text, j))) break;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if ((c === ')' || c === ']' || c === '}') && depth > 0) depth--;
      j++;
    }
    if (j === i) j = i + 1; // 防御性处理
    push('content', i, j);
    i = j;
  }

  return tokens;
}

/** 判断某个 token 是否需要送去翻译（包含目标语言字符、且不是纯符号）。 */
export function needsTranslation(token: PromptToken, direction: Direction): boolean {
  if (token.kind !== 'content') return false;
  if (!LETTER_OR_NUMBER_RE.test(token.value)) return false;
  if (direction === 'zh-en') return hasCJK(token.value);
  return hasLatin(token.value);
}

function mapDelimiter(value: string, direction: Direction): string {
  if (direction === 'zh-en') {
    switch (value) {
      case '，':
      case '、':
      case ',':
        return ', ';
      case '；':
      case ';':
        return '; ';
      case '。':
      case '.':
        return '. ';
      case '！':
      case '!':
        return '! ';
      case '？':
      case '?':
        return '? ';
      default:
        return value;
    }
  }
  switch (value) {
    case ',':
    case '，':
      return '，';
    case ';':
    case '；':
      return '；';
    case '.':
    case '。':
      return '。';
    case '!':
    case '！':
      return '！';
    case '?':
    case '？':
      return '？';
    case '、':
      return '、';
    default:
      return value;
  }
}

function trimTrailingSpaces(value: string): string {
  return value.replace(/[ \t]+$/, '');
}

function isSentenceLike(value: string): boolean {
  const cjkCount = (value.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) ?? []).length;
  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  return cjkCount >= 12 || wordCount >= 5 || value.length >= 24;
}

export interface ComposeTranslationResult {
  text: string;
  pairs: AlignmentPair[];
}

/**
 * 用翻译结果重组目标文本，并记录每个片段在目标文本中的真实字符区间。
 * translations 的 key 是 token 在 tokenizePrompt 结果中的下标。
 * 未提供译文的 content token 会保留原文，并标记 uncertain。
 */
export function composeTranslatedText(
  tokens: PromptToken[],
  translations: Map<number, string>,
  direction: Direction,
): ComposeTranslationResult {
  const pairs: AlignmentPair[] = [];
  let out = '';
  let pendingSpace = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === 'space') {
      pendingSpace = true;
      continue;
    }
    if (token.kind === 'newline') {
      out = trimTrailingSpaces(out);
      if (out.length > 0) out += '\n';
      pendingSpace = false;
      continue;
    }
    if (token.kind === 'delim') {
      out = trimTrailingSpaces(out);
      out += mapDelimiter(token.value, direction);
      pendingSpace = false;
      continue;
    }
    if (token.kind === 'protected') {
      // LoRA 标签等语法不参与对照，也不送翻译，只按原样保留。
      if (out.length > 0 && !/[\s(（]$/.test(out)) out += ' ';
      out += token.value;
      pendingSpace = false;
      continue;
    }

    const raw = translations.get(index);
    const translated = raw === undefined ? token.value : raw;
    const value = translated.trim();
    if (!value) {
      pendingSpace = false;
      continue;
    }

    if (pendingSpace && out.length > 0 && !out.endsWith(' ') && !out.endsWith('\n')) {
      out += ' ';
    }
    pendingSpace = false;

    const targetStart = out.length;
    out += value;
    const targetEnd = out.length;

    const trimmedSource = token.value.trim();
    const leadingSpaces = token.value.length - token.value.trimStart().length;
    const sourceStart = token.start + leadingSpaces;
    const sourceEnd = sourceStart + trimmedSource.length;

    if (LETTER_OR_NUMBER_RE.test(value) && LETTER_OR_NUMBER_RE.test(trimmedSource)) {
      pairs.push({
        source: trimmedSource,
        target: value,
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd,
        granularity: isSentenceLike(trimmedSource) ? 'sentence' : 'segment',
        unchanged: raw === undefined ? true : raw.trim() === trimmedSource,
        uncertain: raw === undefined ? true : undefined,
      });
    }

    // 保留原文中紧跟在内容后面的空格（例如 "1girl <lora:...>"）。
    if (/[ \t]+$/.test(token.value)) pendingSpace = true;
  }

  return { text: trimTrailingSpaces(out), pairs };
}

/**
 * 按顶层逗号 / 分号 / 换行拆分提示词片段。
 * 完整句子（带句号）不会被拆开，括号与标签内部也不会被拆开。
 */
export function splitPromptSegments(text: string): string[] {
  const tokens = tokenizePrompt(text, { splitSentences: false });
  const segments: string[] = [];
  let buffer = '';

  const flush = () => {
    const value = buffer.trim();
    if (value) segments.push(value);
    buffer = '';
  };

  for (const token of tokens) {
    if (token.kind === 'newline' || token.kind === 'delim') {
      flush();
    } else if (token.kind === 'space') {
      if (buffer.length > 0 && !buffer.endsWith(' ')) buffer += ' ';
    } else {
      buffer += token.value;
    }
  }
  flush();
  return segments;
}

/** 片段里用于英文输出的文本：中文片段优先使用其译文，没有译文则保留原文。 */
export function segmentEnglishText(segment: PromptSegment): string {
  const text = segment.text.trim();
  if (!text) return '';
  if (hasCJK(text)) {
    return segment.translated.trim() || text;
  }
  return text;
}

export function wrapWeight(text: string, weight: number | null | undefined): string {
  if (weight === null || weight === undefined || Number.isNaN(weight) || weight === 1) return text;
  const normalized = Math.round(weight * 100) / 100;
  return `(${text}:${normalized})`;
}

export interface ComposeSegmentsOptions {
  output: Pick<OutputConfig, 'format' | 'separator' | 'customSeparator' | 'includeWeights'>;
  polarity?: 'positive' | 'negative';
  applyWeights?: boolean;
}

export function composeFromSegments(
  segments: PromptSegment[],
  options: ComposeSegmentsOptions,
): string {
  const polarity = options.polarity ?? 'positive';
  const parts = segments
    .filter((s) => s.polarity === polarity)
    .map((s) => {
      const text = segmentEnglishText(s).trim();
      if (!text) return '';
      const allowWeights = options.applyWeights !== false && options.output.includeWeights !== false;
      return allowWeights ? wrapWeight(text, s.weight) : text;
    })
    .filter(Boolean);

  const separator =
    options.output.format === 'lines'
      ? '\n'
      : options.output.format === 'custom'
        ? options.output.customSeparator || '\n'
        : options.output.separator || ', ';

  return parts.join(separator);
}

/** 粗略统计文本里是否还有中文，用于成品提示。 */
export function countCJK(text: string): number {
  let count = 0;
  for (const ch of text) if (CJK_RE.test(ch)) count++;
  return count;
}

/** 把文本编辑器中的内容拆成可管理的片段对象（保留 id 交给调用方）。 */
export function deriveSegmentTexts(text: string): string[] {
  return splitPromptSegments(text);
}
