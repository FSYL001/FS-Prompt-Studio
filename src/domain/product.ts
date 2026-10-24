import { buildLoraTokens, formatWeight } from './lora';
import { composeFromSegments, countCJK, detectLanguage } from './promptParse';
import { modelTypeLabel } from './presets';
import type {
  Alignment,
  OutputConfig,
  PresetId,
  Product,
  ProductLora,
  PromptParams,
  PromptSegment,
} from './types';
import { newId, nowIso } from './id';

export function formatParams(params: PromptParams): string {
  const size = `${params.width}x${params.height}`;
  const parts = [
    `Steps: ${params.steps}`,
    `CFG scale: ${params.cfg}`,
    `Sampler: ${params.sampler || '默认'}`,
    `Seed: ${params.seed}`,
    `Size: ${size}`,
    `Model: ${params.modelName || modelTypeLabel(params.modelType)}`,
  ];
  if (params.clipSkip > 0) parts.push(`Clip skip: ${params.clipSkip}`);
  return parts.join(', ');
}

export interface PromptAssemblyInput {
  englishText: string;
  draftText: string;
  negativeText: string;
  segments: PromptSegment[];
  activeLoras: ProductLora[];
  params: PromptParams;
  presetId: PresetId;
  output: OutputConfig;
}

export interface PromptAssembly {
  positive: string;
  negative: string;
  final: string;
  loraTokens: string[];
  triggerWords: string[];
  paramsText: string;
  warnings: string[];
}

function uniqueAppend(base: string[], additions: string[]): string[] {
  const result = [...base];
  for (const item of additions) {
    const value = item.trim();
    if (!value) continue;
    if (!result.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      result.push(value);
    }
  }
  return result;
}

function joinParts(parts: string[], separator: string): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(separator)
    .replace(/[ \t]+$/g, '');
}

/**
 * 根据当前编辑器内容生成成品提示词。
 * 不会自动添加质量词、画风词；LoRA 触发词只来自用户填写的 LoRA 定义。
 */
export function assemblePrompts(input: PromptAssemblyInput): PromptAssembly {
  const warnings: string[] = [];
  const separator =
    input.output.format === 'lines'
      ? '\n'
      : input.output.format === 'custom'
        ? input.output.customSeparator || '\n'
        : input.output.separator || ', ';

  let positiveBase = input.englishText.trim();
  if (!positiveBase && input.segments.length > 0) {
    positiveBase = composeFromSegments(input.segments, {
      output: input.output,
      polarity: 'positive',
    });
    if (positiveBase) warnings.push('英文提示词为空，已使用片段内容生成成品。');
  }

  const negativeFromSegments = composeFromSegments(input.segments, {
    output: input.output,
    polarity: 'negative',
  });

  const negativeParts = [input.negativeText.trim(), negativeFromSegments].filter(Boolean);
  let negative = joinParts(negativeParts, separator);
  if (!negative && input.negativeText.trim()) negative = input.negativeText.trim();

  const { tokens, triggers, warnings: loraWarnings } = buildLoraTokens(input.activeLoras, input.output);
  warnings.push(...loraWarnings);

  const parts: string[] = [];
  // 自定义输出模板自行通过 {triggers} / {loras} 放置这些内容，避免重复。
  if (!input.output.useCustomTemplate) {
    if (input.output.includeTriggers && triggers.length > 0) {
      const lower = positiveBase.toLowerCase();
      const missingTriggers = triggers.filter((t) => !lower.includes(t.toLowerCase()));
      parts.push(...missingTriggers);
    }
    if (positiveBase) parts.push(positiveBase);
    // ComfyUI 纯文本模式不输出 <lora:...>，只保留触发词。
    if (tokens.length > 0) parts.push(...tokens);
  } else if (positiveBase) {
    parts.push(positiveBase);
  }

  let positive = joinParts(parts, separator);

  if (!input.output.negativeSeparate && negative) {
    positive = joinParts([positive, negative], separator);
    negative = '';
  }

  if (!positive) {
    warnings.push('成品正向提示词为空，请先输入或翻译提示词。');
  }
  if (input.output.pureEnglish) {
    const cjkCount = countCJK(positive) + countCJK(negative);
    if (cjkCount > 0) {
      warnings.push(`成品中仍有 ${cjkCount} 个中文字符，可能无法被生图模型正确理解，请检查译文。`);
    }
  }

  const paramsText = formatParams(input.params);

  if (input.output.useCustomTemplate) {
    if (!input.output.customOutputTemplate.includes('{positive}')) {
      warnings.push('自定义输出模板缺少 {positive} 占位符，成品可能不包含正向提示词。');
    }
  }

  const final = composeFinalFromProduct({
    positive,
    negative,
    params: input.params,
    output: input.output,
    loras: input.activeLoras,
  });

  if (input.output.includeChineseComments) {
    warnings.push('中文注释只会写入 TXT 导出文件，不会混入可直接使用的提示词。');
  }

  return { positive, negative, final, loraTokens: tokens, triggerWords: triggers, paramsText, warnings };
}

/** 供成品编辑后重新计算完整文本。 */
export function composeFinalFromProduct(product: {
  positive: string;
  negative: string;
  params: PromptParams;
  output: OutputConfig;
  loras: ProductLora[];
}): string {
  const paramsText = formatParams(product.params);
  const lorasText = buildLoraTokens(product.loras, product.output).tokens.join(
    product.output.separator || ', ',
  );
  const triggersText = buildLoraTokens(product.loras, product.output).triggers.join(
    product.output.separator || ', ',
  );

  if (product.output.useCustomTemplate && product.output.customOutputTemplate.trim()) {
    const result = product.output.customOutputTemplate
      .replaceAll('{positive}', product.positive)
      .replaceAll('{negative}', product.negative)
      .replaceAll('{loras}', lorasText)
      .replaceAll('{triggers}', triggersText)
      .replaceAll('{params}', paramsText);
    return result.replace(/[ \t]+\n/g, '\n').trimEnd();
  }

  let final = product.positive;
  if (product.negative) final += `\nNegative prompt: ${product.negative}`;
  if (product.output.includeParams && paramsText) final += `\n${paramsText}`;
  return final;
}

export interface CreateProductInput extends PromptAssemblyInput {
  name?: string;
  assembly?: PromptAssembly;
  alignment?: Alignment | null;
  translationZhText?: string;
  negativeZhText?: string;
  id?: string;
  now?: string;
}

export function createProduct(input: CreateProductInput): Product {
  const assembly = input.assembly ?? assemblePrompts(input);
  const timestamp = input.now ?? nowIso();
  const fallbackName = `成品 ${timestamp.slice(0, 16).replace('T', ' ')}`;
  return {
    id: input.id ?? newId('product'),
    name: (input.name?.trim() || fallbackName).slice(0, 200),
    positive: assembly.positive,
    negative: assembly.negative,
    final: assembly.final,
    draftText: input.draftText,
    translationZhText: input.translationZhText ?? '',
    englishText: input.englishText,
    negativeText: input.negativeText,
    negativeZhText: input.negativeZhText ?? '',
    alignment: input.alignment ?? null,
    segments: input.segments.map((s) => ({ ...s })),
    loras: input.activeLoras.map((l) => ({ ...l, triggerWords: [...l.triggerWords] })),
    params: { ...input.params },
    presetId: input.presetId,
    output: { ...input.output },
    notes: '',
    favorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function loraSummaryLines(loras: ProductLora[]): string[] {
  return loras
    .filter((l) => l.enabled)
    .map((l, index) => {
      const file = l.file.trim() || '（缺少文件名）';
      const triggers = l.triggerWords.length > 0 ? l.triggerWords.join(', ') : '（无）';
      return `${index + 1}. ${l.name || '未命名'} | 文件名: ${file} | 权重: ${formatWeight(l.weight)} | 触发词: ${triggers}`;
    });
}

export function buildTxtExport(product: Product, includeChineseComments = true): string {
  const lines: string[] = [];
  lines.push(`# ${product.name}`);
  lines.push(`创建时间: ${product.createdAt}`);
  lines.push(`模型: ${modelTypeLabel(product.params.modelType)}${product.params.modelName ? ` (${product.params.modelName})` : ''}`);
  lines.push(`参数: ${formatParams(product.params)}`);
  lines.push('');
  lines.push('--- 正向提示词 ---');
  lines.push(product.positive);
  lines.push('');
  lines.push('--- 负向提示词 ---');
  lines.push(product.negative || '（无）');
  lines.push('');
  if (product.loras.length > 0) {
    lines.push('--- LoRA ---');
    lines.push(...loraSummaryLines(product.loras));
    lines.push('');
  }
  if (product.notes.trim()) {
    lines.push('--- 备注 ---');
    lines.push(product.notes.trim());
    lines.push('');
  }
  if (includeChineseComments) {
    lines.push('--- 中文草稿（仅供参考，不是提示词） ---');
    lines.push(product.draftText.trim() || '（无）');
    lines.push('');
    if (product.translationZhText.trim() && product.translationZhText.trim() !== product.draftText.trim()) {
      lines.push('--- 中文翻译原文 ---');
      lines.push(product.translationZhText.trim());
      lines.push('');
    }
    if (product.negativeZhText.trim()) {
      lines.push('--- 中文负向提示词（仅供参考） ---');
      lines.push(product.negativeZhText.trim());
      lines.push('');
    }
    if (product.segments.length > 0) {
      lines.push('--- 片段 ---');
      for (const seg of product.segments) {
        lines.push(
          `[${seg.polarity === 'negative' ? '负向' : '正向'}] ${seg.text}${seg.translated ? ` → ${seg.translated}` : ''}`,
        );
      }
      lines.push('');
    }
  }
  lines.push('--- 完整成品 ---');
  lines.push(product.final);
  lines.push('');
  lines.push('# 由 FS-Prompt Studio 生成；数据默认仅保存在你的浏览器本地。');
  return lines.join('\n');
}

export function buildJsonExport(product: Product): string {
  return JSON.stringify(product, null, 2);
}

/** 语言提示：用于成品区的“未翻译”警告。 */
export function promptLanguageNote(text: string): string | null {
  const lang = detectLanguage(text);
  if (lang === 'zh') return '当前内容仍以中文为主，建议先翻译成英文。';
  if (lang === 'mixed') return '当前内容中英混合，请确认模型能正确理解。';
  return null;
}
