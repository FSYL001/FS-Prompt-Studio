import type { Lora, OutputConfig, ProductLora } from './types';

/** 权重统一保留最多两位小数，避免输出 0.8000000001 这种值。 */
export function formatWeight(weight: number): string {
  const rounded = Math.round(weight * 100) / 100;
  return String(rounded);
}

export function clampWeight(weight: number, lora?: Pick<Lora, 'weightMin' | 'weightMax'>): number {
  const min = lora?.weightMin ?? -10;
  const max = lora?.weightMax ?? 10;
  return Math.min(max, Math.max(min, weight));
}

export function fillLoraTemplate(
  template: string,
  values: { file: string; name: string; weight: string; triggers: string },
): string {
  return template
    .replaceAll('{file}', values.file)
    .replaceAll('{name}', values.name)
    .replaceAll('{weight}', values.weight)
    .replaceAll('{triggers}', values.triggers);
}

/**
 * 生成 LoRA 文本。SD / 常见 WebUI 使用 `<lora:file:weight>`；
 * ComfyUI 的“纯提示词”模式不会伪造 LoRA 调用语法，只输出触发词文本。
 */
export function buildLoraTokens(loras: ProductLora[], output: OutputConfig): {
  tokens: string[];
  triggers: string[];
  warnings: string[];
} {
  const tokens: string[] = [];
  const triggers: string[] = [];
  const warnings: string[] = [];

  loras
    .filter((l) => l.enabled)
    .forEach((lora) => {
      for (const trigger of lora.triggerWords) {
        const value = trigger.trim();
        if (value && !triggers.some((t) => t.toLowerCase() === value.toLowerCase())) {
          triggers.push(value);
        }
      }

      if (output.loraFormat === 'comfyui-text') return;

      const file = lora.file.trim();
      if (!file) {
        warnings.push(
          `LoRA「${lora.name || '未命名'}」缺少文件名，已跳过 LoRA 语法输出。请在 LoRA 管理里补全文件名。`,
        );
        return;
      }
      const template = output.loraTokenTemplate || '<lora:{file}:{weight}>';
      if (!/\{file\}/.test(template)) {
        warnings.push('LoRA 输出模板缺少 {file} 占位符，已使用默认格式。');
      }
      const token = fillLoraTemplate(template, {
        file,
        name: lora.name,
        weight: formatWeight(lora.weight),
        triggers: lora.triggerWords.join(', '),
      });
      if (!tokens.includes(token)) tokens.push(token);
    });

  return { tokens, triggers, warnings };
}

/** 读取多个推荐前缀；兼容旧版单前缀字段。 */
export function loraPromptPrefixes(
  lora: Pick<Lora, 'promptPrefixes' | 'promptPrefix'> | Pick<ProductLora, 'promptPrefixes' | 'promptPrefix'>,
): string[] {
  if (Array.isArray(lora.promptPrefixes) && lora.promptPrefixes.length > 0) {
    return lora.promptPrefixes.map((item) => item.trim()).filter(Boolean);
  }
  return lora.promptPrefix?.trim() ? [lora.promptPrefix.trim()] : [];
}

export function productLoraFromDefinition(lora: Lora, weight?: number): ProductLora {
  return {
    loraId: lora.id,
    name: lora.name,
    file: lora.file,
    weight: weight ?? clampWeight(lora.defaultWeight, lora),
    triggerWords: [...lora.triggerWords],
    promptPrefixes: [...loraPromptPrefixes(lora)],
    sourceUrl: lora.sourceUrl,
    promptPrefix: lora.promptPrefix,
    recommendedNegative: lora.recommendedNegative,
    enabled: lora.enabled,
  };
}

export function loraUsesModel(lora: Pick<Lora, 'modelTypes'>, modelType: string): boolean {
  return lora.modelTypes.includes(modelType as Lora['modelTypes'][number]);
}

/** 判断当前作品是否已有该 LoRA。 */
export function findActiveLora(active: ProductLora[], loraId: string | null): number {
  if (!loraId) return -1;
  return active.findIndex((l) => l.loraId === loraId);
}
