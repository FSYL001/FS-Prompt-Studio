import { useState } from 'react';
import type { PromptSegment } from '../domain/types';
import { hasCJK } from '../domain/promptParse';
import { useAppStore } from '../store/appStore';
import { Button, EmptyState, IconButton } from './ui/primitives';
import { Icon } from './ui/Icon';

function polarityLabel(polarity: PromptSegment['polarity']): string {
  return polarity === 'negative' ? '负向' : '正向';
}

export function SegmentEditor() {
  const segments = useAppStore((state) => state.workspace.segments);
  const settings = useAppStore((state) => state.settings);
  const segmentBusyId = useAppStore((state) => state.segmentBusyId);
  const addSegment = useAppStore((state) => state.addSegment);
  const deleteSegment = useAppStore((state) => state.deleteSegment);
  const duplicateSegment = useAppStore((state) => state.duplicateSegment);
  const moveSegment = useAppStore((state) => state.moveSegment);
  const setSegmentText = useAppStore((state) => state.setSegmentText);
  const setSegmentTranslation = useAppStore((state) => state.setSegmentTranslation);
  const setSegmentWeight = useAppStore((state) => state.setSegmentWeight);
  const setSegmentPolarity = useAppStore((state) => state.setSegmentPolarity);
  const toggleSegmentLock = useAppStore((state) => state.toggleSegmentLock);
  const translateSegment = useAppStore((state) => state.translateSegment);
  const translateAll = useAppStore((state) => state.translateAllSegments);
  const clearSegments = useAppStore((state) => state.clearSegments);
  const refreshFromEnglish = useAppStore((state) => state.refreshSegmentsFromEnglish);
  const syncToEnglish = useAppStore((state) => state.syncSegmentsToEnglish);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toast = useAppStore((state) => state.toast);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleRefresh = () => {
    if (segments.length === 0) {
      refreshFromEnglish();
      return;
    }
    confirmAction({
      title: '按英文提示词重新拆分？',
      message:
        '现有片段会按当前英文提示词重新生成；文本相同的片段会保留译文、权重与锁定状态。此操作可以用撤销恢复。',
      confirmLabel: '重新拆分',
      onConfirm: () => refreshFromEnglish(),
    });
  };

  const handleClear = () => {
    if (segments.length === 0) return;
    confirmAction({
      title: '清空所有片段？',
      message: '只会清空片段列表，已经生成的英文提示词不会被清空。此操作可以用撤销恢复。',
      confirmLabel: '清空片段',
      danger: true,
      onConfirm: () => clearSegments(),
    });
  };

  return (
    <div className="segment-editor">
      <div className="segment-toolbar">
        <div className="segment-toolbar-left">
          <Button size="sm" variant="secondary" icon="plus" onClick={() => addSegment()}>
            添加片段
          </Button>
          <Button size="sm" variant="ghost" icon="refresh" onClick={handleRefresh}>
            按英文重新拆分
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="translate"
            loading={segmentBusyId === 'all'}
            onClick={() => void translateAll()}
            disabled={segments.length === 0 || segmentBusyId !== null}
          >
            翻译未翻译片段
          </Button>
          <Button size="sm" variant="ghost" icon="wand" onClick={syncToEnglish} disabled={segments.length === 0}>
            重新组合
          </Button>
        </div>
        <div className="segment-toolbar-right">
          <span className="meta-text">{segments.length} 个片段</span>
          <IconButton
            icon="trash"
            label="清空片段"
            size="sm"
            onClick={handleClear}
            disabled={segments.length === 0}
          />
        </div>
      </div>

      <p className="segment-hint">
        拖动左侧手柄可排序。片段可以是单词、短语，也可以是完整句子；负向片段会进入成品的负向提示词。
        锁定后批量翻译会跳过该片段。
      </p>

      {segments.length === 0 ? (
        <EmptyState
          icon="layers"
          title="还没有片段"
          description="可以从当前英文提示词拆分，或手动添加一个片段。"
          action={
            <div className="empty-actions">
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => refreshFromEnglish()}>
                从英文拆分
              </Button>
              <Button size="sm" variant="ghost" icon="plus" onClick={() => addSegment()}>
                添加片段
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="segment-list">
          {segments.map((segment, index) => {
            const busy = segmentBusyId === segment.id || segmentBusyId === 'all';
            const translationLabel = hasCJK(segment.text) ? '英文' : '中文';
            return (
              <li
                key={segment.id}
                className={[
                  'segment-row',
                  segment.locked ? 'is-locked' : '',
                  segment.polarity === 'negative' ? 'is-negative' : '',
                  dropIndex === index ? 'is-drop-target' : '',
                  dragIndex === index ? 'is-dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropIndex(index);
                }}
                onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const raw = event.dataTransfer.getData('text/plain');
                  const from = Number(raw);
                  setDropIndex(null);
                  setDragIndex(null);
                  if (Number.isInteger(from)) moveSegment(from, index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                <span className="segment-drag" title="拖动排序" aria-hidden>
                  <Icon name="grip" size={16} />
                </span>
                <span className="segment-index">{index + 1}</span>

                <div className="segment-main">
                  <div className="segment-input-row">
                    <input
                      className="input segment-input"
                      value={segment.text}
                      onChange={(event) => setSegmentText(segment.id, event.target.value)}
                      placeholder="片段内容，例如 long hair / 长发 / 一个女孩站在樱花树下"
                      spellCheck={false}
                      aria-label={`片段 ${index + 1} 内容`}
                    />
                    <label className="segment-weight" title="片段权重，会在输出时包裹为 (内容:权重)">
                      <span>权重</span>
                      <input
                        className="input segment-weight-input"
                        type="number"
                        step="0.05"
                        min={-2}
                        max={2}
                        value={segment.weight ?? ''}
                        placeholder="1"
                        disabled={!settings.output.includeWeights}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === '') {
                            setSegmentWeight(segment.id, null);
                            return;
                          }
                          const value = Number(raw);
                          if (Number.isFinite(value)) setSegmentWeight(segment.id, value);
                        }}
                        aria-label={`片段 ${index + 1} 权重`}
                      />
                    </label>
                    <select
                      className="input select segment-polarity"
                      value={segment.polarity}
                      onChange={(event) =>
                        setSegmentPolarity(
                          segment.id,
                          event.target.value === 'negative' ? 'negative' : 'positive',
                        )
                      }
                      title="正向 / 负向"
                      aria-label={`片段 ${index + 1} 正负向`}
                    >
                      <option value="positive">正向</option>
                      <option value="negative">负向</option>
                    </select>
                    <div className="segment-actions">
                      <IconButton
                        icon="translate"
                        label={busy ? '翻译中…' : '翻译这个片段'}
                        size="sm"
                        onClick={() => void translateSegment(segment.id)}
                        disabled={busy || !segment.text.trim() || segment.locked}
                      />
                      <IconButton
                        icon={segment.locked ? 'lock' : 'unlock'}
                        label={segment.locked ? '解锁片段' : '锁定片段（批量翻译跳过）'}
                        size="sm"
                        active={segment.locked}
                        onClick={() => toggleSegmentLock(segment.id)}
                      />
                      <IconButton
                        icon="copy"
                        label="复制片段"
                        size="sm"
                        onClick={() => duplicateSegment(segment.id)}
                      />
                      <IconButton
                        icon="trash"
                        label="删除片段"
                        size="sm"
                        onClick={() => deleteSegment(segment.id)}
                      />
                    </div>
                  </div>

                  {segment.translated || busy ? (
                    <div className="segment-translation-row">
                      <span className="segment-translation-label">{translationLabel}</span>
                      <input
                        className="input segment-translation-input"
                        value={segment.translated}
                        onChange={(event) => setSegmentTranslation(segment.id, event.target.value)}
                        placeholder={busy ? '翻译中…' : `可编辑${translationLabel}译文`}
                        spellCheck={false}
                        aria-label={`片段 ${index + 1} 译文`}
                      />
                      {segment.locked ? (
                        <span className="segment-badge">
                          <Icon name="lock" size={12} /> 已锁定
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="segment-translation-placeholder">
                      <span>{translationLabel}译文：点击右侧「翻译」按钮生成</span>
                      {segment.locked ? (
                        <span className="segment-badge">
                          <Icon name="lock" size={12} /> 已锁定
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="segment-move">
                  <IconButton
                    icon="arrow-up"
                    label="上移片段"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveSegment(index, index - 1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label="下移片段"
                    size="sm"
                    disabled={index === segments.length - 1}
                    onClick={() => moveSegment(index, index + 1)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="segment-footer">
        <span>
          当前输出格式：
          {settings.output.format === 'lines' ? '每行一个片段' : '用分隔符连接'} ·{' '}
          {settings.output.format === 'custom'
            ? JSON.stringify(settings.output.customSeparator)
            : JSON.stringify(settings.output.format === 'lines' ? '\n' : settings.output.separator)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon="settings"
          onClick={() => useAppStore.getState().openModal({ type: 'settings', section: 'general' })}
        >
          输出设置
        </Button>
      </div>
    </div>
  );
}
