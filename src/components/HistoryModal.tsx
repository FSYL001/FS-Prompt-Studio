import { useMemo, useState } from 'react';
import type { HistoryEntry } from '../domain/types';
import { downloadText, formatDateTime } from '../domain/id';
import { modelTypeLabel } from '../domain/presets';
import { useAppStore } from '../store/appStore';
import { Modal } from './ui/Modal';
import { Badge, Button, EmptyState, IconButton } from './ui/primitives';
import { Icon } from './ui/Icon';

type SortMode = 'newest' | 'oldest' | 'name';

function typeLabel(type: HistoryEntry['type']): string {
  if (type === 'product') return '成品';
  if (type === 'draft') return '草稿版本';
  return '手动保存';
}

function typeTone(type: HistoryEntry['type']): 'accent' | 'neutral' | 'success' {
  if (type === 'product') return 'accent';
  if (type === 'draft') return 'neutral';
  return 'success';
}

function truncate(text: string, length = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const history = useAppStore((state) => state.history);
  const restoreHistory = useAppStore((state) => state.restoreHistory);
  const deleteHistory = useAppStore((state) => state.deleteHistory);
  const toggleFavorite = useAppStore((state) => state.toggleHistoryFavorite);
  const openCompare = useAppStore((state) => state.openCompare);
  const createSnapshot = useAppStore((state) => state.createHistorySnapshot);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = history.filter((entry) => {
      if (favoriteOnly && !entry.favorite) return false;
      if (!query) return true;
      const haystack = [
        entry.name,
        entry.snapshot.draftText,
        entry.snapshot.englishText,
        entry.snapshot.negativeText,
        entry.snapshot.notes,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    return list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh');
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [history, search, sort, favoriteOnly]);

  const selectedEntries = selected
    .map((id) => history.find((entry) => entry.id === id))
    .filter((entry): entry is HistoryEntry => Boolean(entry));

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  };

  const exportHistory = () => {
    const entries = selectedEntries.length > 0 ? selectedEntries : filtered;
    if (entries.length === 0) {
      toast('没有可导出的历史记录。', 'info');
      return;
    }
    const payload = {
      app: 'prompt-studio-history',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    };
    downloadText(
      `prompt-studio-history-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
    toast(`已导出 ${entries.length} 条历史记录。`, 'success');
  };

  const bulkDelete = () => {
    if (selected.length === 0) return;
    confirmAction({
      title: `删除选中的 ${selected.length} 条历史？`,
      message: '删除后无法恢复。收藏的历史也会被删除，但不会影响成品库。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        await deleteHistory(selected);
        setSelected([]);
      },
    });
  };

  return (
    <Modal
      title="历史记录"
      subtitle="手动生成成品时会自动记录完整版本；新建、恢复、载入成品前也会自动备份。"
      onClose={onClose}
      size="xl"
      headerExtra={
        <Button
          size="sm"
          variant="secondary"
          icon="save"
          loading={savingSnapshot}
          onClick={async () => {
            setSavingSnapshot(true);
            try {
              await createSnapshot('manual');
            } finally {
              setSavingSnapshot(false);
            }
          }}
        >
          保存当前版本
        </Button>
      }
      footer={
        <>
          <span className="modal-footer-note">
            共 {history.length} 条 · 已选择 {selected.length} 条
          </span>
          <Button variant="ghost" icon="download" onClick={exportHistory}>
            {selectedEntries.length > 0
              ? '导出选中'
              : filtered.length === history.length
                ? '导出全部'
                : '导出筛选结果'}
          </Button>
          <Button
            variant="ghost"
            icon="trash"
            disabled={history.length === 0}
            onClick={() =>
              confirmAction({
                title: '清空全部历史记录？',
                message: '所有历史版本都会被删除，无法恢复。成品库与草稿不受影响。',
                confirmLabel: '清空历史',
                danger: true,
                onConfirm: () => clearHistory(),
              })
            }
          >
            清空
          </Button>
          <Button variant="primary" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="library-toolbar history-toolbar">
        <label className="search-box">
          <Icon name="search" size={16} />
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称或提示词内容…"
            aria-label="搜索历史记录"
          />
          {search ? (
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="清空搜索">
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </label>
        <select
          className="input select"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortMode)}
          aria-label="排序方式"
        >
          <option value="newest">最新优先</option>
          <option value="oldest">最早优先</option>
          <option value="name">按名称</option>
        </select>
        <label className="favorite-filter">
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(event) => setFavoriteOnly(event.target.checked)}
          />
          只看收藏
        </label>
        <div className="history-bulk">
          <Button
            size="sm"
            variant="secondary"
            icon="history"
            disabled={selected.length !== 2}
            onClick={() => {
              if (selected.length === 2) {
                openCompare(selected[0], selected[1]);
              } else {
                toast('请勾选两条历史记录后再对比。', 'info');
              }
            }}
          >
            对比选中
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            disabled={selected.length === 0}
            onClick={bulkDelete}
          >
            删除选中
          </Button>
        </div>
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon="history"
          title="还没有历史记录"
          description="生成成品或点击「保存当前版本」后，这里会保存完整快照，可随时查看、对比和恢复。"
          action={
            <Button
              variant="primary"
              icon="save"
              onClick={() => void createSnapshot('manual')}
            >
              保存当前版本
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="没有匹配的历史记录"
          description="试试清空搜索或取消收藏筛选。"
          action={
            <Button
              variant="secondary"
              icon="refresh"
              onClick={() => {
                setSearch('');
                setFavoriteOnly(false);
              }}
            >
              清除筛选
            </Button>
          }
        />
      ) : (
        <div className="history-list">
          {filtered.map((entry) => {
            const isSelected = selected.includes(entry.id);
            const expanded = expandedId === entry.id;
            const snapshot = entry.snapshot;
            return (
              <article
                key={entry.id}
                className={`history-item ${isSelected ? 'is-selected' : ''} ${entry.favorite ? 'is-favorite' : ''}`}
              >
                <div className="history-row">
                  <label className="history-check" aria-label={`选择 ${entry.name}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(entry.id)}
                    />
                  </label>
                  <button
                    type="button"
                    className="history-main"
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                    aria-expanded={expanded}
                  >
                    <span className="history-title-line">
                      <span className="history-name">{entry.name}</span>
                      <Badge tone={typeTone(entry.type)}>{typeLabel(entry.type)}</Badge>
                      {entry.favorite ? <Icon name="star-filled" size={14} className="favorite-mark" /> : null}
                    </span>
                    <span className="history-meta-line">
                      {formatDateTime(entry.createdAt)} · {modelTypeLabel(snapshot.params.modelType)}
                      {snapshot.activeLoras.length > 0
                        ? ` · ${snapshot.activeLoras.length} 个 LoRA`
                        : ''}
                      {snapshot.segments.length > 0 ? ` · ${snapshot.segments.length} 个片段` : ''}
                    </span>
                    <span className="history-preview">
                      {truncate(snapshot.englishText || snapshot.draftText || '（空内容）')}
                    </span>
                  </button>
                  <div className="history-actions">
                    <IconButton
                      icon={entry.favorite ? 'star-filled' : 'star'}
                      label={entry.favorite ? '取消收藏' : '收藏'}
                      size="sm"
                      active={entry.favorite}
                      onClick={() => toggleFavorite(entry.id)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="undo"
                      onClick={() =>
                        confirmAction({
                          title: '恢复这个版本？',
                          message: '当前编辑器内容会先自动备份到历史记录，然后恢复这条记录中的完整内容。',
                          confirmLabel: '恢复版本',
                          onConfirm: () => restoreHistory(entry.id),
                        })
                      }
                    >
                      恢复
                    </Button>
                    <IconButton
                      icon="trash"
                      label="删除这条历史"
                      size="sm"
                      onClick={() =>
                        confirmAction({
                          title: '删除这条历史记录？',
                          message: `「${entry.name}」将被删除，无法恢复。`,
                          confirmLabel: '删除',
                          danger: true,
                          onConfirm: () => deleteHistory([entry.id]),
                        })
                      }
                    />
                  </div>
                </div>

                {expanded ? (
                  <div className="history-detail">
                    <div className="history-detail-grid">
                      <div>
                        <span className="detail-label">中文草稿</span>
                        <pre className="detail-pre">{snapshot.draftText || '（空）'}</pre>
                      </div>
                      <div>
                        <span className="detail-label">英文提示词</span>
                        <pre className="detail-pre">{snapshot.englishText || '（空）'}</pre>
                      </div>
                      <div>
                        <span className="detail-label">负向提示词</span>
                        <pre className="detail-pre">{snapshot.negativeText || '（无）'}</pre>
                      </div>
                      <div>
                        <span className="detail-label">参数</span>
                        <pre className="detail-pre">
                          {modelTypeLabel(snapshot.params.modelType)}
                          {'\n'}
                          {snapshot.params.width}×{snapshot.params.height} · Steps {snapshot.params.steps} · CFG{' '}
                          {snapshot.params.cfg}
                          {'\n'}
                          Sampler {snapshot.params.sampler} · Seed {snapshot.params.seed}
                          {snapshot.params.modelName ? `\n模型 ${snapshot.params.modelName}` : ''}
                        </pre>
                      </div>
                    </div>
                    {snapshot.activeLoras.length > 0 ? (
                      <div className="history-detail-loras">
                        <span className="detail-label">LoRA</span>
                        <div className="lora-chip-row">
                          {snapshot.activeLoras.map((lora, index) => (
                            <span className="lora-chip" key={`${lora.name}-${index}`}>
                              {lora.name || '未命名'} <b>{Math.round(lora.weight * 100) / 100}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {snapshot.notes ? (
                      <div>
                        <span className="detail-label">备注</span>
                        <pre className="detail-pre">{snapshot.notes}</pre>
                      </div>
                    ) : null}
                    <div className="history-detail-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="history"
                        onClick={() => {
                          if (selected.length !== 2) {
                            toggleSelect(entry.id);
                            toast('已选择这条版本；再选择另一条即可对比。', 'info');
                          } else if (!selected.includes(entry.id)) {
                            toggleSelect(entry.id);
                          }
                        }}
                      >
                        加入对比
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(null)}
                      >
                        收起
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
