import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import { Button, Segmented } from './ui/primitives';

export function TranslateBar() {
  const draftText = useAppStore((state) => state.workspace.draftText);
  const englishText = useAppStore((state) => state.workspace.englishText);
  const mode = useAppStore((state) => state.settings.translateMode);
  const setMode = useAppStore((state) => state.setTranslateMode);
  const requestTranslate = useAppStore((state) => state.requestTranslate);
  const translateBusy = useAppStore((state) => state.translateBusy);
  const serverConfig = useAppStore((state) => state.serverConfig);
  const openModal = useAppStore((state) => state.openModal);
  const preBackup = useAppStore((state) => state.preTranslateBackup);
  const restorePre = useAppStore((state) => state.restorePreTranslation);

  const hasDraft = draftText.trim().length > 0;
  const hasEnglish = englishText.trim().length > 0;
  const both = hasDraft && hasEnglish;

  const directionLabel = both
    ? '两侧都有内容 · 翻译前会询问方向'
    : hasDraft
      ? '中文 → 英文'
      : hasEnglish
        ? '英文 → 中文'
        : '等待输入';

  return (
    <section className={`translate-bar ${translateBusy ? 'is-busy' : ''}`} aria-label="翻译操作">
      <div className="translate-bar-main">
        <span className="translate-mark">
          <Icon name="translate" size={20} />
        </span>
        <div className="translate-copy">
          <div className="translate-title">
            翻译 / 同步翻译
            <span className="translate-direction-pill">{directionLabel}</span>
          </div>
          <div className="translate-sub">
            {both
              ? '不会盲目覆盖：请选择中文→英文或英文→中文，翻译前的内容可以恢复。'
              : '自动识别语言并选择方向；翻译失败不会丢失原文。'}
            {serverConfig ? (
              <button
                type="button"
                className="translate-provider"
                onClick={() => openModal({ type: 'settings', section: 'translate' })}
                title="打开翻译服务设置"
              >
                {serverConfig.isMock ? '模拟翻译' : serverConfig.label}
              </button>
            ) : null}
          </div>
        </div>

        <div className="translate-mode">
          <Segmented
            size="sm"
            value={mode}
            ariaLabel="翻译模式"
            onChange={setMode}
            options={[
              { value: 'faithful', label: '忠实翻译', title: '忠于原意，不添加原文没有的内容' },
              { value: 'natural', label: '自然描述', title: '允许更自然的英文句子，但不改变原意' },
            ]}
          />
        </div>

        <div className="translate-actions">
          <div className="direction-buttons">
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasDraft || translateBusy}
              onClick={() => requestTranslate('zh-en')}
              title="把中文草稿翻译成英文"
            >
              中→英
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasEnglish || translateBusy}
              onClick={() => requestTranslate('en-zh')}
              title="把英文提示词翻译回中文"
            >
              英→中
            </Button>
          </div>
          <Button
            variant="primary"
            icon="translate"
            loading={translateBusy}
            onClick={() => requestTranslate()}
            disabled={!hasDraft && !hasEnglish}
            title="翻译（Ctrl/Cmd + Enter）"
          >
            {translateBusy ? '翻译中…' : both ? '选择方向翻译' : '翻译'}
          </Button>
          <button
            type="button"
            className="icon-btn btn-ghost icon-btn-sm"
            onClick={() => openModal({ type: 'settings', section: 'translate' })}
            title="翻译服务设置"
            aria-label="翻译服务设置"
          >
            <Icon name="settings" size={16} />
          </button>
        </div>
      </div>

      {preBackup ? (
        <div className="translate-undo-row">
          <Icon name="undo" size={14} />
          翻译前的内容已保留。
          <button type="button" className="link-button" onClick={restorePre}>
            恢复翻译前内容
          </button>
        </div>
      ) : null}
    </section>
  );
}
