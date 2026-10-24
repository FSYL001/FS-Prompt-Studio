import { useState } from 'react';
import type { WorkflowTemplate } from '../../domain/types';
import { newId, nowIso } from '../../domain/id';
import { createExampleWorkflowJson, EXAMPLE_WORKFLOW_MAPPING } from '../../domain/workflow';
import { useAppStore } from '../../store/appStore';
import { Badge, Button, EmptyState, Field, IconButton, InlineError, InlineWarning, SectionLabel } from '../ui/primitives';

interface WorkflowForm {
  id: string;
  name: string;
  json: string;
  positiveNodeId: string;
  negativeNodeId: string;
  loraLoaderNodeIds: string;
  checkpointNodeId: string;
  createdAt: string;
}

function emptyForm(): WorkflowForm {
  return {
    id: '',
    name: '',
    json: '',
    positiveNodeId: '',
    negativeNodeId: '',
    loraLoaderNodeIds: '',
    checkpointNodeId: '',
    createdAt: '',
  };
}

function formFromWorkflow(workflow: WorkflowTemplate): WorkflowForm {
  return {
    id: workflow.id,
    name: workflow.name,
    json: workflow.json,
    positiveNodeId: workflow.mapping.positiveNodeId,
    negativeNodeId: workflow.mapping.negativeNodeId,
    loraLoaderNodeIds: workflow.mapping.loraLoaderNodeIds.join(', '),
    checkpointNodeId: workflow.mapping.checkpointNodeId,
    createdAt: workflow.createdAt,
  };
}

interface Validation {
  errors: string[];
  warnings: string[];
  parsed: Record<string, unknown> | null;
}

function validateForm(form: WorkflowForm): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: Record<string, unknown> | null = null;

  if (!form.name.trim()) errors.push('请填写工作流名称。');
  if (!form.json.trim()) errors.push('请粘贴 ComfyUI API 格式的工作流 JSON。');
  if (form.json.trim()) {
    try {
      const value = JSON.parse(form.json);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push('工作流 JSON 的顶层必须是对象。');
      } else if (Array.isArray((value as { nodes?: unknown }).nodes)) {
        errors.push('这是 ComfyUI 界面格式（含 nodes 数组），请在 ComfyUI 中使用「导出 (API)」格式。');
      } else if (!Object.values(value).some((node) => (node as { class_type?: unknown })?.class_type)) {
        errors.push('模板中没有找到 class_type 字段，不是 ComfyUI API 格式。');
      } else {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      errors.push('工作流 JSON 不是合法的 JSON。');
    }
  }

  if (parsed) {
    const positive = form.positiveNodeId.trim();
    if (!positive) {
      errors.push('请填写正向提示词节点 ID。');
    } else if (!(positive in parsed)) {
      errors.push(`工作流中找不到正向节点 ID「${positive}」。`);
    }
    const negative = form.negativeNodeId.trim();
    if (negative && !(negative in parsed)) {
      errors.push(`工作流中找不到负向节点 ID「${negative}」。`);
    }
    const checkpoint = form.checkpointNodeId.trim();
    if (checkpoint && !(checkpoint in parsed)) {
      errors.push(`工作流中找不到模型节点 ID「${checkpoint}」。`);
    }
    const loraIds = form.loraLoaderNodeIds
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    loraIds.forEach((id, index) => {
      const node = parsed?.[id] as { class_type?: unknown } | undefined;
      if (!node) {
        errors.push(`工作流中找不到第 ${index + 1} 个 LoRA 节点 ID「${id}」。`);
      } else if (!/LoraLoader/i.test(String(node.class_type ?? ''))) {
        errors.push(`节点 ${id} 不是 LoraLoader，无法写入 LoRA。`);
      }
    });
    if (!form.negativeNodeId.trim()) warnings.push('未映射负向节点，负向提示词不会写入工作流。');
    if (loraIds.length === 0) warnings.push('未映射 LoraLoader 节点，成品中的 LoRA 不会写入工作流。');
    if (!checkpoint.trim()) warnings.push('未映射模型节点，工作流会保留模板里的模型文件名。');
  }

  return { errors, warnings, parsed };
}

export function WorkflowSettings() {
  const workflows = useAppStore((state) => state.settings.workflows);
  const activeWorkflowId = useAppStore((state) => state.settings.activeWorkflowId);
  const saveWorkflow = useAppStore((state) => state.saveWorkflow);
  const removeWorkflow = useAppStore((state) => state.removeWorkflow);
  const setActiveWorkflow = useAppStore((state) => state.setActiveWorkflow);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [form, setForm] = useState<WorkflowForm | null>(null);
  const validation = form ? validateForm(form) : null;

  const startNew = () => setForm(emptyForm());
  const startEdit = (workflow: WorkflowTemplate) => setForm(formFromWorkflow(workflow));

  const save = () => {
    if (!form) return;
    const result = validateForm(form);
    if (result.errors.length > 0) {
      toast(result.errors[0], 'error');
      return;
    }
    const now = nowIso();
    const workflow: WorkflowTemplate = {
      id: form.id || newId('workflow'),
      name: form.name.trim().slice(0, 120),
      json: form.json,
      mapping: {
        positiveNodeId: form.positiveNodeId.trim(),
        negativeNodeId: form.negativeNodeId.trim(),
        loraLoaderNodeIds: form.loraLoaderNodeIds
          .split(/[,，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        checkpointNodeId: form.checkpointNodeId.trim(),
      },
      createdAt: form.createdAt || now,
    };
    saveWorkflow(workflow);
    setForm(null);
    toast('工作流模板已保存。', 'success');
  };

  return (
    <div className="settings-section">
      <SectionLabel hint={`${workflows.length} 个模板`}>ComfyUI 工作流模板</SectionLabel>
      <p className="settings-note">
        只支持 ComfyUI「导出 (API)」格式的 JSON。在 ComfyUI 菜单里选择「导出
        (API)」，再把节点 ID 填到下面的映射中。工作流导出只会改写你明确映射的节点，不会假装兼容所有工作流。
      </p>

      {form ? (
        <div className="workflow-form">
          <div className="settings-row">
            <Field label="模板名称">
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="例如：我的 SDXL 基础工作流"
              />
            </Field>
            <Field label="模型节点 ID（可选）">
              <input
                className="input"
                value={form.checkpointNodeId}
                onChange={(event) => setForm({ ...form, checkpointNodeId: event.target.value })}
                placeholder="例如 4（CheckpointLoaderSimple）"
              />
            </Field>
          </div>

          <div className="settings-row settings-row-3">
            <Field label="正向提示词节点 ID">
              <input
                className="input"
                value={form.positiveNodeId}
                onChange={(event) => setForm({ ...form, positiveNodeId: event.target.value })}
                placeholder="例如 6"
              />
            </Field>
            <Field label="负向提示词节点 ID（可选）">
              <input
                className="input"
                value={form.negativeNodeId}
                onChange={(event) => setForm({ ...form, negativeNodeId: event.target.value })}
                placeholder="例如 7"
              />
            </Field>
            <Field label="LoraLoader 节点 ID（按顺序）">
              <input
                className="input"
                value={form.loraLoaderNodeIds}
                onChange={(event) => setForm({ ...form, loraLoaderNodeIds: event.target.value })}
                placeholder="例如 10, 11"
              />
            </Field>
          </div>

          <Field
            label="工作流 JSON（API 格式）"
            hint="粘贴后会自动校验是否为对象、是否包含节点，以及映射的节点是否存在。"
          >
            <textarea
              className="input textarea code-textarea"
              value={form.json}
              onChange={(event) => setForm({ ...form, json: event.target.value })}
              rows={12}
              spellCheck={false}
              placeholder='{"6": {"class_type": "CLIPTextEncode", "inputs": {"text": "..."}}}'
            />
          </Field>

          <div className="settings-inline-actions">
            <Button
              size="sm"
              variant="ghost"
              icon="sparkles"
              onClick={() =>
                setForm({
                  ...form,
                  name: form.name || '示例：基础文生图',
                  json: createExampleWorkflowJson(),
                  positiveNodeId: EXAMPLE_WORKFLOW_MAPPING.positiveNodeId,
                  negativeNodeId: EXAMPLE_WORKFLOW_MAPPING.negativeNodeId,
                  loraLoaderNodeIds: EXAMPLE_WORKFLOW_MAPPING.loraLoaderNodeIds.join(', '),
                  checkpointNodeId: EXAMPLE_WORKFLOW_MAPPING.checkpointNodeId,
                })
              }
            >
              填入示例模板
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="download"
              onClick={() => {
                if (validation?.parsed) {
                  navigator.clipboard?.writeText(form.json).then(
                    () => toast('工作流 JSON 已复制。', 'success'),
                    () => toast('复制失败，请手动选择文本。', 'error'),
                  );
                }
              }}
              disabled={!validation?.parsed}
            >
              复制 JSON
            </Button>
          </div>

          {validation && validation.errors.length > 0 ? (
            <InlineError
              message={validation.errors[0]}
              hint={validation.errors.slice(1, 3).join('；') || undefined}
            />
          ) : null}
          {validation && validation.errors.length === 0 && validation.warnings.length > 0 ? (
            <InlineWarning>{validation.warnings.join(' ')}</InlineWarning>
          ) : null}
          {validation && validation.errors.length === 0 ? (
            <p className="settings-note">
              校验通过。导出的工作流会写入：正向 / 负向提示词
              {validation.warnings.some((warning) => warning.includes('LoraLoader'))
                ? ''
                : '、LoRA 节点'}
              。
            </p>
          ) : null}

          <div className="settings-inline-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button variant="primary" icon="save" onClick={save} disabled={!validation || validation.errors.length > 0}>
              保存模板
            </Button>
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon="workflow"
          title="还没有工作流模板"
          description="添加 ComfyUI API 工作流后，成品可以直接导出为可导入的工作流 JSON；纯提示词与工作流会明确区分。"
          action={
            <Button variant="primary" icon="plus" onClick={startNew}>
              添加模板
            </Button>
          }
        />
      ) : (
        <>
          <div className="workflow-list">
            {workflows.map((workflow) => (
              <article
                className={`workflow-item ${workflow.id === activeWorkflowId ? 'is-active' : ''}`}
                key={workflow.id}
              >
                <label className="workflow-radio">
                  <input
                    type="radio"
                    name="active-workflow"
                    checked={workflow.id === activeWorkflowId}
                    onChange={() => setActiveWorkflow(workflow.id)}
                  />
                  <span className="workflow-item-main">
                    <span className="workflow-item-name">
                      {workflow.name}
                      {workflow.id === activeWorkflowId ? <Badge tone="accent">当前使用</Badge> : null}
                    </span>
                    <span className="workflow-item-meta">
                      正向 {workflow.mapping.positiveNodeId || '未配置'} · 负向{' '}
                      {workflow.mapping.negativeNodeId || '未配置'} · LoRA{' '}
                      {workflow.mapping.loraLoaderNodeIds.join(', ') || '未配置'} · 模型{' '}
                      {workflow.mapping.checkpointNodeId || '未配置'}
                    </span>
                  </span>
                </label>
                <div className="workflow-item-actions">
                  <Button size="sm" variant="ghost" icon="edit" onClick={() => startEdit(workflow)}>
                    编辑
                  </Button>
                  <IconButton
                    icon="trash"
                    label="删除模板"
                    size="sm"
                    onClick={() =>
                      confirmAction({
                        title: '删除这个工作流模板？',
                        message: `「${workflow.name}」将被删除，已经导出的文件不受影响。`,
                        confirmLabel: '删除',
                        danger: true,
                        onConfirm: () => removeWorkflow(workflow.id),
                      })
                    }
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="settings-inline-actions">
            <Button variant="secondary" icon="plus" onClick={startNew}>
              添加模板
            </Button>
          </div>
        </>
      )}

      <InlineWarning>
        ComfyUI 中 LoRA 通过 LoraLoader 节点生效，提示词文本里的 &lt;lora:...&gt; 只是普通文字。
        SD / WebUI 的 LoRA 文本语法并不适用于所有 ComfyUI 工作流。
      </InlineWarning>
    </div>
  );
}
