import { useState } from 'react';
import { hasCJK } from '../domain/promptParse';
import { collectLoraTerms } from '../domain/loraTerms';
import { copyText } from '../domain/id';
import { translateSingleText } from '../services/translation';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import { Button, Card } from './ui/primitives';

/**
 * 右侧小翻译：输入任意文字，中英互译，然后复制。
 * LoRA 触发词（@dizzy 等）会通过 protectedTerms 原样保留。
 */
export function QuickTranslateCard() {
  const settings = useAppStore((state) => state.settings);
  const loras = useAppStore((state) => state.loras);
  const activeLoras = useAppStore((state) => state.workspace.activeLoras);
  const toast = useAppStore((state) => state.toast);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);

  const direction = hasCJK(input) ? 'zh-en' : 'en-zh';
  const directionLabel = input.trim() ? (direction === 'zh-en' ? '中 → 英' : '英 → 中') : '自动识别';

  const run = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMeta(null);
    try {
      const result = await translateSingleText({
        text: input,
        mode: settings.translateMode,
        dictionary: settings.dictionary,
        protectedTerms: collectLoraTerms(loras, activeLoras),
      });
      setOutput(result.text);
      setMeta(
        result.mock
          ? '本地模拟翻译，不是真实翻译'
          : `${result.providerLabel} · ${result.direction === 'zh-en' ? '中→英' : '英→中'}`,
      );
      toast(result.mock ? '小翻译完成（模拟结果，不是真实翻译）。' : '小翻译完成。', result.mock ? 'warning' : 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!output.trim()) {
      toast('还没有翻译结果可以复制。', 'info');
      return;
    }
    try {
      await copyText(output);
      toast('翻译结果已复制。', 'success');
    } catch {
      toast('复制失败，请手动选择结果文本。', 'error');
    }
  };

  return (
    <Card
      className="side-card quick-translate-card"
      title={
        <span className="panel-title">
          <Icon name="translate" size={17} /> 小翻译
        </span>
      }
      subtitle="输入文字，中英互译；@触发词不会被翻译。"
    >
      <div className="quick-translate-meta">
        <span>{directionLabel}</span>
        <span className="meta-spacer" />
        <span>{input.length} 字符</span>
      </div>
      <textarea
        className="input textarea quick-translate-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void run();
          }
        }}
        maxLength={5000}
        rows={3}
        placeholder="例如：一个白发女孩站在樱花树下"
        spellCheck={false}
        aria-label="小翻译输入"
      />

      {error ? (
        <div className="quick-translate-error" role="alert">
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="quick-translate-actions">
        <Button
          size="sm"
          variant="primary"
          icon="translate"
          loading={busy}
          disabled={!input.trim()}
          onClick={() => void run()}
        >
          翻译
        </Button>
        <Button size="sm" variant="secondary" icon="copy" disabled={!output} onClick={() => void copy()}>
          复制结果
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          disabled={!input && !output}
          onClick={() => {
            setInput('');
            setOutput('');
            setError(null);
            setMeta(null);
          }}
        >
          清空
        </Button>
      </div>

      <textarea
        className="input textarea quick-translate-output"
        value={output}
        readOnly
        rows={3}
        placeholder="翻译结果会显示在这里，然后复制。"
        aria-label="小翻译结果"
      />
      <div className="quick-translate-foot">
        <span>{meta ?? '支持中英自动方向；Ctrl/Cmd + Enter 翻译'}</span>
      </div>
    </Card>
  );
}
