import { useRef } from 'react';
import { detectLanguage } from '../domain/promptParse';
import { copyText } from '../domain/id';
import { useAppStore } from '../store/appStore';
import { AlignedPairs } from './AlignedPairs';
import { Card, Button, IconButton, Toggle, Badge } from './ui/primitives';

export function DraftPanel() {
  const draftText = useAppStore((state) => state.workspace.draftText);
  const alignment = useAppStore((state) => state.workspace.alignment);
  const alignmentOn = useAppStore((state) => state.alignmentMode.draft);
  const setAlignmentMode = useAppStore((state) => state.setAlignmentMode);
  const setDraftText = useAppStore((state) => state.setDraftText);
  const clearDraft = useAppStore((state) => state.clearDraft);
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lang = detectLanguage(draftText);
  const langLabel =
    lang === 'zh' ? '中文' : lang === 'en' ? '英文' : lang === 'mixed' ? '中英混合' : '等待输入';
  const langTone = lang === 'zh' ? 'accent' : lang === 'mixed' ? 'warning' : 'neutral';

  const handleCopy = async () => {
    if (!draftText.trim()) {
      toast('草稿是空的，没有可复制的内容。', 'info');
      return;
    }
    try {
      await copyText(draftText);
      toast('草稿已复制到剪贴板。', 'success');
    } catch (error) {
      toast(`复制失败：${error instanceof Error ? error.message : '浏览器拒绝访问剪贴板'}`, 'error');
    }
  };

  const handleClear = () => {
    if (!draftText) return;
    confirmAction({
      title: '清空草稿？',
      message: '英文提示词不会受到影响。清空后可以用撤销（Ctrl+Z）恢复。',
      confirmLabel: '清空草稿',
      danger: true,
      onConfirm: () => clearDraft(),
    });
  };

  return (
    <Card
      className="editor-card draft-card"
      title={
        <span className="panel-title">
          <span className="panel-step">1</span>
          草稿
          <Badge tone={langTone}>{langLabel}</Badge>
        </span>
      }
      subtitle="用中文描述画面，支持英文或中英混合。不用急着翻译。"
      actions={
        <div className="panel-actions">
          <IconButton icon="undo" label="撤销" size="sm" onClick={undo} disabled={!canUndo} />
          <IconButton icon="redo" label="重做" size="sm" onClick={redo} disabled={!canRedo} />
          <IconButton icon="copy" label="复制草稿" size="sm" onClick={() => void handleCopy()} />
          <IconButton icon="trash" label="清空草稿" size="sm" onClick={handleClear} disabled={!draftText} />
        </div>
      }
    >
      <div className="editor-meta-row">
        <span className="meta-text">{draftText.length} 个字符</span>
        <span className="meta-sep" aria-hidden>
          ·
        </span>
        <span className="meta-text">自动保存</span>
        <span className="meta-spacer" />
        {!draftText && lastTranslation?.side === 'draft' ? (
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => restoreLast('draft')}>
            恢复上次翻译
          </Button>
        ) : null}
        {preBackup?.side === 'draft' ? (
          <Button size="sm" variant="ghost" icon="undo" onClick={restorePre}>
            恢复翻译前
          </Button>
        ) : null}
        <label className="inline-toggle">
          <span>对照翻译</span>
          <Toggle
            checked={alignmentOn}
            onChange={(checked) => setAlignmentMode('draft', checked)}
            label="开启草稿对照翻译"
          />
        </label>
      </div>

      <textarea
        ref={textareaRef}
        className="editor-textarea draft-textarea"
        value={draftText}
        onChange={(event) => setDraftText(event.target.value)}
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
        placeholder="例如：一个白发女孩，穿着黑色连衣裙，站在樱花树下，长发，蓝色眼睛，柔和自然光，电影感构图。&#10;也可以直接输入英文标签，例如：1girl, long hair, blue eyes。"
        spellCheck={false}
        aria-label="中文草稿"
      />

      <div className="editor-footnote">
        支持多行、逗号分隔、权重语法与 LoRA 标签；复杂内容不会被强行拆开。
        <span className="kbd-hint">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> 翻译
        </span>
      </div>

      {alignmentOn ? (
        <AlignedPairs
          alignment={alignment}
          side="draft"
          currentText={draftText}
          textareaRef={textareaRef}
        />
      ) : null}
    </Card>
  );
}
