import { useState, type RefObject } from 'react';
import type { Alignment } from '../domain/types';
import { selectTextareaRange } from '../utils/selection';
import { Icon } from './ui/Icon';
import { Badge } from './ui/primitives';

type Side = 'zh' | 'en';

/**
 * 中文 / 英文两个框的对照视图。
 * 对齐来自真实翻译片段，而不是英文空格拆词。
 * 点击中文单元格会在中文框选中对应片段，点击英文同理。
 */
export function AlignedPairs({
  alignment,
  zhText,
  enText,
  zhRef,
  enRef,
  zhSelectable = true,
  enSelectable = true,
}: {
  alignment: Alignment | null;
  zhText: string;
  enText: string;
  zhRef: RefObject<HTMLTextAreaElement | null>;
  enRef: RefObject<HTMLTextAreaElement | null>;
  zhSelectable?: boolean;
  enSelectable?: boolean;
}) {
  const [active, setActive] = useState<{ index: number; side: Side } | null>(null);

  if (!alignment || alignment.pairs.length === 0) {
    return (
      <div className="aligned-empty">
        <Icon name="translate" size={18} />
        <div>
          <strong>还没有可对照的内容</strong>
          <p>翻译后会在这里按片段显示真实的中英对应关系，长句保持整句，不会拆成单词。</p>
        </div>
      </div>
    );
  }

  const zhIsSource = alignment.direction === 'zh-en';
  const expectedZh = zhIsSource ? alignment.sourceText : alignment.targetText;
  const expectedEn = zhIsSource ? alignment.targetText : alignment.sourceText;
  const fresh = zhText === expectedZh && enText === expectedEn;

  const selectPair = (pair: Alignment['pairs'][number], side: Side) => {
    if (!fresh) return;
    if (side === 'zh') {
      selectTextareaRange(
        zhRef.current,
        zhIsSource ? pair.sourceStart : pair.targetStart,
        zhIsSource ? pair.sourceEnd : pair.targetEnd,
      );
    } else {
      selectTextareaRange(
        enRef.current,
        zhIsSource ? pair.targetStart : pair.sourceStart,
        zhIsSource ? pair.targetEnd : pair.sourceEnd,
      );
    }
  };

  return (
    <div className="aligned-view">
      <div className="aligned-meta">
        <span className="aligned-meta-label">
          <Icon name="translate" size={14} /> 对照翻译
        </span>
        <span className="aligned-direction">
          {alignment.direction === 'zh-en' ? '中文 → 英文' : '英文 → 中文'}
          {alignment.provider === 'mock' ? ' · 模拟结果' : ''}
        </span>
        {!fresh ? (
          <span className="aligned-stale">
            <Icon name="alert" size={13} /> 内容已修改，对照可能过期
          </span>
        ) : (
          <span className="aligned-fresh">
            <Icon name="check" size={13} /> 点击任一语言可定位
          </span>
        )}
      </div>

      <div className="aligned-table" role="list">
        {alignment.pairs.map((pair, index) => {
          const zhValue = zhIsSource ? pair.source : pair.target;
          const enValue = zhIsSource ? pair.target : pair.source;
          const zhActive = active?.index === index && active.side === 'zh';
          const enActive = active?.index === index && active.side === 'en';
          return (
            <div className="aligned-row" key={`${index}-${pair.sourceStart}`} role="listitem">
              <span className="aligned-index">{index + 1}</span>
              <button
                type="button"
                className={`aligned-cell ${zhActive ? 'is-active' : ''} ${fresh ? '' : 'is-static'}`}
                onClick={() => {
                  setActive({ index, side: 'zh' });
                  selectPair(pair, 'zh');
                }}
                disabled={!fresh || !zhSelectable}
                title={
                  !zhSelectable
                    ? '中文框当前处于片段模式，切回文本模式后可定位'
                    : fresh
                      ? '在中文框选中这一段'
                      : '重新翻译后可定位'
                }
              >
                <span className="aligned-lang">中文</span>
                <span className="aligned-text">{zhValue || '（空）'}</span>
              </button>
              <span className="aligned-arrow" aria-hidden>
                <Icon name="chevron-right" size={15} />
              </span>
              <button
                type="button"
                className={`aligned-cell ${enActive ? 'is-active' : ''} ${fresh ? '' : 'is-static'}`}
                onClick={() => {
                  setActive({ index, side: 'en' });
                  selectPair(pair, 'en');
                }}
                disabled={!fresh || !enSelectable}
                title={
                  !enSelectable
                    ? '英文框当前处于片段模式，切回文本模式后可定位'
                    : fresh
                      ? '在英文框选中这一段'
                      : '重新翻译后可定位'
                }
              >
                <span className="aligned-lang">英文</span>
                <span className="aligned-text">{enValue || '（空）'}</span>
              </button>
              <span className="aligned-tags">
                {pair.granularity === 'sentence' ? <Badge tone="outline">整句</Badge> : null}
                {pair.unchanged ? <Badge tone="neutral">保留原文</Badge> : null}
                {pair.uncertain ? <Badge tone="warning">近似</Badge> : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="aligned-footnote">
        对照按翻译服务返回的片段生成；短标签逐段对应，长句保持整句。修改任一框后请重新翻译以更新对照。
      </p>
    </div>
  );
}
