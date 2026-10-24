import { useRef } from 'react';
import { detectLanguage } from '../domain/promptParse';
import { copyText } from '../domain/id';
import { useAppStore } from '../store/appStore';
import { Badge, Button, Card, IconButton } from './ui/primitives';

export function DraftPanel() {
  const draftText = useAppStore((state) => state.workspace.draftText);
  const setDraftText = useAppStore((state) => state.setDraftText);
  const clearDraft = useAppStore((state) => state.clearDraft);
  const useDraftForTranslation = useAppStore((state) => state.useDraftForTranslation);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const canUndo = useAppStore((state) => state.undoStack.length > 0);
  const canRedo = useAppStore((state) => state.redoStack.length > 0);
  const toast = useAppStore((state) => state.toast);
  const confirmAction = useAppStore((state) => state.confirmAction);

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
      message: '只清空上方草稿，不会修改翻译区的中文框和英文框。清空后可以用撤销恢复。',
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
      subtitle="草稿是独立的一个框，用来记录想法。不会自动改动下面的翻译框。"
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
        <Button
          size="sm"
          variant="ghost"
          icon="arrow-down"
          onClick={useDraftForTranslation}
          disabled={!draftText.trim()}
          title="把草稿填入翻译区的中文框"
        >
          填入翻译中文框
        </Button>
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
        placeholder="在这里自由记录想法，例如：一个白发女孩，穿着黑色连衣裙，站在樱花树下，长发，蓝色眼睛，柔和自然光。&#10;写好后点「填入翻译中文框」，再到下面的翻译区翻译。"
        spellCheck={false}
        aria-label="中文草稿"
      />

      <div className="editor-footnote">
        草稿支持多行、逗号分隔与中英混合；真正的双语对照在下面的翻译区。
        <span className="kbd-hint">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> 翻译
        </span>
      </div>
    </Card>
  );
}
