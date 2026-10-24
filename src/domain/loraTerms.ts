import type { Lora, ProductLora } from './types';

/**
 * 收集 LoRA 触发词，用于翻译时保护这些词不被翻译。
 * 例如 @dizzy 或 dizzy 都应该原样保留，不能变成「眩晕」。
 */
export function collectLoraTerms(
  loras: Array<Pick<Lora, 'triggerWords'>>,
  activeLoras: Array<Pick<ProductLora, 'triggerWords'>> = [],
): string[] {
  const terms = new Set<string>();
  const add = (raw: string) => {
    const value = raw.trim().replace(/^@+/, '');
    if (!value) return;
    if (value.length > 200) return;
    if (!/[\p{L}\p{N}]/u.test(value)) return;
    terms.add(value);
  };
  for (const lora of loras) lora.triggerWords.forEach(add);
  for (const lora of activeLoras) lora.triggerWords.forEach(add);
  return [...terms].slice(0, 200);
}

/** 从文本中提取所有 @trigger，用于服务端保护（服务端也会自动保护 @ 词元）。 */
export function extractAtTerms(text: string): string[] {
  return [...new Set(text.match(/@[\p{L}\p{N}_.-]+/gu) ?? [])];
}
