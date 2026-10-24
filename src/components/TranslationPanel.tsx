import { useRef, useState } from 'react';
import { detectLanguage, hasCJK } from '../domain/promptParse';
import { collectLoraTerms } from '../domain/loraTerms';
import { copyText } from '../domain/id';
import { translateSingleText } from '../services/translation';
import { useAppStore } from '../store/appStore';
import { AlignedPairs } from './AlignedPairs';
import { AtMentionTextarea } from './AtMentionTextarea';
import { WeightedPromptEditor } from './WeightedPromptEditor';
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

type BoxMode = 'text' | 'segments';

export function TranslationPanel() {
  const draftText = useAppStore((state) => state.workspace.draftText);
  const translationZhText = useAppStore((state) => state.workspace.translationZhText);
  const englishText = useAppStore((state) => state.workspace.englishText);
  const negativeText = useAppStore((state) => state.workspace.negativeText);
  const negativeZhText = useAppStore((state) => state.workspace.negativeZhText);
  const alignment = useAppStore((state) => state.workspace.alignment);
  const activeLoras = useAppStore((state) => state.workspace.activeLoras);
  const loras = useAppStore((state) => state.loras);
  const settings = useAppStore((state) => state.settings);
  const alignmentVisible = useAppStore((state) => state.alignmentVisible);
  const toggleAlignment = useAppStore((state) => state.toggleAlignment);
  const setTranslationZhText = useAppStore((state) => state.setTranslationZhText);
  const setEnglishText = useAppStore((state) => state.setEnglishText);
  const setNegativeText = useAppStore((state) => state.setNegativeText);
  const setNegativeZhText = useAppStore((state) => state.setNegativeZhText);
  const clearTranslationZh = useAppStore((state) => state.clearTranslationZh);
  const clearEnglish = useAppStore((state) => state.clearEnglish);
  const clearNegative = useAppStore((state) => state.clearNegative);
  const useDraftForTranslation = useAppStore((state) => state.useDraftForTranslation);
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

  const zhRef = useRef<HTMLTextAreaElement>(null);
  const enRef = useRef<HTMLTextAreaElement>(null);
  const [zhMode, setZhMode] = useState<BoxMode>('text');
  const [englishMode, setEnglishMode] = useState<BoxMode>('text');
  const [negativeBusy, setNegativeBusy] = useState(false);

  const zhLang = detectLanguage(translationZhText);
  const enLang = detectLanguage(englishText);

  const handleCopy = async (text: string, label: string) => {
    if (!text.trim()) {
      toast(`${label}是空的，没有可复制的内容。`, 'info');
      return;
    }
    try {
      await copyText(text);
      toast(`${label}已复制。`, 'success');
    } catch (error) {
      toast(`复制失败：${error instanceof Error ? error.message : '浏览器拒绝访问剪贴板'}`, 'error');
    }
  };

  const handleClearZh = () => {
    if (!translationZhText) return;
    confirmAction({
      title: '清空中文翻译框？',
      message: '只清空翻译区的中文框，草稿和英文框不会受影响。此操作可以用撤销恢复。',
      confirmLabel: '清空中文',
      danger: true,
      onConfirm: () => clearTranslationZh(),
    });
  };

  const handleClearEnglish = () => {
    if (!englishText) return;
    confirmAction({
      title: '清空英文提示词？',
      message: '中文翻译框与草稿不会受影响。此操作可以用撤销恢复。',
      confirmLabel: '清空英文',
      danger: true,
      onConfirm: () => clearEnglish(),
    });
  };

  const translateNegative = async (direction: 'zh-en' | 'en-zh') => {
    if (negativeBusy) return;
    const source = direction === 'zh-en' ? negativeZhText : negativeText;
    const target = direction === 'zh-en' ? negativeText : negativeZhText;
    if (!source.trim()) {
      toast(direction === 'zh-en' ? '负面中文框是空的。' : '负面英文框是空的。', 'info');
      return;
    }
    const apply = async () => {
      setNegativeBusy(true);
      try {
        const result = await translateSingleText({
          text: source,
          mode: settings.translateMode,
          dictionary: settings.dictionary,
          protectedTerms: collectLoraTerms(loras, activeLoras),
        });
        if (direction === 'zh-en') setNegativeText(result.text);
        else setNegativeZhText(result.text);
        toast(
          result.mock
            ? '负面提示词已翻译（本地模拟翻译，不是真实翻译）。'
            : direction === 'zh-en'
              ? '负面中文已翻译为英文。'
              : '负面英文已翻译为中文。',
          result.mock ? 'warning' : 'success',
        );
      } catch (error) {
        toast(`负面提示词翻译失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
      } finally {
        setNegativeBusy(false);
      }
    };
    if (target.trim() && target !== source) {
      confirmAction({
        title: '替换现有负面内容？',
        message:
          direction === 'zh-en'
            ? '当前负面英文会被新译文覆盖，可以用撤销恢复。'
            : '当前负面中文会被新译文覆盖，可以用撤销恢复。',
        confirmLabel: '翻译并替换',
        onConfirm: () => void apply(),
      });
      return;
    }
    await apply();
  };

  const copyPositiveToNegative = () => {
    if (!englishText.trim() && !translationZhText.trim()) {
      toast('正向翻译还是空的，没有内容可以复制。', 'info');
      return;
    }
    const apply = () => {
      setNegativeZhText(translationZhText);
      setNegativeText(englishText);
      toast('已把正向中文 / 英文各复制一份到负面提示词，成品会一起保存。', 'success');
    };
    if (
      (negativeText.trim() && negativeText !== englishText) ||
      (negativeZhText.trim() && negativeZhText !== translationZhText)
    ) {
      confirmAction({
        title: '替换现有负面提示词？',
        message: '当前负面中文 / 英文会被正向翻译覆盖，此操作可以用撤销恢复。',
        confirmLabel: '复制并替换',
        onConfirm: apply,
      });
      return;
    }
    apply();
  };

  const retryDirection =
    translateError?.direction ?? (hasCJK(translationZhText) ? 'zh-en' : 'en-zh');

  return (
    <Card
      className="editor-card translation-card"
      title={
        <span className="panel-title">
          <span className="panel-step">2</span>
          翻译
          <Badge tone="neutral">中文 / 英文</Badge>
        </span>
      }
      subtitle="上方草稿独立保存；这里的中文与英文是两个可编辑的翻译框，翻译只作用于这两个框。"
      actions={
        <div className="panel-actions translation-head-actions">
          <IconButton icon="undo" label="撤销" size="sm" onClick={undo} disabled={!canUndo} />
          <IconButton icon="redo" label="重做" size="sm" onClick={redo} disabled={!canRedo} />
          <label className="inline-toggle">
            <span>对照</span>
            <Toggle
              checked={alignmentVisible}
              onChange={toggleAlignment}
              label="开启对照翻译"
            />
          </label>
        </div>
      }
    >
      {translateError ? (
        <div className="translate-error-wrap">
          <InlineError
            message={translateError.message}
            hint={translateError.hint}
            onDismiss={dismissTranslateError}
            onRetry={() => void runTranslation(retryDirection)}
          />
        </div>
      ) : null}

      <div className="translation-grid">
        <section className="translation-box">
          <header className="translation-box-head">
            <div className="translation-box-title">
              <span className="lang-mark lang-zh">中</span>
              中文
              {zhLang === 'en' && translationZhText.trim() ? (
                <span className="translation-box-note">当前是英文内容</span>
              ) : null}
            </div>
            <div className="translation-box-actions">
              <Segmented
                size="sm"
                ariaLabel="中文编辑模式"
                value={zhMode}
                options={[
                  { value: 'text', label: '文本' },
                  { value: 'segments', label: '片段' },
                ]}
                onChange={(value) => setZhMode(value as BoxMode)}
              />
              {draftText.trim() ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="arrow-down"
                  onClick={useDraftForTranslation}
                  title="把草稿内容填入这个中文框"
                >
                  使用草稿
                </Button>
              ) : null}
              <IconButton
                icon="copy"
                label="复制中文翻译"
                size="sm"
                onClick={() => void handleCopy(translationZhText, '中文翻译')}
              />
              <IconButton
                icon="trash"
                label="清空中文翻译"
                size="sm"
                onClick={handleClearZh}
                disabled={!translationZhText}
              />
            </div>
          </header>
          {zhMode === 'text' ? (
            <AtMentionTextarea
              textareaRef={zhRef}
              className="translation-textarea"
              value={translationZhText}
              onChange={(value) => setTranslationZhText(value)}
              placeholder="翻译原文（中文）。可以手动输入，也可以点击「使用草稿」把上方草稿填进来。"
              spellCheck={false}
              aria-label="中文翻译"
            />
          ) : (
            <WeightedPromptEditor
              value={translationZhText}
              onChange={setTranslationZhText}
              ariaLabel="中文翻译片段加权编辑"
            />
          )}
          <footer className="translation-box-foot">
            <span>{translationZhText.length} 个字符</span>
            <span className="meta-spacer" />
            {!translationZhText && lastTranslation?.side === 'translation' ? (
              <Button size="sm" variant="ghost" icon="refresh" onClick={() => restoreLast('translation')}>
                恢复上次译文
              </Button>
            ) : null}
            {preBackup?.side === 'translation' ? (
              <Button size="sm" variant="ghost" icon="undo" onClick={restorePre}>
                恢复翻译前
              </Button>
            ) : null}
          </footer>
        </section>

        <section className="translation-box">
          <header className="translation-box-head">
            <div className="translation-box-title">
              <span className="lang-mark lang-en">EN</span>
              英文
              {enLang === 'zh' && englishText.trim() ? (
                <span className="translation-box-note">当前是中文，待翻译</span>
              ) : null}
            </div>
            <div className="translation-box-actions">
              <Segmented
                size="sm"
                ariaLabel="英文编辑模式"
                value={englishMode}
                options={[
                  { value: 'text', label: '文本' },
                  { value: 'segments', label: '片段' },
                ]}
                onChange={(value) => setEnglishMode(value as BoxMode)}
              />
              <IconButton
                icon="copy"
                label="复制英文提示词"
                size="sm"
                onClick={() => void handleCopy(englishText, '英文提示词')}
              />
              <IconButton
                icon="trash"
                label="清空英文提示词"
                size="sm"
                onClick={handleClearEnglish}
                disabled={!englishText}
              />
            </div>
          </header>

          {englishMode === 'text' ? (
            <AtMentionTextarea
              textareaRef={enRef}
              className="translation-textarea translation-textarea-en"
              value={englishText}
              onChange={(value) => setEnglishText(value)}
              placeholder="英文提示词。可以直接编辑，也可以先在左侧中文框写内容，再用上方「翻译」生成。"
              spellCheck={false}
              aria-label="英文提示词"
            />
          ) : (
            <WeightedPromptEditor
              value={englishText}
              onChange={setEnglishText}
              ariaLabel="英文提示词片段加权编辑"
            />
          )}

          <footer className="translation-box-foot">
            <span>{englishText.length} 个字符</span>
            <span className="footnote-note">片段模式可点单词/单句加权 ( ) 或降权 [ ]</span>
            <span className="meta-spacer" />
            {!englishText && lastTranslation?.side === 'english' ? (
              <Button size="sm" variant="ghost" icon="refresh" onClick={() => restoreLast('english')}>
                恢复上次译文
              </Button>
            ) : null}
            {preBackup?.side === 'english' ? (
              <Button size="sm" variant="ghost" icon="undo" onClick={restorePre}>
                恢复翻译前
              </Button>
            ) : null}
          </footer>
        </section>
      </div>

      {alignmentVisible ? (
        <AlignedPairs
          alignment={alignment}
          zhText={translationZhText}
          enText={englishText}
          zhRef={zhRef}
          enRef={enRef}
          zhSelectable={zhMode === 'text'}
          enSelectable={englishMode === 'text'}
        />
      ) : null}

      <section className="negative-panel">
        <header className="negative-panel-head">
          <div className="negative-title">
            <Icon name="minus" size={15} />
            负面提示词
            <Badge tone="neutral">中 / 英</Badge>
            <Badge tone="neutral">随成品保存</Badge>
          </div>
          <div className="negative-buttons">
            <Button
              size="sm"
              variant="soft"
              icon="copy"
              disabled={!englishText.trim() && !translationZhText.trim()}
              onClick={copyPositiveToNegative}
              title="把正向的中文和英文各复制一份作为负面提示词"
            >
              复制正向翻译
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              disabled={!negativeText && !negativeZhText}
              onClick={() =>
                confirmAction({
                  title: '清空全部负面提示词？',
                  message: '负面中文和负面英文都会清空，可以用撤销恢复。',
                  confirmLabel: '清空全部',
                  danger: true,
                  onConfirm: () => clearNegative(),
                })
              }
            >
              清空全部
            </Button>
          </div>
        </header>
        <p className="negative-hint">
          负面提示词也有中文 / 英文两个框。可一键复制正向翻译，再按需修改；成品、历史快照和备份都会包含负面提示词。
        </p>

        <div className="negative-grid">
          <div className="negative-box">
            <header className="negative-box-head">
              <span className="negative-box-title">
                <span className="lang-mark lang-zh">中</span>
                中文
              </span>
              <span className="negative-box-actions">
                <IconButton
                  icon="copy"
                  label="复制负面中文"
                  size="sm"
                  disabled={!negativeZhText}
                  onClick={() => void handleCopy(negativeZhText, '负面中文')}
                />
                <IconButton
                  icon="trash"
                  label="清空负面中文"
                  size="sm"
                  disabled={!negativeZhText}
                  onClick={() =>
                    confirmAction({
                      title: '清空负面中文？',
                      message: '负面英文不会受影响。',
                      confirmLabel: '清空中文',
                      onConfirm: () => setNegativeZhText(''),
                    })
                  }
                />
              </span>
            </header>
            <AtMentionTextarea
              className="editor-textarea negative-textarea"
              value={negativeZhText}
              onChange={(value) => setNegativeZhText(value)}
              placeholder="负面提示词中文，例如：低清晰度、模糊、多余手指、水印"
              spellCheck={false}
              aria-label="负面中文"
            />
            <div className="negative-box-foot">{negativeZhText.length} 个字符</div>
          </div>

          <div className="negative-box">
            <header className="negative-box-head">
              <span className="negative-box-title">
                <span className="lang-mark lang-en">EN</span>
                英文
              </span>
              <span className="negative-box-actions">
                <IconButton
                  icon="copy"
                  label="复制负面英文"
                  size="sm"
                  disabled={!negativeText}
                  onClick={() => void handleCopy(negativeText, '负面英文')}
                />
                <IconButton
                  icon="trash"
                  label="清空负面英文"
                  size="sm"
                  disabled={!negativeText}
                  onClick={() =>
                    confirmAction({
                      title: '清空负面英文？',
                      message: '负面中文不会受影响。',
                      confirmLabel: '清空英文',
                      onConfirm: () => setNegativeText(''),
                    })
                  }
                />
              </span>
            </header>
            <AtMentionTextarea
              className="editor-textarea negative-textarea"
              value={negativeText}
              onChange={(value) => setNegativeText(value)}
              placeholder="lowres, bad anatomy, bad hands, extra fingers, watermark, text"
              spellCheck={false}
              aria-label="负面英文"
            />
            <div className="negative-box-foot">{negativeText.length} 个字符</div>
          </div>
        </div>

        <div className="negative-actions">
          <span className="meta-text">中文只作参考，英文负面会进入成品。</span>
          <div className="negative-buttons">
            <Button
              size="sm"
              variant="ghost"
              icon="translate"
              disabled={!negativeZhText.trim() || negativeBusy}
              loading={negativeBusy}
              onClick={() => void translateNegative('zh-en')}
            >
              中→英
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="translate"
              disabled={!negativeText.trim() || negativeBusy}
              onClick={() => void translateNegative('en-zh')}
            >
              英→中
            </Button>
          </div>
        </div>
      </section>
    </Card>
  );
}
