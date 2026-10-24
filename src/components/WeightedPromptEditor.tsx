import { useMemo, useState } from 'react';
import {
  applyWeight,
  countWeightGroups,
  parseWeightUnits,
  type WeightDirection,
  type WeightGranularity,
} from '../domain/weights';
import { Icon } from './ui/Icon';
import { Segmented } from './ui/primitives';

/**
 * 片段模式：普通文本框 + 可点击的单词/单句。
 * 先打开「加权」或「降权」开关，再点击文字片段：
 *   加权 → (片段)，继续点击 → ((片段))
 *   降权 → [片段]，继续点击 → [[片段]]
 * 再次用相反方向点击会去掉一层。
 */
export function WeightedPromptEditor({
  value,
  onChange,
  ariaLabel = '英文提示词片段编辑',
}: {
  value: string;
  onChange: (text: string) => void;
  ariaLabel?: string;
}) {
  const [granularity, setGranularity] = useState<WeightGranularity>('word');
  const [direction, setDirection] = useState<WeightDirection | null>(null);

  const units = useMemo(() => parseWeightUnits(value, granularity), [value, granularity]);
  const stats = useMemo(() => countWeightGroups(value), [value]);

  const handleClick = (start: number, end: number) => {
    if (!direction) return;
    const result = applyWeight(value, start, end, direction);
    onChange(result.text);
  };

  return (
    <div className="weighted-editor">
      <div className="weighted-toolbar">
        <div className="weighted-toolbar-group">
          <span className="weighted-toolbar-label">粒度</span>
          <Segmented
            size="sm"
            value={granularity}
            ariaLabel="片段粒度"
            options={[
              { value: 'word', label: '按单词' },
              { value: 'sentence', label: '按单句' },
            ]}
            onChange={(next) => {
              setGranularity(next);
              setDirection(null);
            }}
          />
        </div>
        <div className="weighted-toolbar-group">
          <span className="weighted-toolbar-label">开关</span>
          <button
            type="button"
            className={`weight-switch weight-increase ${direction === 'increase' ? 'is-active' : ''}`}
            aria-pressed={direction === 'increase'}
            onClick={() => setDirection((current) => (current === 'increase' ? null : 'increase'))}
            title="开启后，点击单词/单句为它加权：(片段)"
          >
            <Icon name="plus" size={14} />
            加权
            <code>()</code>
          </button>
          <button
            type="button"
            className={`weight-switch weight-decrease ${direction === 'decrease' ? 'is-active' : ''}`}
            aria-pressed={direction === 'decrease'}
            onClick={() => setDirection((current) => (current === 'decrease' ? null : 'decrease'))}
            title="开启后，点击单词/单句为它降权：[片段]"
          >
            <Icon name="minus" size={14} />
            降权
            <code>[]</code>
          </button>
        </div>
        <div className="weighted-stats">
          <span>加权 {stats.increased}</span>
          <span>降权 {stats.decreased}</span>
        </div>
      </div>

      <div
        className={`weighted-canvas ${direction ? `mode-${direction}` : 'mode-idle'}`}
        role="group"
        aria-label={ariaLabel}
      >
        {value.trim() ? (
          units.map((unit, index) =>
            unit.type === 'separator' ? (
              <span key={`sep-${index}-${unit.start}`} className="weighted-sep">
                {unit.text}
              </span>
            ) : (
              <button
                key={`unit-${index}-${unit.start}`}
                type="button"
                className={`weighted-unit ${direction ? 'is-clickable' : ''}`}
                onClick={() => handleClick(unit.start, unit.end)}
                disabled={!direction}
                title={
                  direction === 'increase'
                    ? '点击加权：套一层圆括号'
                    : direction === 'decrease'
                      ? '点击降权：套一层方括号'
                      : '先开启加权或降权开关'
                }
              >
                {unit.text}
              </button>
            ),
          )
        ) : (
          <span className="weighted-empty">这里还没有英文提示词。</span>
        )}
      </div>

      <div className="weighted-hint">
        {direction === 'increase' ? (
          <>
            <Icon name="plus" size={13} /> 加权已开启：点击单词或单句添加一层 <code>( )</code>，再点继续叠加。
          </>
        ) : direction === 'decrease' ? (
          <>
            <Icon name="minus" size={13} /> 降权已开启：点击单词或单句添加一层 <code>[ ]</code>，再点继续叠加。
          </>
        ) : (
          <>先选择「加权」或「降权」，再点击下面的单词 / 单句。再次用相反开关点击会取消一层。</>
        )}
        <span className="weighted-hint-note">括号语法会直接写入英文提示词，文字本身不会被改动。</span>
      </div>
    </div>
  );
}
