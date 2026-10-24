import { useEffect, useMemo, useState } from 'react';
import type { Lora, ModelType } from '../domain/types';
import { MODEL_TYPES } from '../domain/types';
import { formatWeight, loraPromptPrefixes } from '../domain/lora';
import { copyText, newId, nowIso } from '../domain/id';
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
    .map((item) => item.trim().replace(/^@+/, ''))
    .filter(Boolean)
    .slice(0, 50);
}

function triggerLabel(trigger: string): string {
  return trigger.startsWith('@') ? trigger : `@${trigger}`;
}

function externalUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function LoraEditForm({ lora, onBack }: { lora: Lora | null; onBack: () => void }) {
  const saveLora = useAppStore((state) => state.saveLora);
  const deleteLora = useAppStore((state) => state.deleteLora);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [name, setName] = useState(lora?.name ?? '');
  const [file, setFile] = useState(lora?.file ?? '');
  const [sourceUrl, setSourceUrl] = useState(lora?.sourceUrl ?? '');
  const [triggerText, setTriggerText] = useState((lora?.triggerWords ?? []).join(', '));
  const [prefixText, setPrefixText] = useState(lora ? loraPromptPrefixes(lora).join('\n') : '');
  const [recommendedNegative, setRecommendedNegative] = useState(lora?.recommendedNegative ?? '');
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
    if (sourceUrl.trim()) {
      try {
        const parsed = new URL(sourceUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
      } catch {
        toast('原始链接格式不正确，请填写以 http:// 或 https:// 开头的地址。', 'warning');
        return;
      }
    }
    setSaving(true);
    const now = nowIso();
    const prefixes = prefixText
      .split(/\r?\n/)
      .map((item) => item.trim().slice(0, 2000))
      .filter(Boolean)
      .slice(0, 30);
    const next: Lora = {
      id: lora?.id ?? newId('lora'),
      name: name.trim().slice(0, 160),
      file: file.trim().slice(0, 400),
      sourceUrl: sourceUrl.trim().slice(0, 2000),
      triggerWords: parseTriggers(triggerText),
      promptPrefixes: prefixes,
      promptPrefix: prefixes[0] ?? '',
      recommendedNegative: recommendedNegative.slice(0, 4000),
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

      <Field
        label="原始链接（Civitai 等）"
        hint="方便以后找回模型出处，例如 https://civitai.com/models/xxxxx。支持 http/https。"
      >
        <input
          className="input"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          maxLength={2000}
          placeholder="https://civitai.com/models/..."
          spellCheck={false}
          aria-label="LoRA 原始链接"
        />
      </Field>

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

      <Field
        label="触发词"
        hint="多个触发词用逗号分隔，可带 @，例如 @dizzy, @watercolor。保存时会自动去掉开头的 @。"
      >
        <input
          className="input"
          value={triggerText}
          onChange={(event) => setTriggerText(event.target.value)}
          placeholder="例如：@dizzy, watercolor_style"
          spellCheck={false}
        />
      </Field>

      <Field
        label="推荐提示词前缀（每行一个）"
        hint="可以填多个质量词或风格前缀，每行一个，例如 masterpiece, best quality。不会自动改写译文。"
      >
        <textarea
          className="input textarea"
          value={prefixText}
          onChange={(event) => setPrefixText(event.target.value)}
          rows={3}
          maxLength={20000}
          placeholder={'masterpiece, best quality, highly detailed\ncinematic lighting, film grain'}
          spellCheck={false}
          aria-label="推荐提示词前缀"
        />
      </Field>

      <Field
        label="推荐负面提示词"
        hint="这个 LoRA 常用或建议避开的负面词，可一键加入负面英文框。"
      >
        <textarea
          className="input textarea"
          value={recommendedNegative}
          onChange={(event) => setRecommendedNegative(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="lowres, blurry, bad anatomy, watermark"
          spellCheck={false}
          aria-label="推荐负面提示词"
        />
      </Field>

      <Field label="适用模型">
        <div className="model-type-grid">
          {MODEL_TYPES.map((type) => (
            <label key={type} className={`check-chip ${modelTypes.includes(type) ? 'is-checked' : ''}`}>
              <input type="checkbox" checked={modelTypes.includes(type)} onChange={() => toggleModel(type)} />
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
        <ToggleRow label="收藏" checked={favorite} onChange={setFavorite} hint="收藏的 LoRA 会排在库的前面。" />
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
  const englishText = useAppStore((state) => state.workspace.englishText);
  const negativeText = useAppStore((state) => state.workspace.negativeText);
  const setEnglishText = useAppStore((state) => state.setEnglishText);
  const setNegativeText = useAppStore((state) => state.setNegativeText);
  const addActiveLora = useAppStore((state) => state.addActiveLora);
  const removeActiveLora = useAppStore((state) => state.removeActiveLora);
  const toggleFavorite = useAppStore((state) => state.toggleLoraFavorite);
  const setLoraEnabled = useAppStore((state) => state.setLoraEnabled);
  const deleteLora = useAppStore((state) => state.deleteLora);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [editing, setEditing] = useState<Lora | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          lora.recommendedNegative,
          lora.sourceUrl,
          ...loraPromptPrefixes(lora),
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

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((lora) => lora.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected = loras.find((lora) => lora.id === selectedId) ?? null;
  const selectedInUse = selected ? activeLoras.some((active) => active.loraId === selected.id) : false;
  const selectedPrefixes = selected ? loraPromptPrefixes(selected) : [];

  const handleTrigger = async (trigger: string) => {
    const token = triggerLabel(trigger);
    const base = englishText.trim();
    const already = base.toLowerCase().includes(token.toLowerCase());
    if (!already) {
      const separator = base && !/[,，.。]$/.test(base) ? ', ' : base ? ' ' : '';
      setEnglishText(`${base}${separator}${token}`);
    }
    try {
      await copyText(token);
      toast(
        already
          ? `英文提示词中已有 ${token}，已复制到剪贴板。`
          : `已把 ${token} 加入英文提示词，并复制到剪贴板。`,
        'success',
      );
    } catch {
      toast(
        already ? `英文提示词中已有 ${token}。` : `已把 ${token} 加入英文提示词（剪贴板不可用）。`,
        already ? 'info' : 'warning',
      );
    }
  };

  const handlePrefixes = async (prefixes: string[]) => {
    const clean = prefixes.map((prefix) => prefix.trim()).filter(Boolean);
    if (clean.length === 0) return;
    const combined = clean.join(', ');
    const base = englishText.trim();
    const already = base.toLowerCase().startsWith(combined.toLowerCase());
    if (!already) {
      const separator = /[,，.。]$/.test(combined) ? ' ' : ', ';
      setEnglishText(base ? `${combined}${separator}${base}`.trim() : combined);
    }
    try {
      await copyText(combined);
      toast(
        already
          ? '英文提示词已以这些前缀开头，前缀已复制。'
          : `已把 ${clean.length} 个推荐前缀放到英文提示词开头，并复制到剪贴板。`,
        'success',
      );
    } catch {
      toast(
        already
          ? '前缀已在英文开头。'
          : `已把 ${clean.length} 个推荐前缀放到英文提示词开头。`,
        already ? 'info' : 'warning',
      );
    }
  };

  const handleRecommendedNegative = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const base = negativeText.trim();
    const already = base.toLowerCase().includes(clean.toLowerCase());
    if (!already) {
      const separator = base && !/[,，.。]$/.test(base) ? ', ' : base ? ' ' : '';
      setNegativeText(`${base}${separator}${clean}`);
    }
    try {
      await copyText(clean);
      toast(already ? '负面英文中已有这段推荐词，已复制。' : '已加入负面英文，并复制到剪贴板。', 'success');
    } catch {
      toast(already ? '负面英文中已有这段推荐词。' : '已加入负面英文。', already ? 'info' : 'warning');
    }
  };

  const handleCopyAllTriggers = async () => {
    if (!selected || selected.triggerWords.length === 0) return;
    const text = selected.triggerWords.map(triggerLabel).join(', ');
    try {
      await copyText(text);
      toast('已复制全部触发词。', 'success');
    } catch {
      toast('复制失败，请手动选择触发词。', 'error');
    }
  };

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
      title="LoRA 记事本"
      subtitle="从左侧打开一个 LoRA 查看模型信息；点击 @触发词 会复制并加入英文提示词。"
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
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="清空搜索">
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
          title="LoRA 记事本还是空的"
          description="添加你的常用 LoRA，记录模型信息、@触发词与推荐权重，之后可以一键加入英文提示词。"
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
        <div className="lora-notebook">
          <aside className="lora-index" aria-label="LoRA 列表">
            {filtered.map((lora) => (
              <button
                key={lora.id}
                type="button"
                className={`lora-index-item ${lora.id === selectedId ? 'is-active' : ''}`}
                onClick={() => setSelectedId(lora.id)}
              >
                <span className="lora-index-main">
                  <span className="lora-index-name">
                    {lora.favorite ? <Icon name="star-filled" size={12} /> : null}
                    {lora.name}
                  </span>
                  <span className="lora-index-trigger">
                    {lora.triggerWords.length > 0 ? triggerLabel(lora.triggerWords[0]) : '无触发词'}
                  </span>
                </span>
                <span className={`lora-dot ${lora.enabled ? 'is-on' : ''}`} title={lora.enabled ? '启用' : '停用'} />
              </button>
            ))}
          </aside>

          <section className="lora-detail" aria-label="LoRA 详情">
            {selected ? (
              <>
                <header className="lora-detail-head">
                  <div>
                    <h3>{selected.name}</h3>
                    <div className="lora-card-badges">
                      <Badge tone={selected.enabled ? 'success' : 'neutral'}>
                        {selected.enabled ? '启用' : '停用'}
                      </Badge>
                      <Badge tone="outline">{selected.category || '未分类'}</Badge>
                      <Badge tone="neutral">默认 {formatWeight(selected.defaultWeight)}</Badge>
                      <Badge tone="outline">
                        {selected.weightMin}–{selected.weightMax}
                      </Badge>
                    </div>
                  </div>
                  <div className="lora-detail-tools">
                    <IconButton
                      icon={selected.favorite ? 'star-filled' : 'star'}
                      label={selected.favorite ? '取消收藏' : '收藏'}
                      size="sm"
                      active={selected.favorite}
                      onClick={() => toggleFavorite(selected.id)}
                    />
                    <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(selected)}>
                      编辑信息
                    </Button>
                    <IconButton
                      icon="trash"
                      label="删除 LoRA"
                      size="sm"
                      onClick={() =>
                        confirmAction({
                          title: '删除这个 LoRA？',
                          message: `「${selected.name}」会从库中删除。已经使用它的作品保留快照，不受影响。`,
                          confirmLabel: '删除 LoRA',
                          danger: true,
                          onConfirm: async () => {
                            await deleteLora(selected.id);
                            setSelectedId(null);
                          },
                        })
                      }
                    />
                  </div>
                </header>

                <div className="lora-detail-file">
                  <Icon name="folder" size={14} />
                  <code>{selected.file || '缺少文件名'}</code>
                  {!selected.file ? <span className="lora-file-warning">成品不会生成 LoRA 语法</span> : null}
                </div>

                {selected.sourceUrl.trim() ? (
                  <div className="lora-source-row">
                    <Icon name="external" size={14} />
                    {externalUrl(selected.sourceUrl) ? (
                      <a
                        href={externalUrl(selected.sourceUrl) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={selected.sourceUrl}
                      >
                        {new URL(selected.sourceUrl).host}
                      </a>
                    ) : (
                      <span className="lora-source-invalid">链接格式不正确：{selected.sourceUrl}</span>
                    )}
                    <span className="meta-spacer" />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="copy"
                      onClick={() => {
                        void copyText(selected.sourceUrl)
                          .then(() => toast('原始链接已复制。', 'success'))
                          .catch(() => toast('复制失败，请手动选择链接。', 'error'));
                      }}
                    >
                      复制链接
                    </Button>
                  </div>
                ) : null}

                <div className="lora-detail-section">
                  <div className="lora-detail-label">
                    <span>触发词</span>
                    <span className="lora-detail-hint">点击 = 复制 @触发词 并加入英文提示词</span>
                  </div>
                  {selected.triggerWords.length > 0 ? (
                    <div className="trigger-chip-list">
                      {selected.triggerWords.map((trigger) => (
                        <button
                          key={trigger}
                          type="button"
                          className="trigger-pill"
                          onClick={() => void handleTrigger(trigger)}
                          title="复制并加入英文提示词"
                        >
                          {triggerLabel(trigger)}
                        </button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="copy"
                        onClick={() => void handleCopyAllTriggers()}
                      >
                        复制全部
                      </Button>
                    </div>
                  ) : (
                    <p className="lora-detail-empty">还没有触发词。点击「编辑信息」添加，例如 @dizzy。</p>
                  )}
                </div>

                <div className="lora-detail-section">
                  <div className="lora-detail-label">
                    <span>推荐提示词前缀</span>
                    <span className="lora-detail-hint">可填多个，每行一个；可全部放到英文开头</span>
                  </div>
                  {selectedPrefixes.length > 0 ? (
                    <>
                      <div className="lora-prefix-list">
                        {selectedPrefixes.map((prefix) => (
                          <div className="lora-prefix-row" key={prefix}>
                            <pre className="lora-prefix">{prefix}</pre>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="plus"
                              onClick={() => void handlePrefixes([prefix])}
                            >
                              加入
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="lora-prefix-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="plus"
                          onClick={() => void handlePrefixes(selectedPrefixes)}
                        >
                          全部加入英文开头
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="copy"
                          onClick={() => {
                            void copyText(selectedPrefixes.join('\n'))
                              .then(() => toast('全部推荐前缀已复制。', 'success'))
                              .catch(() => toast('复制失败，请手动选择前缀。', 'error'));
                          }}
                        >
                          复制全部
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="lora-detail-empty">还没有推荐前缀。点击「编辑信息」填写，每行一个。</p>
                  )}
                </div>

                <div className="lora-detail-section">
                  <div className="lora-detail-label">
                    <span>推荐负面提示词</span>
                    <span className="lora-detail-hint">可加入负面英文框</span>
                  </div>
                  {selected.recommendedNegative.trim() ? (
                    <>
                      <pre className="lora-prefix">{selected.recommendedNegative}</pre>
                      <div className="lora-prefix-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="minus"
                          onClick={() => void handleRecommendedNegative(selected.recommendedNegative)}
                        >
                          加入负面英文
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="copy"
                          onClick={() => {
                            void copyText(selected.recommendedNegative)
                              .then(() => toast('推荐负面提示词已复制。', 'success'))
                              .catch(() => toast('复制失败，请手动选择。', 'error'));
                          }}
                        >
                          复制
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="lora-detail-empty">还没有推荐负面提示词。点击「编辑信息」填写。</p>
                  )}
                </div>

                <div className="lora-detail-section">
                  <div className="lora-detail-label">中文说明</div>
                  <p className="lora-detail-text">{selected.descCn || '（还没有填写中文说明）'}</p>
                </div>

                {selected.descEn ? (
                  <div className="lora-detail-section">
                    <div className="lora-detail-label">英文说明</div>
                    <p className="lora-detail-text">{selected.descEn}</p>
                  </div>
                ) : null}

                {selected.notes ? (
                  <div className="lora-detail-section">
                    <div className="lora-detail-label">备注</div>
                    <p className="lora-detail-text">{selected.notes}</p>
                  </div>
                ) : null}

                <div className="lora-detail-section">
                  <div className="lora-detail-label">适用模型</div>
                  <div className="lora-models">
                    {selected.modelTypes.map((type) => (
                      <span key={type}>{modelTypeLabel(type)}</span>
                    ))}
                  </div>
                </div>

                <footer className="lora-detail-footer">
                  <Button
                    variant={selectedInUse ? 'soft' : 'primary'}
                    icon={selectedInUse ? 'check' : 'plus'}
                    disabled={selectedInUse}
                    onClick={() => addActiveLora(selected.id)}
                  >
                    {selectedInUse ? '已在当前作品' : '添加到当前作品'}
                  </Button>
                  {selectedInUse ? (
                    <Button
                      variant="ghost"
                      icon="minus"
                      onClick={() => {
                        const index = activeLoras.findIndex((active) => active.loraId === selected.id);
                        if (index >= 0) removeActiveLora(index);
                      }}
                    >
                      从当前作品移除
                    </Button>
                  ) : null}
                  <span className="meta-spacer" />
                  <label className="mini-enable">
                    <input
                      type="checkbox"
                      checked={selected.enabled}
                      onChange={(event) => setLoraEnabled(selected.id, event.target.checked)}
                    />
                    启用这个 LoRA
                  </label>
                </footer>
              </>
            ) : (
              <EmptyState icon="layers" title="选择一个 LoRA" description="从左侧列表点击即可查看模型信息。" />
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
