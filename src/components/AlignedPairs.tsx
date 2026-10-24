import { useState, type RefObject } from 'react';
import type { Alignment } from '../domain/types';
import { selectTextareaRange } from '../utils/selection';
import { Icon } from './ui/Icon';
import { Badge } from './ui/primitives';

function languageName(lang: Alignment['sourceLang'] | 'zh' | 'en'): string {
  if (lang === 'zh') return '中文';
  if (lang === 'en') return '英文';
  return '中英混合';
}

export function AlignedPairs({
  alignment,
  side,
  currentText,
  textareaRef,
}: {
  alignment: Alignment | null;
  side: 'draft' | 'english';
  currentText: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!alignment || alignment.pairs.length === 0) {
    return (
      <div className="aligned-empty">
        <Icon name="translate" size={18} />
        <div>
          <strong>还没有可对照的内容</strong>
          <p>翻译后会在这里按片段显示真实的中英对应关系，不会把长句硬拆成单词。</p>
        </div>
      </div>
    );
  }

  const sideText =
    side === 'draft'
      ? alignment.direction === 'zh-en'
        ? alignment.sourceText
        : alignment.targetText
      : alignment.direction === 'zh-en'
        ? alignment.targetText
        : alignment.sourceText;
  const fresh = sideText === currentText;
  const dominantLang = alignment.direction === 'zh-en' ? 'zh' : 'en';
  const targetLang = alignment.direction === 'zh-en' ? 'en' : 'zh';

  return (
    <div className="aligned-view">
      <div className="aligned-meta">
        <span className="aligned-meta-label">
          <Icon name="translate" size={14} /> 对照翻译
        </span>
        <span className="aligned-direction">
          {languageName(dominantLang)} → {languageName(targetLang)}
          {alignment.provider === 'mock' ? ' · 模拟结果' : ''}
        </span>
        {!fresh ? (
          <span className="aligned-stale">
            <Icon name="alert" size={13} /> 内容已修改，对照可能过期
          </span>
        ) : (
          <span className="aligned-fresh">
            <Icon name="check" size={13} /> 点击可定位
          </span>
        )}
      </div>

      <div className="aligned-table" role="list">
        {alignment.pairs.map((pair, index) => {
          const isActive = activeIndex === index;
          const selectable = fresh;
          return (
            <button
              type="button"
              key={`${index}-${pair.sourceStart}`}
              className={`aligned-row ${isActive ? 'is-active' : ''} ${selectable ? '' : 'is-static'}`}
              role="listitem"
              onClick={() => {
                if (!selectable) return;
                setActiveIndex(index);
                if (side === 'draft') {
                  selectTextareaRange(
                    textareaRef.current,
                    alignment.direction === 'zh-en' ? pair.sourceStart : pair.targetStart,
                    alignment.direction === 'zh-en' ? pair.sourceEnd : pair.targetEnd,
                  );
                } else {
                  selectTextareaRange(
                    textareaRef.current,
                    alignment.direction === 'zh-en' ? pair.targetStart : pair.sourceStart,
                    alignment.direction === 'zh-en' ? pair.targetEnd : pair.sourceEnd,
                  );
                }
              }}
              title={selectable ? '在文本框中选中对应内容' : '重新翻译后可定位'}
            >
              <span className="aligned-index">{index + 1}</span>
              <span className="aligned-source">
                <span className="aligned-lang">{languageName(dominantLang)}</span>
                <span className="aligned-text">{pair.source}</span>
              </span>
              <span className="aligned-arrow" aria-hidden>
                <Icon name="chevron-right" size={15} />
              </span>
              <span className="aligned-target">
                <span className="aligned-lang">{languageName(targetLang)}</span>
                <span className="aligned-text">{pair.target || '（空）'}</span>
              </span>
              <span className="aligned-tags">
                {pair.granularity === 'sentence' ? <Badge tone="outline">整句</Badge> : null}
                {pair.unchanged ? <Badge tone="neutral">保留原文</Badge> : null}
                {pair.uncertain ? <Badge tone="warning">近似</Badge> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="aligned-footnote">
        对照按翻译服务返回的片段生成；短标签可逐词对应，长句会保持整句对照，不会伪造逐词映射。
        {!fresh ? ' 修改文本后请重新翻译以更新对照。' : ''}
      </p>
    </div>
  );
}
