import { useMemo, useState } from 'react';
import type { HistoryEntry } from '../domain/types';
import { diffLines, type DiffLine } from '../domain/diff';
import { formatDateTime } from '../domain/id';
import { modelTypeLabel } from '../domain/presets';
import { useAppStore } from '../store/appStore';
import { Modal } from './ui/Modal';
import { Button, EmptyState, Segmented } from './ui/primitives';

type CompareTab = 'english' | 'draft' | 'negative' | 'meta';

function fieldValue(entry: HistoryEntry, tab: CompareTab): string {
  switch (tab) {
    case 'draft':
      return entry.snapshot.draftText;
    case 'negative':
      return entry.snapshot.negativeText;
    case 'meta':
      return '';
    default:
      return entry.snapshot.englishText;
  }
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff-view" role="table" aria-label="版本差异">
      {lines.map((line, index) => (
        <div
          key={`${index}-${line.type}`}
          className={`diff-row diff-${line.type}`}
          role="row"
        >
          <span className="diff-sign" aria-hidden>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
          </span>
          <span className="diff-text">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

function MetaCompare({ left, right }: { left: HistoryEntry; right: HistoryEntry }) {
  const lorasLeft = left.snapshot.activeLoras
    .map((lora) => `${lora.name}@${Math.round(lora.weight * 100) / 100}`)
    .join('、');
  const lorasRight = right.snapshot.activeLoras
    .map((lora) => `${lora.name}@${Math.round(lora.weight * 100) / 100}`)
    .join('、');
  const rows = [
    ['模型类型', modelTypeLabel(left.snapshot.params.modelType), modelTypeLabel(right.snapshot.params.modelType)],
    ['模型文件名', left.snapshot.params.modelName || '（未填写）', right.snapshot.params.modelName || '（未填写）'],
    ['尺寸', `${left.snapshot.params.width}×${left.snapshot.params.height}`, `${right.snapshot.params.width}×${right.snapshot.params.height}`],
    ['步数 / CFG', `${left.snapshot.params.steps} / ${left.snapshot.params.cfg}`, `${right.snapshot.params.steps} / ${right.snapshot.params.cfg}`],
    ['采样器', left.snapshot.params.sampler || '（默认）', right.snapshot.params.sampler || '（默认）'],
    ['种子', String(left.snapshot.params.seed), String(right.snapshot.params.seed)],
    ['LoRA', lorasLeft || '（无）', lorasRight || '（无）'],
    ['片段数量', String(left.snapshot.segments.length), String(right.snapshot.segments.length)],
    ['备注', left.snapshot.notes || '（空）', right.snapshot.notes || '（空）'],
  ];
  return (
    <div className="meta-compare">
      <div className="meta-compare-head">
        <span />
        <span>{left.name}</span>
        <span>{right.name}</span>
      </div>
      {rows.map(([label, leftValue, rightValue]) => (
        <div
          key={label}
          className={`meta-compare-row ${leftValue !== rightValue ? 'is-changed' : ''}`}
        >
          <span className="meta-compare-label">{label}</span>
          <span>{leftValue}</span>
          <span>{rightValue}</span>
        </div>
      ))}
    </div>
  );
}

export function CompareModal({
  leftId,
  rightId,
  onClose,
}: {
  leftId: string;
  rightId: string;
  onClose: () => void;
}) {
  const history = useAppStore((state) => state.history);
  const restoreHistory = useAppStore((state) => state.restoreHistory);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const [tab, setTab] = useState<CompareTab>('english');

  const left = history.find((entry) => entry.id === leftId);
  const right = history.find((entry) => entry.id === rightId);

  const ordered = useMemo(() => {
    if (!left || !right) return { older: left ?? null, newer: right ?? null };
    return left.createdAt <= right.createdAt
      ? { older: left, newer: right }
      : { older: right, newer: left };
  }, [left, right]);

  const diff = useMemo(() => {
    if (!ordered.older || !ordered.newer || tab === 'meta') {
      return { lines: [], added: 0, removed: 0 };
    }
    return diffLines(fieldValue(ordered.older, tab), fieldValue(ordered.newer, tab));
  }, [ordered, tab]);

  if (!left || !right || !ordered.older || !ordered.newer) {
    return (
      <Modal title="版本对比" onClose={onClose} size="lg">
        <EmptyState
          icon="alert"
          title="找不到要对比的版本"
          description="其中一条历史记录可能已经被删除。"
          action={<Button onClick={onClose}>关闭</Button>}
        />
      </Modal>
    );
  }

  const olderEntry = ordered.older;
  const newerEntry = ordered.newer;

  return (
    <Modal
      title="版本对比"
      subtitle="比较两条历史快照，变化会以 + / − 标出。"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <span className="modal-footer-note">
            {diff.added > 0 || diff.removed > 0
              ? `新增 ${diff.added} 行，删除 ${diff.removed} 行`
              : '当前视图没有文本差异'}
          </span>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="primary"
            icon="undo"
            onClick={() =>
              confirmAction({
                title: '恢复较新的版本？',
                message: `将把「${newerEntry.name}」恢复到编辑器。当前内容会先自动备份到历史记录。`,
                confirmLabel: '恢复这个版本',
                onConfirm: () => restoreHistory(newerEntry.id),
              })
            }
          >
            恢复新版本
          </Button>
        </>
      }
    >
      <div className="compare-versions">
        <div className="compare-version compare-older">
          <span className="compare-tag">较早</span>
          <div className="compare-version-name">{olderEntry.name}</div>
          <div className="compare-version-time">{formatDateTime(olderEntry.createdAt)}</div>
        </div>
        <div className="compare-version compare-newer">
          <span className="compare-tag">较新</span>
          <div className="compare-version-name">{newerEntry.name}</div>
          <div className="compare-version-time">{formatDateTime(newerEntry.createdAt)}</div>
        </div>
      </div>

      <div className="compare-toolbar">
        <Segmented
          value={tab}
          ariaLabel="对比内容"
          onChange={setTab}
          options={[
            { value: 'english', label: '英文提示词' },
            { value: 'draft', label: '中文草稿' },
            { value: 'negative', label: '负向提示词' },
            { value: 'meta', label: '参数与 LoRA' },
          ]}
        />
        <span className="meta-text">旧版本在左，新版本在右；+ 表示新增，− 表示删除。</span>
      </div>

      {tab === 'meta' ? (
        <MetaCompare left={olderEntry} right={newerEntry} />
      ) : diff.lines.length === 0 ? (
        <EmptyState icon="check" title="这段内容没有变化" description="两个版本的这一部分完全相同。" />
      ) : (
        <DiffView lines={diff.lines} />
      )}
    </Modal>
  );
}
