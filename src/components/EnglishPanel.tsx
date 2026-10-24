import { useRef, useState } from 'react';
import { detectLanguage, hasCJK } from '../domain/promptParse';
import { copyText } from '../domain/id';
import { translateSingleText } from '../services/translation';
import { useAppStore } from '../store/appStore';
import { AlignedPairs } from './AlignedPairs';
import { SegmentEditor } from './SegmentEditor';
import { Icon } from './ui/Icon';
import {
  Badge,
  Button,
  Card,
  IconButton,
  InlineError,
  Segmented,
  Toggle,
} from './ui/primitives';

export function EnglishPanel() {
  const englishText = useAppStore((state) => state.workspace.englishText);
  const negativeText = useAppStore((state) => state.workspace.negativeText);
  const segmentsMode = useAppStore((state) => state.workspace.segmentsMode);
  const alignment = useAppStore((state) => state.workspace.alignment);
  const settings = useAppStore((state) => state.settings);
  const alignmentOn = useAppStore((state) => state.alignmentMode.english);
  const setAlignmentMode = useAppStore((state) => state.setAlignmentMode);
  const setEnglishText = useAppStore((state) => state.setEnglishText);
  const setNegativeText = useAppStore((state) => state.setNegativeText);
  const clearEnglish = useAppStore((state) => state.clearEnglish);
  const clearNegative = useAppStore((state) => state.clearNegative);
  const enterSegments = useAppStore((state) => state.enterSegmentsMode);
  const exitSegments = useAppStore((state) => state.exitSegmentsMode);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const canUndo = useAppStore((state) => state.undoStack.length > 0);
  const canRedo = useAppStore((state) => state.redoStack.length > 0);
  const toast = useAppStore((state) => state.toast);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const preBackup = useAppStore((state) => state.preTranslateBackup);
  const lastTranslation = useAppStore((state) => state.lastTranslation);
  const restorePre = useAppStore((state) => state.restorePreTranslation);
  const restoreLast = useAppStore((state) => state.restoreLastTranslation);
  const translateError = useAppStore((state) => state.translateError);
  const dismissTranslateError = useAppStore((state) => state.dismissTranslateError);
  const runTranslation = useAppStore((state) => state.runTranslation);
  const draftText = useAppStore((state) => state.workspace.draftText);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [negativeBusy, setNegativeBusy] = useState(false);
  const lang = detectLanguage(englishText);
  const langLabel =
    lang === 'zh' ? '中文待翻译' : lang === 'en' ? '英文' : lang === 'mixed' ? '中英混合' : '等待翻译';
  const langTone = lang === 'zh' ? 'warning' : lang === 'mixed' ? 'warning' : 'neutral';

  const handleCopy = async () => {
    if (!englishText.trim()) {
      toast('英文提示词是空的，没有可复制的内容。', 'info');
      return;
    }
    try {
      await copyText(englishText);
      toast('英文提示词已复制。', 'success');
    } catch (error) {
      toast(`复制失败：${error instanceof Error ? error.message : '浏览器拒绝访问剪贴板'}`, 'error');
    }
  };

  const handleClear = () => {
    if (!englishText && !segmentsMode) return;
    confirmAction({
      title: '清空英文提示词？',
      message:
        '草稿不会被清空。如果你在片段模式，片段列表也会一起清空。此操作可以用撤销恢复。',
      confirmLabel: '清空英文',
      danger: true,
      onConfirm: () => clearEnglish(),
    });
  };

  const handleTranslateNegative = async () => {
    if (!negativeText.trim() || negativeBusy) return;
    setNegativeBusy(true);
    try {
      const result = await translateSingleText({
        text: negativeText,
        mode: settings.translateMode,
        dictionary: settings.dictionary,
      });
      setNegativeText(result.text);
      toast(
        result.mock ? '负向提示词已翻译（本地模拟翻译，不是真实翻译）。' : '负向提示词已翻译。',
        result.mock ? 'warning' : 'success',
      );
    } catch (error) {
      toast(`负向提示词翻译失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setNegativeBusy(false);
    }
  };

  return (
    <Card
      className="editor-card english-card"
      title={
        <span className="panel-title">
          <span className="panel-step">2</span>
          英文提示词
          <Badge tone={langTone}>{langLabel}</Badge>
        </span>
      }
      subtitle="翻译结果可以直接修改；再次翻译前会先询问方向，避免覆盖你的编辑。"
      actions={
        <div className="panel-actions">
          <IconButton icon="undo" label="撤销" size="sm" onClick={undo} disabled={!canUndo} />
          <IconButton icon="redo" label="重做" size="sm" onClick={redo} disabled={!canRedo} />
          <IconButton icon="copy" label="复制英文提示词" size="sm" onClick={() => void handleCopy()} />
          <IconButton
            icon="trash"
            label="清空英文提示词"
            size="sm"
            onClick={handleClear}
            disabled={!englishText && !segmentsMode}
          />
        </div>
      }
    >
      <div className="editor-meta-row">
        <Segmented
          size="sm"
          ariaLabel="英文编辑模式"
          value={segmentsMode ? 'segments' : 'text'}
          options={[
            { value: 'text', label: '文本模式' },
            { value: 'segments', label: '片段模式' },
          ]}
          onChange={(value) => (value === 'segments' ? enterSegments() : exitSegments())}
        />
        <span className="meta-text">{englishText.length} 个字符</span>
        <span className="meta-spacer" />
        {!englishText && lastTranslation?.side === 'english' ? (
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => restoreLast('english')}>
            恢复上次翻译
          </Button>
        ) : null}
        {preBackup?.side === 'english' ? (
          <Button size="sm" variant="ghost" icon="undo" onClick={restorePre}>
            恢复翻译前
          </Button>
        ) : null}
        <label className="inline-toggle">
          <span>对照翻译</span>
          <Toggle
            checked={alignmentOn}
            onChange={(checked) => setAlignmentMode('english', checked)}
            label="开启英文对照翻译"
          />
        </label>
      </div>

      {translateError ? (
        <div className="translate-error-wrap">
          <InlineError
            message={translateError.message}
            hint={translateError.hint}
            onDismiss={dismissTranslateError}
            onRetry={() => {
              const direction =
                translateError.direction ?? (hasCJK(draftText) ? 'zh-en' : 'en-zh');
              void runTranslation(direction);
            }}
          />
        </div>
      ) : null}

      {segmentsMode ? (
        <SegmentEditor />
      ) : (
        <textarea
          ref={textareaRef}
          className="editor-textarea english-textarea"
          value={englishText}
          onChange={(event) => setEnglishText(event.target.value)}
          onKeyDown={(event) => {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod) return;
            if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
              event.preventDefault();
              undo();
            } else if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
              event.preventDefault();
              redo();
            }
          }}
          placeholder="翻译后的英文提示词会显示在这里，也可以直接输入英文标签，例如：1girl, white hair, black dress, standing, cherry blossoms。"
          spellCheck={false}
          aria-label="英文提示词"
        />
      )}

      <div className="editor-footnote">
        {segmentsMode ? (
          <>
            片段改动会实时重新组合英文提示词。
            <span className="footnote-note">输出分隔符与权重语法可在设置中调整。</span>
          </>
        ) : (
          <>
            支持普通单词、短语、完整句子与逗号分隔标签；权重与 LoRA 语法会被保留。
            <span className="kbd-hint">
              <kbd>Ctrl</kbd> + <kbd>Z</kbd> 撤销
            </span>
          </>
        )}
      </div>

      {alignmentOn ? (
        <AlignedPairs
          alignment={alignment}
          side="english"
          currentText={englishText}
          textareaRef={textareaRef}
        />
      ) : null}

      <details className="negative-block" open={negativeText.trim().length > 0}>
        <summary>
          <span className="negative-title">
            <Icon name="minus" size={15} />
            负向提示词（可选）
          </span>
          <span className="negative-meta">
            {negativeText.length > 0 ? `${negativeText.length} 个字符` : '通常是英文，例如：lowres, blurry'}
          </span>
          <Icon name="chevron-down" size={16} className="details-chevron" />
        </summary>
        <div className="negative-body">
          <textarea
            className="editor-textarea negative-textarea"
            value={negativeText}
            onChange={(event) => setNegativeText(event.target.value)}
            placeholder="lowres, bad anatomy, bad hands, extra fingers, watermark, text"
            spellCheck={false}
            aria-label="负向提示词"
          />
          <div className="negative-actions">
            <span className="meta-text">片段中被标记为「负向」的内容也会合并到这里。</span>
            <div className="negative-buttons">
              {hasCJK(negativeText) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="translate"
                  loading={negativeBusy}
                  onClick={() => void handleTranslateNegative()}
                >
                  翻译为英文
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                disabled={!negativeText}
                onClick={() => {
                  confirmAction({
                    title: '清空负向提示词？',
                    message: '此操作可以用撤销恢复。',
                    confirmLabel: '清空',
                    danger: true,
                    onConfirm: () => clearNegative(),
                  });
                }}
              >
                清空
              </Button>
            </div>
          </div>
        </div>
      </details>
    </Card>
  );
}
