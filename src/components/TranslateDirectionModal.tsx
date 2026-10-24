import { useAppStore } from '../store/appStore';
import type { Direction } from '../domain/types';
import { Modal } from './ui/Modal';
import { Button } from './ui/primitives';
import { Icon } from './ui/Icon';

function preview(text: string, length = 120): string {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return '（空）';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function TranslateDirectionModal({ onClose }: { onClose: () => void }) {
  const translationZhText = useAppStore((state) => state.workspace.translationZhText);
  const englishText = useAppStore((state) => state.workspace.englishText);
  const runTranslation = useAppStore((state) => state.runTranslation);

  const choose = (direction: Direction) => {
    void runTranslation(direction);
  };

  return (
    <Modal
      title="选择翻译方向"
      subtitle="中文翻译框与英文框都有内容。为避免覆盖你的编辑，请明确选择方向。被替换的内容会保留，可随时恢复。"
      onClose={onClose}
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
      }
    >
      <div className="direction-options">
        <button type="button" className="direction-option" onClick={() => choose('zh-en')} autoFocus>
          <span className="direction-option-head">
            <span className="direction-option-title">
              <Icon name="translate" size={18} /> 中文 → 英文
            </span>
            <span className="direction-option-badge">替换英文框</span>
          </span>
          <span className="direction-source">
            <span className="direction-lang">中文翻译框</span>
            {preview(translationZhText)}
          </span>
          <span className="direction-arrow">
            <Icon name="arrow-down" size={14} />
            将生成新的英文提示词，覆盖当前英文框（可恢复）
          </span>
        </button>

        <button type="button" className="direction-option" onClick={() => choose('en-zh')}>
          <span className="direction-option-head">
            <span className="direction-option-title">
              <Icon name="translate" size={18} /> 英文 → 中文
            </span>
            <span className="direction-option-badge">替换中文翻译框</span>
          </span>
          <span className="direction-source">
            <span className="direction-lang">英文框</span>
            {preview(englishText)}
          </span>
          <span className="direction-arrow">
            <Icon name="arrow-down" size={14} />
            将生成新的中文翻译原文，覆盖当前中文翻译框（可恢复）
          </span>
        </button>
      </div>
    </Modal>
  );
}
