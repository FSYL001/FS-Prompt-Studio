import { useMemo, useState } from 'react';
import type { Product } from '../domain/types';
import { downloadText, copyText } from '../domain/id';
import { patchComfyWorkflow, WorkflowError } from '../domain/workflow';
import { useAppStore } from '../store/appStore';
import { Modal } from './ui/Modal';
import { Badge, Button, EmptyState, Field, InlineError, InlineWarning } from './ui/primitives';
import { Icon } from './ui/Icon';

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'prompt';
}

export function WorkflowExportModal({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const product = useAppStore((state) => state.products.find((item) => item.id === productId));
  const workflows = useAppStore((state) => state.settings.workflows);
  const activeWorkflowId = useAppStore((state) => state.settings.activeWorkflowId);
  const toast = useAppStore((state) => state.toast);
  const openModal = useAppStore((state) => state.openModal);

  const initialId =
    workflows.find((workflow) => workflow.id === activeWorkflowId)?.id ?? workflows[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(initialId);

  const workflow = workflows.find((item) => item.id === selectedId) ?? null;

  const result = useMemo(() => {
    if (!product || !workflow) return { error: null as string | null, json: '', warnings: [] as string[] };
    try {
      // ComfyUI 工作流里 LoRA 通过 LoraLoader 节点生效；patchComfyWorkflow 会移除文本中的 <lora:...>。
      const patched = patchComfyWorkflow({
        templateJson: workflow.json,
        mapping: workflow.mapping,
        positive: product.positive,
        negative: product.negative,
        loras: product.loras,
        checkpointName: product.params.modelName,
      });
      return { error: null, json: patched.json, warnings: patched.warnings };
    } catch (error) {
      return {
        error: error instanceof WorkflowError ? error.message : '生成工作流时出错。',
        json: '',
        warnings: [] as string[],
      };
    }
  }, [product, workflow]);

  if (!product) return null;

  const exportWorkflow = () => {
    if (!result.json) return;
    downloadText(
      `${safeFileName(product.name)}.comfyui-api.json`,
      result.json,
      'application/json;charset=utf-8',
    );
    toast('ComfyUI 工作流 JSON 已导出。请先在 ComfyUI 中确认节点与模型文件名。', 'success');
  };

  const exportPromptOnly = () => {
    const payload = {
      kind: 'prompt-only',
      note: '这不是 ComfyUI 工作流，不能直接导入运行；只包含提示词与 LoRA 信息。',
      name: product.name,
      positive: product.positive,
      negative: product.negative,
      loras: product.loras,
      params: product.params,
      createdAt: product.createdAt,
    };
    downloadText(
      `${safeFileName(product.name)}.prompt-only.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
    toast('纯提示词 JSON 已导出（不含工作流）。', 'success');
  };

  return (
    <Modal
      title="ComfyUI 工作流导出"
      subtitle="只改写你在模板中明确映射的节点；不会声称任意工作流都能直接运行。"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="secondary" icon="download" onClick={exportPromptOnly}>
            导出纯提示词 JSON
          </Button>
          <Button
            variant="secondary"
            icon="copy"
            disabled={!result.json}
            onClick={async () => {
              try {
                await copyText(result.json);
                toast('工作流 JSON 已复制。', 'success');
              } catch {
                toast('复制失败，请改用下载。', 'error');
              }
            }}
          >
            复制 JSON
          </Button>
          <Button variant="primary" icon="download" disabled={!result.json} onClick={exportWorkflow}>
            下载工作流
          </Button>
        </>
      }
    >
      {workflows.length === 0 ? (
        <EmptyState
          icon="workflow"
          title="还没有工作流模板"
          description="需要先粘贴 ComfyUI 的 API 格式工作流 JSON，并配置正向、负向与 LoraLoader 节点 ID。"
          action={
            <Button
              variant="primary"
              icon="settings"
              onClick={() => {
                onClose();
                openModal({ type: 'settings', section: 'workflow' });
              }}
            >
              去创建设置
            </Button>
          }
        />
      ) : (
        <>
          <div className="workflow-top">
            <Field label="选择工作流模板">
              <select
                className="input select"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {workflows.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="workflow-product">
              <span className="field-label">当前成品</span>
              <div className="workflow-product-name">{product.name}</div>
              <div className="workflow-product-meta">
                <Badge tone="outline">{product.loras.filter((lora) => lora.enabled).length} 个启用 LoRA</Badge>
                <Badge tone="outline">{product.params.modelName || '未填写模型文件名'}</Badge>
              </div>
            </div>
          </div>

          {workflow ? (
            <div className="workflow-mapping">
              <div className="workflow-mapping-title">
                <Icon name="workflow" size={15} /> 节点映射
              </div>
              <code>正向 {workflow.mapping.positiveNodeId || '未配置'}</code>
              <code>负向 {workflow.mapping.negativeNodeId || '未配置'}</code>
              <code>LoRA {workflow.mapping.loraLoaderNodeIds.join(', ') || '未配置'}</code>
              <code>模型 {workflow.mapping.checkpointNodeId || '未配置'}</code>
            </div>
          ) : null}

          <InlineWarning>
            请确认：
            <br />1. 模板是 ComfyUI「导出 (API)」格式，而不是界面格式；
            <br />2. 节点 ID 与类型匹配（CLIPTextEncode / LoraLoader / CheckpointLoader）；
            <br />3. 模型与 LoRA 文件名与你的 ComfyUI 环境一致。
          </InlineWarning>

          {result.error ? (
            <InlineError message={result.error} hint="修改节点映射或工作流模板后重试。" />
          ) : (
            <>
              {result.warnings.length > 0 ? (
                <div className="workflow-warnings">
                  {result.warnings.map((warning) => (
                    <div key={warning} className="inline-warning">
                      <Icon name="alert" size={15} />
                      <div>{warning}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <pre className="workflow-preview">{result.json}</pre>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
