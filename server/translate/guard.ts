import { TranslationError } from './types.js';

/**
 * 翻译前的提示词语法保护。
 * 权重数字、LoRA 标签、BREAK 等会被替换为占位符，翻译完成后按原样还原，
 * 避免翻译服务改写这些对生图有实际意义的语法。
 */

const PLACEHOLDER_PREFIX = '[[PS';
const PLACEHOLDER_SUFFIX = ']]';

export interface GuardResult {
  text: string;
  tokens: string[];
}

function placeholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

export function protectPromptSyntax(text: string): GuardResult {
  const tokens: string[] = [];
  let output = text;

  const addToken = (value: string): string => {
    const index = tokens.length;
    tokens.push(value);
    return placeholder(index);
  };

  // 1. <lora:xxx:0.8> / <hypernet:xxx> 等标签整体保护
  output = output.replace(/<[A-Za-z][\w.-]*:[^<>\n]*>/g, (match) => addToken(match));

  // 2. BREAK 分隔符
  output = output.replace(/\bBREAK\b/g, (match) => addToken(match));

  // 3. 括号权重语法里的数字部分，例如 (long hair:1.2)
  output = output.replace(/:\s*-?\d+(?:\.\d+)?(?=\s*\))/g, (match) => addToken(match));

  return { text: output, tokens };
}

export function restorePromptSyntax(translated: string, tokens: string[]): string {
  if (tokens.length === 0) return translated;
  let output = translated;
  const missing: number[] = [];

  tokens.forEach((token, index) => {
    const pattern = new RegExp(`\\[\\[\\s*PS\\s*${index}\\s*\\]\\]`, 'gi');
    if (output.match(pattern) === null) {
      missing.push(index);
      return;
    }
    output = output.replace(pattern, token);
  });

  if (missing.length > 0) {
    throw new TranslationError(
      '翻译服务没有保留提示词语法（权重、LoRA 标签等），本次翻译已取消，原内容没有被修改。',
      'SYNTAX_LOST',
      '可以尝试更换翻译服务，或把复杂语法片段单独保留为英文。',
    );
  }

  // 双保险：不应残留任何占位符
  if (/\[\[\s*PS\s*\d+\s*\]\]/i.test(output)) {
    throw new TranslationError(
      '翻译结果中残留了无法还原的占位符，本次翻译已取消。',
      'SYNTAX_LOST',
    );
  }

  // 翻译服务可能在占位符前插入空格，例如 (white hair :1.2)，这里恢复标准权重写法。
  output = output
    .replace(/\s+(?=:\s*-?\d+(?:\.\d+)?\s*\))/g, '')
    .replace(/(:\s*-?\d+(?:\.\d+)?)\s+\)/g, '$1)');

  return output;
}

export function countPlaceholders(text: string): number {
  return (text.match(/\[\[\s*PS\s*\d+\s*\]\]/gi) ?? []).length;
}
