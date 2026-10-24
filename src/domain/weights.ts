/**
 * 片段模式下的加权 / 降权工具。
 *
 * 普通 SD 语法：
 *   (word)   加权（约 1.1）
 *   ((word)) 继续加权
 *   [word]   降权（约 0.9）
 *   [[word]] 继续降权
 *
 * 这里只在“单词 / 单句”外层增加或移除一层括号，不擅自改数字，
 * 也不会改动括号内部的原文。
 */

export type WeightGranularity = 'word' | 'sentence';
export type WeightDirection = 'increase' | 'decrease';

export interface WeightUnit {
  type: 'unit' | 'separator';
  text: string;
  start: number;
  end: number;
}

const SENTENCE_SEPARATORS = new Set([',', '，', ';', '；', '.', '。', '!', '！', '?', '？', '\n', '\r']);
const WORD_SEPARATORS = new Set([
  ...SENTENCE_SEPARATORS,
  ' ',
  '\t',
  '|',
  '/',
]);

const OPEN_BRACKETS = new Set(['(', '[', '{', '（', '【']);
const CLOSE_BRACKETS = new Set([')', ']', '}', '）', '】']);

function isSeparator(char: string, granularity: WeightGranularity): boolean {
  return granularity === 'word' ? WORD_SEPARATORS.has(char) : SENTENCE_SEPARATORS.has(char);
}

/**
 * 把提示词切成可点击的单元。
 * - word：空白、逗号、句号等都会切分；括号/方括号内部的空格不会被切开。
 * - sentence：只按逗号/分号/句号/换行切分，英文短语保留为一句。
 * 括号本身是单元的一部分，因此点击 (long hair:1.2) 会整体加/减权重。
 */
export function parseWeightUnits(text: string, granularity: WeightGranularity): WeightUnit[] {
  const units: WeightUnit[] = [];
  let i = 0;
  let depth = 0;
  let quote: '"' | '“' | null = null;

  while (i < text.length) {
    const char = text[i];

    if (depth === 0 && !quote && isSeparator(char, granularity)) {
      let j = i + 1;
      while (j < text.length && depth === 0 && !quote && isSeparator(text[j], granularity)) j++;
      units.push({ type: 'separator', text: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    if ((char === '"' || char === '“') && depth === 0) {
      quote = quote ? null : char === '“' ? '“' : '"';
      // 引号本身不切开，继续把它并入当前单元
    }

    if (OPEN_BRACKETS.has(char)) depth++;
    else if (CLOSE_BRACKETS.has(char) && depth > 0) depth--;

    let j = i + 1;
    while (j < text.length) {
      const next = text[j];
      if (depth === 0 && !quote && isSeparator(next, granularity)) break;
      if (next === '"' && depth === 0) {
        quote = quote ? null : '"';
      } else if (next === '“' && depth === 0 && !quote) {
        quote = '“';
      } else if (next === '”' && quote === '“') {
        quote = null;
      }
      if (OPEN_BRACKETS.has(next)) depth++;
      else if (CLOSE_BRACKETS.has(next) && depth > 0) depth--;
      j++;
    }

    const raw = text.slice(i, j);
    const trimmedStart = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) {
      units.push({
        type: 'unit',
        text: trimmed,
        start: i + trimmedStart,
        end: i + trimmedStart + trimmed.length,
      });
    }
    i = j;
  }

  return units;
}

export interface WeightApplyResult {
  text: string;
  start: number;
  end: number;
  direction: WeightDirection;
}

/**
 * 对文本中的 [start, end) 单元加一层括号或去掉一层括号。
 * 返回值包含新的区间，方便连续点击时保持高亮。
 */
export function applyWeight(
  text: string,
  start: number,
  end: number,
  direction: WeightDirection,
): WeightApplyResult {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  let unit = text.slice(safeStart, safeEnd);
  if (!unit.trim()) {
    return { text, start, end, direction };
  }

  const leading = unit.length - unit.trimStart().length;
  const trailing = unit.length - unit.trimEnd().length;
  const core = unit.trim();

  let nextCore = core;
  if (direction === 'increase') {
    if (core.startsWith('[') && core.endsWith(']') && core.length >= 2) {
      nextCore = core.slice(1, -1);
    } else {
      nextCore = `(${core})`;
    }
  } else if (/^\([^()]*:\s*-?\d+(?:\.\d+)?\)$/.test(core)) {
    // 数字权重 (word:1.2) 不拆掉括号，否则会残留下非法的 :1.2。
    nextCore = `[${core}]`;
  } else if (core.startsWith('(') && core.endsWith(')') && core.length >= 2) {
    nextCore = core.slice(1, -1);
  } else {
    nextCore = `[${core}]`;
  }

  const nextUnit = `${' '.repeat(leading)}${nextCore}${' '.repeat(trailing)}`;
  const nextText = text.slice(0, safeStart) + nextUnit + text.slice(safeEnd);
  return {
    text: nextText,
    start: safeStart + leading,
    end: safeStart + leading + nextCore.length,
    direction,
  };
}

/** 取出当前提示词里所有加权/降权片段，按最外层分组统计。 */
export function countWeightGroups(text: string): { increased: number; decreased: number } {
  let increased = 0;
  let decreased = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '[') {
      if (depth === 0) {
        if (char === '(') increased++;
        else decreased++;
      }
      depth++;
    } else if ((char === ')' || char === ']') && depth > 0) {
      depth--;
    }
  }
  return { increased, decreased };
}
