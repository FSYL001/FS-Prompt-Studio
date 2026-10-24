import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/appStore';

interface MentionState {
  start: number;
  query: string;
  left: number;
  top: number;
  bottom: number;
  width: number;
}

interface AtMentionTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: MutableRefObject<HTMLTextAreaElement | null>;
}

/**
 * 输入 @ 时弹出 LoRA 触发词列表，选中后插入 @trigger。
 * 下拉层使用 fixed + portal，避免被卡片 overflow 裁切。
 */
export function AtMentionTextarea({
  value,
  onChange,
  textareaRef,
  onKeyDown,
  onBlur,
  onClick,
  onCompositionEnd,
  ...textareaProps
}: AtMentionTextareaProps) {
  const loras = useAppStore((state) => state.loras);
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const allTriggers = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ trigger: string; loraName: string }> = [];
    for (const lora of loras) {
      for (const raw of lora.triggerWords) {
        const trigger = raw.trim().replace(/^@+/, '');
        if (!trigger) continue;
        const key = trigger.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ trigger, loraName: lora.name });
      }
    }
    return items;
  }, [loras]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return allTriggers
      .filter((item) => !query || item.trigger.toLowerCase().includes(query))
      .slice(0, 12);
  }, [allTriggers, mention]);

  useEffect(() => {
    if (!mention) return;
    const close = () => setMention(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [mention]);

  useEffect(() => {
    setActiveIndex(0);
  }, [mention?.query]);

  const updateMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = before.match(/(?:^|[^A-Za-z0-9_])@([\p{L}\p{N}_.-]*)$/u);
    if (!match) {
      setMention(null);
      return;
    }
    const query = match[1] ?? '';
    const start = caret - query.length - 1;
    const element = innerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setMention({
      start,
      query,
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
    });
  };

  const insertTrigger = (trigger: string) => {
    if (!mention) return;
    const element = innerRef.current;
    const caret = element?.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const needsSpace = after.length > 0 && !/^[\s,，;；、]/.test(after);
    const inserted = `@${trigger}${needsSpace ? ' ' : ''}`;
    const next = `${before}${inserted}${after}`;
    onChange(next);
    setMention(null);
    requestAnimationFrame(() => {
      element?.focus();
      const position = before.length + inserted.length;
      element?.setSelectionRange(position, position);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (suggestions.length ? (index + 1) % suggestions.length : 0));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) =>
          suggestions.length ? (index - 1 + suggestions.length) % suggestions.length : 0,
        );
        return;
      }
      if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        suggestions[activeIndex]
      ) {
        event.preventDefault();
        insertTrigger(suggestions[activeIndex].trigger);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const menuWidth = mention ? Math.max(280, mention.width) : 280;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const left = mention ? Math.max(8, Math.min(mention.left, viewportWidth - menuWidth - 8)) : 0;
  const estimatedHeight = Math.min(320, suggestions.length * 46 + 48);
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const top = mention
    ? mention.bottom + estimatedHeight + 8 > viewportHeight
      ? Math.max(8, mention.top - estimatedHeight - 8)
      : mention.bottom + 8
    : 0;

  return (
    <>
      <textarea
        {...textareaProps}
        ref={(node) => {
          innerRef.current = node;
          if (textareaRef) textareaRef.current = node;
        }}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if ((event.nativeEvent as InputEvent).isComposing) return;
          updateMention(event.target.value, event.target.selectionStart ?? 0);
        }}
        onClick={(event) => {
          updateMention(value, event.currentTarget.selectionStart ?? 0);
          onClick?.(event);
        }}
        onCompositionEnd={(event) => {
          onCompositionEnd?.(event);
          updateMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          setMention(null);
          onBlur?.(event);
        }}
        aria-autocomplete="list"
        aria-expanded={Boolean(mention)}
      />

      {mention && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="at-mention-popover"
              style={{ left, top, width: menuWidth }}
              role="listbox"
              aria-label="LoRA 触发词"
            >
              <div className="at-mention-head">
                <span>LoRA 触发词</span>
                <span className="at-mention-keys">
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 插入
                </span>
              </div>
              {suggestions.length > 0 ? (
                suggestions.map((item, index) => (
                  <button
                    key={`${item.trigger}-${index}`}
                    type="button"
                    className={`at-mention-item ${index === activeIndex ? 'is-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertTrigger(item.trigger)}
                    role="option"
                    aria-selected={index === activeIndex}
                  >
                    <span className="at-mention-trigger">@{item.trigger}</span>
                    <span className="at-mention-lora">{item.loraName}</span>
                  </button>
                ))
              ) : (
                <div className="at-mention-empty">没有匹配的 LoRA 触发词</div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
