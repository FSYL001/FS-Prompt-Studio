import { describe, expect, it } from 'vitest';
import {
  assemblePrompts,
  buildTxtExport,
  composeFinalFromProduct,
  createProduct,
  formatParams,
} from '../src/domain/product';
import { buildLoraTokens } from '../src/domain/lora';
import { DEFAULT_OUTPUT, DEFAULT_PARAMS, PromptParamsSchema, ProductLoraSchema } from '../src/domain/types';
import type { ProductLora, PromptSegment } from '../src/domain/types';

const lora: ProductLora = ProductLoraSchema.parse({
  loraId: 'lora_1',
  name: '水彩风',
  file: 'watercolor.safetensors',
  weight: 0.8,
  triggerWords: ['watercolor_style'],
  enabled: true,
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    englishText: '1girl, white hair, black dress',
    draftText: '一个白发女孩，穿着黑色连衣裙',
    negativeText: 'lowres, blurry',
    segments: [] as PromptSegment[],
    activeLoras: [lora],
    params: { ...DEFAULT_PARAMS, modelName: 'sdxl_base.safetensors' },
    presetId: 'sdxl' as const,
    output: { ...DEFAULT_OUTPUT },
    ...overrides,
  };
}

describe('成品组装', () => {
  it('不擅自添加质量词，追加触发词与 LoRA 语法', () => {
    const assembly = assemblePrompts(baseInput());
    expect(assembly.positive).toContain('1girl, white hair, black dress');
    expect(assembly.positive).toContain('watercolor_style');
    expect(assembly.positive).toContain('<lora:watercolor.safetensors:0.8>');
    expect(assembly.positive.toLowerCase()).not.toContain('masterpiece');
    expect(assembly.positive.toLowerCase()).not.toContain('best quality');
    expect(assembly.negative).toBe('lowres, blurry');
    expect(assembly.final).toContain('Negative prompt: lowres, blurry');
    expect(assembly.warnings).toHaveLength(0);
  });

  it('缺少 LoRA 文件名时提示并跳过语法输出', () => {
    const assembly = assemblePrompts(
      baseInput({ activeLoras: [{ ...lora, file: '' }] }),
    );
    expect(assembly.positive).not.toContain('<lora:');
    expect(assembly.warnings.some((warning) => warning.includes('缺少文件名'))).toBe(true);
  });

  it('ComfyUI 纯文本模式不输出 <lora:...>', () => {
    const assembly = assemblePrompts(
      baseInput({ output: { ...DEFAULT_OUTPUT, loraFormat: 'comfyui-text' } }),
    );
    expect(assembly.positive).not.toContain('<lora:');
    expect(assembly.positive).toContain('watercolor_style');
  });

  it('正负提示词合并且包含参数', () => {
    const assembly = assemblePrompts(
      baseInput({
        output: { ...DEFAULT_OUTPUT, negativeSeparate: false, includeParams: true },
      }),
    );
    expect(assembly.negative).toBe('');
    expect(assembly.positive).toContain('lowres');
    expect(assembly.final).toContain('Steps:');
    expect(assembly.final).toContain('CFG scale:');
    expect(assembly.final).not.toContain('Negative prompt:');
  });

  it('自定义模板会使用 {positive} {negative} {loras}', () => {
    const assembly = assemblePrompts(
      baseInput({
        output: {
          ...DEFAULT_OUTPUT,
          useCustomTemplate: true,
          customOutputTemplate: 'POS: {positive}\nNEG: {negative}\nLORA: {loras}',
        },
      }),
    );
    expect(assembly.final).toContain(`POS: ${assembly.positive}`);
    expect(assembly.final).toContain('NEG: lowres, blurry');
    expect(assembly.final).toContain('LORA: <lora:watercolor.safetensors:0.8>');
  });

  it('中文残留时给出警告', () => {
    const assembly = assemblePrompts(baseInput({ englishText: '长发, long hair' }));
    expect(assembly.warnings.some((warning) => warning.includes('中文字符'))).toBe(true);
  });

  it('英文为空时可以用片段组合', () => {
    const segments: PromptSegment[] = [
      { id: 's1', text: '长发', translated: 'long hair', polarity: 'positive', locked: false, weight: null },
      { id: 's2', text: '蓝色眼睛', translated: 'blue eyes', polarity: 'negative', locked: false, weight: null },
    ];
    const assembly = assemblePrompts(baseInput({ englishText: '', segments, activeLoras: [] }));
    expect(assembly.positive).toBe('long hair');
    expect(assembly.negative).toBe('lowres, blurry, blue eyes');
  });

  it('片段权重会进入成品', () => {
    const segments: PromptSegment[] = [
      { id: 's1', text: 'long hair', translated: '', polarity: 'positive', locked: false, weight: 1.25 },
    ];
    const assembly = assemblePrompts(
      baseInput({
        englishText: '',
        segments,
        activeLoras: [],
        output: { ...DEFAULT_OUTPUT, includeWeights: true },
      }),
    );
    expect(assembly.positive).toBe('(long hair:1.25)');
  });
});

describe('LoRA 输出', () => {
  it('默认使用 SD 语法，并去重触发词', () => {
    const result = buildLoraTokens(
      [
        { ...lora, triggerWords: ['watercolor_style', 'watercolor_style'] },
        { ...lora, loraId: '2', name: '另一个', file: 'other.safetensors', weight: 1, triggerWords: [] },
      ],
      DEFAULT_OUTPUT,
    );
    expect(result.tokens).toEqual([
      '<lora:watercolor.safetensors:0.8>',
      '<lora:other.safetensors:1>',
    ]);
    expect(result.triggers).toEqual(['watercolor_style']);
  });

  it('支持自定义 LoRA 模板', () => {
    const result = buildLoraTokens([lora], {
      ...DEFAULT_OUTPUT,
      loraFormat: 'custom',
      loraTokenTemplate: 'LORA({file}@{weight})',
    });
    expect(result.tokens[0]).toBe('LORA(watercolor.safetensors@0.8)');
  });
});

describe('参数与导出', () => {
  it('参数格式稳定', () => {
    const params = PromptParamsSchema.parse({ steps: 30, cfg: 7, width: 1024, height: 1024 });
    const text = formatParams(params);
    expect(text).toContain('Steps: 30');
    expect(text).toContain('Size: 1024x1024');
    expect(text).toContain('Model: SDXL');
  });

  it('成品可编辑后重新计算完整文本', () => {
    const final = composeFinalFromProduct({
      positive: 'new positive',
      negative: 'new negative',
      params: { ...DEFAULT_PARAMS, modelName: 'test.safetensors' },
      output: { ...DEFAULT_OUTPUT, includeParams: true },
      loras: [lora],
    });
    expect(final).toContain('new positive');
    expect(final).toContain('Negative prompt: new negative');
    expect(final).toContain('Steps:');
  });

  it('TXT 导出包含中文草稿与完整成品', () => {
    const product = createProduct(baseInput());
    const txt = buildTxtExport(product);
    expect(txt).toContain('--- 正向提示词 ---');
    expect(txt).toContain('--- 中文草稿');
    expect(txt).toContain(product.final);
    expect(txt).toContain('watercolor.safetensors');
  });

  it('创建成品不会修改原始输入', () => {
    const input = baseInput();
    const product = createProduct(input);
    expect(input.englishText).toBe('1girl, white hair, black dress');
    expect(product.englishText).toBe(input.englishText);
    expect(product.draftText).toBe(input.draftText);
  });
});
