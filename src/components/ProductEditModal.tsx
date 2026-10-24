import { useState } from 'react';
import type { Product, PromptParams } from '../domain/types';
import { MODEL_TYPES } from '../domain/types';
import { composeFinalFromProduct } from '../domain/product';
import { modelTypeLabel } from '../domain/presets';
import { useAppStore } from '../store/appStore';
import { Modal } from './ui/Modal';
import { Button, Field, ToggleRow } from './ui/primitives';

export function ProductEditModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const product = useAppStore((state) => state.products.find((item) => item.id === productId));
  const updateProduct = useAppStore((state) => state.updateProduct);
  const deleteProduct = useAppStore((state) => state.deleteProduct);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [name, setName] = useState(product?.name ?? '');
  const [positive, setPositive] = useState(product?.positive ?? '');
  const [negative, setNegative] = useState(product?.negative ?? '');
  const [notes, setNotes] = useState(product?.notes ?? '');
  const [favorite, setFavorite] = useState(product?.favorite ?? false);
  const [params, setParams] = useState<PromptParams | null>(product?.params ?? null);
  const [saving, setSaving] = useState(false);

  if (!product || !params) return null;

  const finalPreview = composeFinalFromProduct({
    positive,
    negative,
    params,
    output: product.output,
    loras: product.loras,
  });

  const save = async () => {
    if (!name.trim()) {
      toast('成品名称不能为空。', 'warning');
      return;
    }
    if (!positive.trim()) {
      toast('正向提示词不能为空。', 'warning');
      return;
    }
    setSaving(true);
    try {
      const next: Product = {
        ...product,
        name: name.trim().slice(0, 200),
        positive,
        negative,
        notes,
        favorite,
        params,
        final: composeFinalFromProduct({
          positive,
          negative,
          params,
          output: product.output,
          loras: product.loras,
        }),
      };
      await updateProduct(next);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="编辑成品"
      subtitle="修改会同时更新导出的 TXT / JSON 内容。编辑成品不会影响当前编辑器。"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button
            variant="danger"
            icon="trash"
            onClick={() =>
              confirmAction({
                title: '删除这个成品？',
                message: '删除后不可恢复，但历史记录中仍保留生成时的快照。',
                confirmLabel: '删除',
                danger: true,
                onConfirm: async () => {
                  await deleteProduct(product.id);
                  onClose();
                },
              })
            }
          >
            删除成品
          </Button>
          <div className="modal-footer-spacer" />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>
            保存修改
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="成品名称">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            placeholder="例如：白发女孩 · 樱花树下"
          />
        </Field>
        <Field label="收藏">
          <div className="inline-checkbox-row">
            <ToggleRow
              label="标记为收藏"
              checked={favorite}
              onChange={setFavorite}
              hint="收藏的成品不会被历史清理影响（成品本身需手动删除）。"
            />
          </div>
        </Field>
      </div>

      <Field label="正向提示词" hint="可直接修改；LoRA 标签是否保留取决于你的输出设置。">
        <textarea
          className="input textarea product-edit-textarea"
          value={positive}
          onChange={(event) => setPositive(event.target.value)}
          rows={6}
          spellCheck={false}
        />
      </Field>

      <Field label="负向提示词">
        <textarea
          className="input textarea"
          value={negative}
          onChange={(event) => setNegative(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="（可选）"
        />
      </Field>

      <div className="form-grid form-grid-3">
        <Field label="模型类型">
          <select
            className="input select"
            value={params.modelType}
            onChange={(event) =>
              setParams({ ...params, modelType: event.target.value as PromptParams['modelType'] })
            }
          >
            {MODEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {modelTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="模型文件名">
          <input
            className="input"
            value={params.modelName}
            onChange={(event) => setParams({ ...params, modelName: event.target.value })}
            placeholder="可选，例如 sdxl_base.safetensors"
          />
        </Field>
        <Field label="采样器">
          <input
            className="input"
            value={params.sampler}
            onChange={(event) => setParams({ ...params, sampler: event.target.value })}
          />
        </Field>
      </div>

      <div className="form-grid form-grid-4">
        <Field label="步数">
          <input
            className="input"
            type="number"
            min={1}
            max={300}
            value={params.steps}
            onChange={(event) => setParams({ ...params, steps: Number(event.target.value) || 1 })}
          />
        </Field>
        <Field label="CFG">
          <input
            className="input"
            type="number"
            step="0.5"
            min={0}
            max={60}
            value={params.cfg}
            onChange={(event) => setParams({ ...params, cfg: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="宽度">
          <input
            className="input"
            type="number"
            min={64}
            max={8192}
            step={64}
            value={params.width}
            onChange={(event) => setParams({ ...params, width: Number(event.target.value) || 512 })}
          />
        </Field>
        <Field label="高度">
          <input
            className="input"
            type="number"
            min={64}
            max={8192}
            step={64}
            value={params.height}
            onChange={(event) => setParams({ ...params, height: Number(event.target.value) || 512 })}
          />
        </Field>
      </div>

      <div className="form-grid form-grid-3">
        <Field label="随机种子">
          <input
            className="input"
            type="number"
            value={params.seed}
            onChange={(event) => setParams({ ...params, seed: Number(event.target.value) })}
          />
        </Field>
        <Field label="Clip skip">
          <input
            className="input"
            type="number"
            min={0}
            max={20}
            value={params.clipSkip}
            onChange={(event) => setParams({ ...params, clipSkip: Number(event.target.value) })}
          />
        </Field>
      </div>

      <Field label="备注">
        <textarea
          className="input textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder="记录种子、参考图、修改原因等"
        />
      </Field>

      <Field label="完整成品预览" hint="最终复制 / 导出使用这段文本。">
        <pre className="final-preview">{finalPreview || '（空）'}</pre>
      </Field>
    </Modal>
  );
}
