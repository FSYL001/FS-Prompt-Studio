import { useMemo, useState } from 'react';
import type { Lora, ModelType } from '../domain/types';
import { MODEL_TYPES } from '../domain/types';
import { formatWeight } from '../domain/lora';
import { newId, nowIso } from '../domain/id';
import { modelTypeLabel } from '../domain/presets';
import { useAppStore } from '../store/appStore';
import { Modal } from './ui/Modal';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  ToggleRow,
} from './ui/primitives';
import { Icon } from './ui/Icon';

function parseTriggers(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function LoraEditForm({
  lora,
  onBack,
}: {
  lora: Lora | null;
  onBack: () => void;
}) {
  const saveLora = useAppStore((state) => state.saveLora);
  const deleteLora = useAppStore((state) => state.deleteLora);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [name, setName] = useState(lora?.name ?? '');
  const [file, setFile] = useState(lora?.file ?? '');
  const [triggerText, setTriggerText] = useState((lora?.triggerWords ?? []).join(', '));
  const [descCn, setDescCn] = useState(lora?.descCn ?? '');
  const [descEn, setDescEn] = useState(lora?.descEn ?? '');
  const [defaultWeight, setDefaultWeight] = useState(lora?.defaultWeight ?? 0.8);
  const [weightMin, setWeightMin] = useState(lora?.weightMin ?? 0);
  const [weightMax, setWeightMax] = useState(lora?.weightMax ?? 1.5);
  const [modelTypes, setModelTypes] = useState<ModelType[]>(
    lora?.modelTypes ?? ['sd15', 'sdxl', 'flux', 'comfyui'],
  );
  const [category, setCategory] = useState(lora?.category ?? '未分类');
  const [notes, setNotes] = useState(lora?.notes ?? '');
  const [favorite, setFavorite] = useState(lora?.favorite ?? false);
  const [enabled, setEnabled] = useState(lora?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const toggleModel = (type: ModelType) => {
    setModelTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast('请填写 LoRA 名称。', 'warning');
      return;
    }
    if (!Number.isFinite(defaultWeight) || !Number.isFinite(weightMin) || !Number.isFinite(weightMax)) {
      toast('权重必须是数字。', 'warning');
      return;
    }
    if (weightMin > weightMax) {
      toast('推荐权重范围的最小值不能大于最大值。', 'warning');
      return;
    }
    if (modelTypes.length === 0) {
      toast('请至少选择一个适用模型类型。', 'warning');
      return;
    }
    setSaving(true);
    const now = nowIso();
    const next: Lora = {
      id: lora?.id ?? newId('lora'),
      name: name.trim().slice(0, 160),
      file: file.trim().slice(0, 400),
      triggerWords: parseTriggers(triggerText),
      descCn: descCn.slice(0, 4000),
      descEn: descEn.slice(0, 4000),
      defaultWeight: Math.round(defaultWeight * 100) / 100,
      weightMin: Math.round(weightMin * 100) / 100,
      weightMax: Math.round(weightMax * 100) / 100,
      modelTypes,
      category: category.trim().slice(0, 80) || '未分类',
      notes: notes.slice(0, 4000),
      favorite,
      enabled,
      createdAt: lora?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await saveLora(next);
      onBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lora-edit">
      <div className="form-grid">
        <Field label="LoRA 名称" hint="用于你识别，例如：二次元线稿风。">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            placeholder="例如：清新水彩风"
            autoFocus
          />
        </Field>
        <Field
          label="文件名 / 模型标识"
          hint="填写 WebUI 中显示的文件名，例如 style_watercolor.safetensors；不要填完整磁盘路径。"
        >
          <input
            className="input"
            value={file}
            onChange={(event) => setFile(event.target.value)}
            maxLength={400}
            placeholder="style_watercolor.safetensors"
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="form-grid form-grid-3">
        <Field label="分类">
          <input
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={80}
            placeholder="人物 / 画风 / 服装 / 场景"
          />
        </Field>
        <Field label="默认权重">
          <input
            className="input"
            type="number"
            step="0.05"
            min={-10}
            max={10}
            value={defaultWeight}
            onChange={(event) => setDefaultWeight(Number(event.target.value))}
          />
        </Field>
        <Field label="推荐权重范围">
          <div className="range-pair">
            <input
              className="input"
              type="number"
              step="0.05"
              min={-10}
              max={10}
              value={weightMin}
              onChange={(event) => setWeightMin(Number(event.target.value))}
              aria-label="最小权重"
            />
            <span>–</span>
            <input
              className="input"
              type="number"
              step="0.05"
              min={-10}
              max={10}
              value={weightMax}
              onChange={(event) => setWeightMax(Number(event.target.value))}
              aria-label="最大权重"
            />
          </div>
        </Field>
      </div>

      <Field label="触发词" hint="多个触发词用逗号分隔。触发词会按设置追加到成品提示词。">
        <input
          className="input"
          value={triggerText}
          onChange={(event) => setTriggerText(event.target.value)}
          placeholder="例如：my_style, watercolor_style"
          spellCheck={false}
        />
      </Field>

      <Field label="适用模型">
        <div className="model-type-grid">
          {MODEL_TYPES.map((type) => (
            <label key={type} className={`check-chip ${modelTypes.includes(type) ? 'is-checked' : ''}`}>
              <input
                type="checkbox"
                checked={modelTypes.includes(type)}
                onChange={() => toggleModel(type)}
              />
              {modelTypeLabel(type)}
            </label>
          ))}
        </div>
      </Field>

      <div className="form-grid">
        <Field label="中文说明">
          <textarea
            className="input textarea"
            value={descCn}
            onChange={(event) => setDescCn(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="这个 LoRA 适合什么画面、效果如何。"
          />
        </Field>
        <Field label="英文说明">
          <textarea
            className="input textarea"
            value={descEn}
            onChange={(event) => setDescEn(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Optional English description."
          />
        </Field>
      </div>

      <Field label="备注">
        <textarea
          className="input textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="下载来源、推荐搭配、注意事项等。"
        />
      </Field>

      <div className="form-grid">
        <ToggleRow
          label="收藏"
          checked={favorite}
          onChange={setFavorite}
          hint="收藏的 LoRA 会排在库的前面。"
        />
        <ToggleRow
          label="启用"
          checked={enabled}
          onChange={setEnabled}
          hint="停用后仍保留信息，但添加到作品时默认不输出。"
        />
      </div>

      <div className="lora-edit-footer">
        {lora ? (
          <Button
            variant="danger"
            icon="trash"
            onClick={() =>
              confirmAction({
                title: '删除这个 LoRA？',
                message: `「${lora.name}」会从库中删除。已经使用它的作品保留快照，不受影响。`,
                confirmLabel: '删除 LoRA',
                danger: true,
                onConfirm: async () => {
                  await deleteLora(lora.id);
                  onBack();
                },
              })
            }
          >
            删除
          </Button>
        ) : null}
        <div className="modal-footer-spacer" />
        <Button variant="ghost" onClick={onBack}>
          返回列表
        </Button>
        <Button variant="primary" icon="save" loading={saving} onClick={() => void handleSave()}>
          保存 LoRA
        </Button>
      </div>
    </div>
  );
}

export function LoraLibraryModal({ onClose }: { onClose: () => void }) {
  const loras = useAppStore((state) => state.loras);
  const activeLoras = useAppStore((state) => state.workspace.activeLoras);
  const addActiveLora = useAppStore((state) => state.addActiveLora);
  const toggleFavorite = useAppStore((state) => state.toggleLoraFavorite);
  const setLoraEnabled = useAppStore((state) => state.setLoraEnabled);
  const deleteLora = useAppStore((state) => state.deleteLora);
  const confirmAction = useAppStore((state) => state.confirmAction);

  const [editing, setEditing] = useState<Lora | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(loras.map((lora) => lora.category || '未分类'));
    return ['all', ...[...set].sort((a, b) => a.localeCompare(b, 'zh'))];
  }, [loras]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return loras
      .filter((lora) => {
        if (favoriteOnly && !lora.favorite) return false;
        if (category !== 'all' && (lora.category || '未分类') !== category) return false;
        if (!query) return true;
        const haystack = [
          lora.name,
          lora.file,
          lora.descCn,
          lora.descEn,
          lora.category,
          lora.notes,
          ...lora.triggerWords,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh');
      });
  }, [loras, search, category, favoriteOnly]);

  if (editing !== null) {
    return (
      <Modal
        title={editing === 'new' ? '添加 LoRA' : `编辑 LoRA · ${editing.name}`}
        subtitle="LoRA 信息保存在本地。文件名用于生成 <lora:文件名:权重> 语法。"
        onClose={onClose}
        size="lg"
      >
        <LoraEditForm lora={editing === 'new' ? null : editing} onBack={() => setEditing(null)} />
      </Modal>
    );
  }

  return (
    <Modal
      title="LoRA 管理"
      subtitle="管理常用 LoRA、触发词与推荐权重；可一键添加到当前作品。"
      onClose={onClose}
      size="xl"
      headerExtra={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing('new')}>
          添加 LoRA
        </Button>
      }
      footer={
        <>
          <span className="modal-footer-note">
            共 {loras.length} 个 LoRA · 当前作品使用 {activeLoras.length} 个
          </span>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="library-toolbar">
        <label className="search-box">
          <Icon name="search" size={16} />
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称、文件名、说明、触发词…"
            aria-label="搜索 LoRA"
          />
          {search ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearch('')}
              aria-label="清空搜索"
            >
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </label>
        <select
          className="input select library-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="按分类筛选"
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item === 'all' ? '全部分类' : item}
            </option>
          ))}
        </select>
        <label className="favorite-filter">
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(event) => setFavoriteOnly(event.target.checked)}
          />
          只看收藏
        </label>
      </div>

      {loras.length === 0 ? (
        <EmptyState
          icon="layers"
          title="LoRA 库还是空的"
          description="添加你的常用 LoRA，记录触发词与推荐权重，之后可以一键加入提示词。"
          action={
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              添加第一个 LoRA
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="没有匹配的 LoRA"
          description="试试清空搜索词或切换分类。"
          action={
            <Button
              variant="secondary"
              icon="refresh"
              onClick={() => {
                setSearch('');
                setCategory('all');
                setFavoriteOnly(false);
              }}
            >
              清除筛选
            </Button>
          }
        />
      ) : (
        <div className="lora-grid">
          {filtered.map((lora) => {
            const inUse = activeLoras.some((active) => active.loraId === lora.id);
            return (
              <article className={`lora-card ${lora.favorite ? 'is-favorite' : ''}`} key={lora.id}>
                <header className="lora-card-head">
                  <div className="lora-card-title">
                    <h3>{lora.name}</h3>
                    <div className="lora-card-badges">
                      <Badge tone={lora.enabled ? 'success' : 'neutral'}>
                        {lora.enabled ? '启用' : '停用'}
                      </Badge>
                      <Badge tone="outline">{lora.category || '未分类'}</Badge>
                      <Badge tone="neutral">默认 {formatWeight(lora.defaultWeight)}</Badge>
                    </div>
                  </div>
                  <div className="lora-card-tools">
                    <IconButton
                      icon={lora.favorite ? 'star-filled' : 'star'}
                      label={lora.favorite ? '取消收藏' : '收藏'}
                      size="sm"
                      active={lora.favorite}
                      onClick={() => toggleFavorite(lora.id)}
                    />
                    <IconButton
                      icon="edit"
                      label="编辑 LoRA"
                      size="sm"
                      onClick={() => setEditing(lora)}
                    />
                    <IconButton
                      icon="trash"
                      label="删除 LoRA"
                      size="sm"
                      onClick={() =>
                        confirmAction({
                          title: '删除这个 LoRA？',
                          message: `「${lora.name}」会从库中删除。已经使用它的作品保留快照，不受影响。`,
                          confirmLabel: '删除 LoRA',
                          danger: true,
                          onConfirm: () => deleteLora(lora.id),
                        })
                      }
                    />
                  </div>
                </header>

                <div className="lora-file-line">
                  <Icon name="folder" size={13} />
                  <code>{lora.file || '缺少文件名'}</code>
                </div>

                {lora.descCn ? <p className="lora-desc">{lora.descCn}</p> : null}
                {lora.triggerWords.length > 0 ? (
                  <div className="lora-triggers">
                    {lora.triggerWords.map((trigger) => (
                      <span key={trigger} className="trigger-chip">
                        {trigger}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="lora-no-trigger">未设置触发词</p>
                )}

                <div className="lora-models">
                  {lora.modelTypes.map((type) => (
                    <span key={type}>{modelTypeLabel(type)}</span>
                  ))}
                </div>

                {!lora.file ? (
                  <p className="lora-warning">
                    <Icon name="alert" size={13} /> 未填写文件名时，成品不会生成 LoRA 语法。
                  </p>
                ) : null}

                <footer className="lora-card-footer">
                  <Button
                    size="sm"
                    variant={inUse ? 'soft' : 'primary'}
                    icon={inUse ? 'check' : 'plus'}
                    disabled={inUse}
                    onClick={() => addActiveLora(lora.id)}
                  >
                    {inUse ? '已添加到当前' : '添加到当前'}
                  </Button>
                  <label className="mini-enable">
                    <input
                      type="checkbox"
                      checked={lora.enabled}
                      onChange={(event) => setLoraEnabled(lora.id, event.target.checked)}
                    />
                    启用
                  </label>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
