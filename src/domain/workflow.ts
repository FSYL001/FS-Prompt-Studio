import type { ProductLora } from './types';

/**
 * ComfyUI 工作流导出。
 *
 * 只处理 ComfyUI「API 格式」的工作流 JSON（{ "节点ID": { class_type, inputs } }），
 * 并按用户显式配置的节点 ID 写入提示词与 LoRA。不会声称任意工作流都可以直接导入。
 */

export interface WorkflowMapping {
  positiveNodeId: string;
  negativeNodeId: string;
  loraLoaderNodeIds: string[];
  checkpointNodeId: string;
}

export interface WorkflowPatchInput {
  templateJson: string;
  mapping: WorkflowMapping;
  positive: string;
  negative: string;
  loras: ProductLora[];
  checkpointName?: string;
}

export interface WorkflowPatchResult {
  json: string;
  warnings: string[];
  patched: {
    positive: boolean;
    negative: boolean;
    loras: number;
    checkpoint: boolean;
  };
}

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

type ComfyNode = {
  class_type?: unknown;
  inputs?: Record<string, unknown>;
  [key: string]: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNode(root: Record<string, unknown>, id: string, role: string): ComfyNode {
  if (!id.trim()) throw new WorkflowError(`尚未配置${role}节点 ID。`);
  const node = root[id];
  if (!isPlainObject(node)) {
    throw new WorkflowError(`工作流中找不到${role}节点（ID: ${id}），请检查节点映射。`);
  }
  if (!isPlainObject(node.inputs)) {
    throw new WorkflowError(`${role}节点（ID: ${id}）不是可写入的 ComfyUI 节点。`);
  }
  return node as ComfyNode;
}

export function patchComfyWorkflow(input: WorkflowPatchInput): WorkflowPatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.templateJson);
  } catch {
    throw new WorkflowError('工作流模板不是合法的 JSON，请重新粘贴。');
  }
  if (!isPlainObject(parsed)) {
    throw new WorkflowError('工作流模板的顶层必须是 JSON 对象。');
  }
  if (Array.isArray(parsed.nodes)) {
    throw new WorkflowError(
      '检测到这是 ComfyUI 界面格式（含 nodes 数组）的工作流。请在 ComfyUI 中使用「导出 (API)」得到 API 格式 JSON 后再使用。',
    );
  }

  const nodeIds = Object.keys(parsed);
  const hasApiNodes = nodeIds.some((id) => {
    const node = parsed[id];
    return isPlainObject(node) && typeof node.class_type === 'string';
  });
  if (!hasApiNodes) {
    throw new WorkflowError('模板中没有找到 class_type 字段，这不是 ComfyUI API 格式的工作流。');
  }
  if (!nodeIds.some((id) => id === input.mapping.positiveNodeId.trim())) {
    throw new WorkflowError(
      `工作流中找不到正向提示词节点（ID: ${input.mapping.positiveNodeId || '未配置'}），请检查节点映射。`,
    );
  }

  const warnings: string[] = [];
  const root = parsed as Record<string, unknown>;

  const positiveNode = getNode(root, input.mapping.positiveNodeId, '正向提示词');
  if (typeof positiveNode.inputs?.text !== 'string') {
    throw new WorkflowError(
      `正向节点（ID: ${input.mapping.positiveNodeId}）没有 text 输入，可能不是 CLIPTextEncode 节点。`,
    );
  }
  positiveNode.inputs.text = input.positive;

  let negativePatched = false;
  if (input.mapping.negativeNodeId.trim()) {
    const negativeNode = getNode(root, input.mapping.negativeNodeId, '负向提示词');
    if (typeof negativeNode.inputs?.text !== 'string') {
      throw new WorkflowError(
        `负向节点（ID: ${input.mapping.negativeNodeId}）没有 text 输入，可能不是 CLIPTextEncode 节点。`,
      );
    }
    negativeNode.inputs.text = input.negative;
    negativePatched = true;
  } else if (input.negative.trim()) {
    warnings.push('未配置负向提示词节点，负向提示词没有写入工作流。');
  }

  const enabledLoras = input.loras.filter((l) => l.enabled);
  const loraNodeIds = input.mapping.loraLoaderNodeIds.map((id) => id.trim()).filter(Boolean);
  if (enabledLoras.length > loraNodeIds.length) {
    throw new WorkflowError(
      `当前成品有 ${enabledLoras.length} 个 LoRA，但工作流只映射了 ${loraNodeIds.length} 个 LoraLoader 节点。请补充节点映射，或减少 LoRA。`,
    );
  }
  let lorasPatched = 0;
  enabledLoras.forEach((lora, index) => {
    const nodeId = loraNodeIds[index];
    const node = getNode(root, nodeId, `LoRA（第 ${index + 1} 个）`);
    if (typeof node.class_type !== 'string' || !/LoraLoader/i.test(node.class_type)) {
      throw new WorkflowError(
        `节点 ${nodeId} 的类型是「${String(node.class_type)}」，不是 LoraLoader，无法写入 LoRA。`,
      );
    }
    if (!lora.file.trim()) {
      throw new WorkflowError(`LoRA「${lora.name || '未命名'}」缺少文件名，无法写入工作流。`);
    }
    if (!isPlainObject(node.inputs)) node.inputs = {};
    node.inputs.lora_name = lora.file.trim();
    node.inputs.strength_model = lora.weight;
    node.inputs.strength_clip = lora.weight;
    lorasPatched++;
  });
  if (enabledLoras.length < loraNodeIds.length) {
    warnings.push(
      `模板映射了 ${loraNodeIds.length} 个 LoraLoader 节点，本次只写入了 ${enabledLoras.length} 个，其余节点保持原样。`,
    );
  }

  let checkpointPatched = false;
  if (input.mapping.checkpointNodeId.trim()) {
    if (input.checkpointName?.trim()) {
      const node = getNode(root, input.mapping.checkpointNodeId, '模型加载');
      if (!/CheckpointLoader/i.test(String(node.class_type ?? ''))) {
        warnings.push(`节点 ${input.mapping.checkpointNodeId} 不是 CheckpointLoader，未写入模型文件名。`);
      } else {
        node.inputs = node.inputs ?? {};
        node.inputs.ckpt_name = input.checkpointName.trim();
        checkpointPatched = true;
      }
    } else {
      warnings.push('配置了模型节点，但没有填写模型文件名，已保留模板中的模型。');
    }
  }

  return {
    json: JSON.stringify(parsed, null, 2),
    warnings,
    patched: {
      positive: true,
      negative: negativePatched,
      loras: lorasPatched,
      checkpoint: checkpointPatched,
    },
  };
}

/**
 * 一个最小可运行的文生图 API 工作流示例（需把模型文件名换成本地文件）。
 * 仅作为模板起点，不会宣称与用户环境自动兼容。
 */
export function createExampleWorkflowJson(): string {
  const workflow = {
    4: {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'your-model.safetensors' },
    },
    10: {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: 'your-lora.safetensors',
        strength_model: 0.8,
        strength_clip: 0.8,
        model: ['4', 0],
        clip: ['4', 1],
      },
    },
    6: {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'positive prompt', clip: ['10', 1] },
    },
    7: {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'negative prompt', clip: ['10', 1] },
    },
    5: {
      class_type: 'EmptyLatentImage',
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    3: {
      class_type: 'KSampler',
      inputs: {
        seed: 123456789,
        steps: 30,
        cfg: 7,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1,
        model: ['10', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    8: {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    9: {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'PromptStudio', images: ['8', 0] },
    },
  };
  return JSON.stringify(workflow, null, 2);
}

export const EXAMPLE_WORKFLOW_MAPPING: WorkflowMapping = {
  positiveNodeId: '6',
  negativeNodeId: '7',
  loraLoaderNodeIds: ['10'],
  checkpointNodeId: '4',
};
