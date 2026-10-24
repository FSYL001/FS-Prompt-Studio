import { OutputConfigSchema, PromptParamsSchema } from './types';
import type { ModelType, OutputConfig, PresetId, PromptParams } from './types';

export interface PresetDefinition {
  id: PresetId;
  label: string;
  summary: string;
  output: OutputConfig;
  params: PromptParams;
  notes: string[];
}

const BASE_OUTPUT = OutputConfigSchema.parse({});
const BASE_PARAMS = PromptParamsSchema.parse({});

export const PRESETS: Record<PresetId, PresetDefinition> = {
  sd15: {
    id: 'sd15',
    label: 'SD 1.5',
    summary: '标签式短提示词 + 权重括号语法，兼容 A1111 / Forge 等常见 WebUI。',
    output: { ...BASE_OUTPUT, format: 'tags', separator: ', ', includeWeights: true, loraFormat: 'sd' },
    params: {
      ...BASE_PARAMS,
      modelType: 'sd15',
      steps: 28,
      cfg: 7,
      sampler: 'DPM++ 2M Karras',
      width: 512,
      height: 768,
      clipSkip: 2,
    },
    notes: ['默认使用逗号分隔、括号权重语法；不同 WebUI 对权重语法支持略有差异。'],
  },
  sdxl: {
    id: 'sdxl',
    label: 'SDXL',
    summary: '逗号分隔的标签或短句，适合大多数 SDXL 工作流。',
    output: { ...BASE_OUTPUT, format: 'tags', separator: ', ', includeWeights: true, loraFormat: 'sd' },
    params: {
      ...BASE_PARAMS,
      modelType: 'sdxl',
      steps: 30,
      cfg: 7,
      sampler: 'DPM++ 2M Karras',
      width: 1024,
      height: 1024,
      clipSkip: 2,
    },
    notes: ['不会自动添加质量词或风格词，避免改变你的原意。'],
  },
  flux: {
    id: 'flux',
    label: 'FLUX',
    summary: '更偏自然语言描述，默认不输出括号权重，避免前端不识别。',
    output: {
      ...BASE_OUTPUT,
      format: 'tags',
      separator: ', ',
      includeWeights: false,
      loraFormat: 'sd',
    },
    params: {
      ...BASE_PARAMS,
      modelType: 'flux',
      steps: 20,
      cfg: 3.5,
      sampler: 'Euler',
      width: 1024,
      height: 1024,
      clipSkip: 1,
    },
    notes: [
      'FLUX 通常更适合完整自然语言句子；括号权重语法并非所有 FLUX 前端都支持。',
      'LoRA 的文本调用方式取决于你使用的前端，必要时请用工作流模板导出。',
    ],
  },
  comfyui: {
    id: 'comfyui',
    label: 'ComfyUI 通用',
    summary: '输出纯提示词文本（触发词），LoRA 调用请使用工作流模板导出。',
    output: {
      ...BASE_OUTPUT,
      format: 'tags',
      separator: ', ',
      includeWeights: false,
      loraFormat: 'comfyui-text',
      includeTriggers: true,
    },
    params: {
      ...BASE_PARAMS,
      modelType: 'comfyui',
      steps: 25,
      cfg: 7,
      sampler: 'euler',
      width: 1024,
      height: 1024,
      clipSkip: 1,
    },
    notes: [
      '纯提示词不会包含 <lora:...> 文本；真正的 LoRA 调用需要工作流模板与节点映射。',
      '不会宣称没有经过工作流验证的兼容性。',
    ],
  },
  custom: {
    id: 'custom',
    label: '自定义',
    summary: '保留你当前的所有输出设置。',
    output: { ...BASE_OUTPUT },
    params: { ...BASE_PARAMS },
    notes: ['自定义预设不会强制套用任何模型习惯。'],
  },
};

export function getPreset(id: PresetId): PresetDefinition {
  return PRESETS[id] ?? PRESETS.custom;
}

export interface PresetApplyInput {
  presetId: PresetId;
  output: OutputConfig;
  params: PromptParams;
}

export interface PresetApplyResult {
  presetId: PresetId;
  output: OutputConfig;
  params: PromptParams;
}

export function applyPreset(input: PresetApplyInput, id: PresetId): PresetApplyResult {
  if (id === 'custom') {
    return {
      presetId: 'custom',
      output: { ...input.output },
      params: { ...input.params, modelType: 'custom' },
    };
  }
  const preset = getPreset(id);
  return {
    presetId: id,
    output: { ...preset.output },
    params: { ...preset.params },
  };
}

export function modelTypeLabel(type: ModelType): string {
  switch (type) {
    case 'sd15':
      return 'SD 1.5';
    case 'sdxl':
      return 'SDXL';
    case 'flux':
      return 'FLUX';
    case 'comfyui':
      return 'ComfyUI 通用';
    default:
      return '自定义';
  }
}
