import { describe, expect, it } from 'vitest';
import {
  createExampleWorkflowJson,
  EXAMPLE_WORKFLOW_MAPPING,
  patchComfyWorkflow,
  WorkflowError,
} from '../src/domain/workflow';
import type { ProductLora } from '../src/domain/types';

const lora: ProductLora = {
  loraId: 'l1',
  name: 'Style',
  file: 'style.safetensors',
  weight: 0.75,
  triggerWords: ['style_trigger'],
  enabled: true,
};

function patch(overrides: Record<string, unknown> = {}) {
  return patchComfyWorkflow({
    templateJson: createExampleWorkflowJson(),
    mapping: EXAMPLE_WORKFLOW_MAPPING,
    positive: '1girl, white hair',
    negative: 'lowres',
    loras: [lora],
    checkpointName: 'sdxl_base.safetensors',
    ...overrides,
  });
}

describe('ComfyUI 工作流导出', () => {
  it('写入正向、负向、LoRA 与模型节点，同时保留其它节点', () => {
    const result = patch();
    const json = JSON.parse(result.json);
    expect(json['6'].inputs.text).toBe('1girl, white hair');
    expect(json['7'].inputs.text).toBe('lowres');
    expect(json['10'].inputs.lora_name).toBe('style.safetensors');
    expect(json['10'].inputs.strength_model).toBe(0.75);
    expect(json['10'].inputs.strength_clip).toBe(0.75);
    expect(json['4'].inputs.ckpt_name).toBe('sdxl_base.safetensors');
    expect(json['3'].class_type).toBe('KSampler');
    expect(result.patched).toMatchObject({ positive: true, negative: true, loras: 1, checkpoint: true });
  });

  it('移除文本中 SD 的 <lora:...>，避免误认为 ComfyUI 调用语法', () => {
    const result = patch({ positive: '1girl, <lora:style:0.8>, white hair' });
    const json = JSON.parse(result.json);
    expect(json['6'].inputs.text).not.toContain('<lora:');
    expect(result.warnings.some((warning) => warning.includes('<lora:'))).toBe(true);
  });

  it('拒绝 ComfyUI 界面格式的工作流', () => {
    expect(() =>
      patch({
        templateJson: JSON.stringify({ nodes: [{ id: 1, type: 'CLIPTextEncode' }], links: [] }),
      }),
    ).toThrow(WorkflowError);
    expect(() =>
      patch({
        templateJson: JSON.stringify({ nodes: [{ id: 1, type: 'CLIPTextEncode' }], links: [] }),
      }),
    ).toThrow(/API/);
  });

  it('拒绝非法 JSON 与不存在的节点', () => {
    expect(() => patch({ templateJson: '{oops' })).toThrow(/JSON/);
    expect(() => patch({ mapping: { ...EXAMPLE_WORKFLOW_MAPPING, positiveNodeId: '999' } })).toThrow(
      /正向提示词节点/,
    );
  });

  it('LoRA 多于映射节点时明确报错', () => {
    expect(() =>
      patch({
        loras: [lora, { ...lora, file: 'b.safetensors' }],
      }),
    ).toThrow(/只有|但工作流只映射|LoraLoader/);
  });

  it('LoRA 缺少文件名时拒绝导出', () => {
    expect(() => patch({ loras: [{ ...lora, file: '' }] })).toThrow(/缺少文件名/);
  });

  it('映射到非 LoraLoader 节点时拒绝写入', () => {
    expect(() =>
      patch({ mapping: { ...EXAMPLE_WORKFLOW_MAPPING, loraLoaderNodeIds: ['6'] } }),
    ).toThrow(/LoraLoader/);
  });

  it('未配置负向节点时给出提示，不伪造写入', () => {
    const result = patch({ mapping: { ...EXAMPLE_WORKFLOW_MAPPING, negativeNodeId: '' } });
    expect(result.patched.negative).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('负向提示词'))).toBe(true);
    const json = JSON.parse(result.json);
    expect(json['7'].inputs.text).toBe('negative prompt');
  });
});
