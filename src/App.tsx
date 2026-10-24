import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { useAutosave, useShortcuts, useTheme } from './hooks/useAppEffects';
import { TopToolbar } from './components/TopToolbar';
import { ServiceBanner } from './components/ServiceBanner';
import { Onboarding } from './components/Onboarding';
import { DraftPanel } from './components/DraftPanel';
import { TranslateBar } from './components/TranslateBar';
import { TranslationPanel } from './components/TranslationPanel';
import { ProductsPanel } from './components/ProductsPanel';
import { ActiveLorasPanel, OutputQuickPanel, PrivacyCard } from './components/ActiveLorasPanel';
import { QuickTranslateCard } from './components/QuickTranslateCard';
import { HistoryModal } from './components/HistoryModal';
import { LoraLibraryModal } from './components/LoraLibraryModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { CompareModal } from './components/CompareModal';
import { ProductEditModal } from './components/ProductEditModal';
import { WorkflowExportModal } from './components/WorkflowExportModal';
import { TranslateDirectionModal } from './components/TranslateDirectionModal';
import { ToastViewport } from './components/ui/Toast';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { Button } from './components/ui/primitives';
import { Icon } from './components/ui/Icon';

function LoadingScreen() {
  return (
    <div className="loading-screen" aria-live="polite">
      <div className="loading-card">
        <span className="loading-mark">
          <Icon name="wand" size={22} />
        </span>
        <div>
          <div className="loading-title">正在读取本地数据…</div>
          <div className="loading-sub">Prompt Studio 仅在本浏览器中保存你的内容。</div>
        </div>
        <span className="spinner" aria-hidden />
      </div>
    </div>
  );
}

function Modals() {
  const modal = useAppStore((state) => state.modal);
  const closeModal = useAppStore((state) => state.closeModal);

  switch (modal.type) {
    case 'history':
      return <HistoryModal onClose={closeModal} />;
    case 'lora-library':
      return <LoraLibraryModal onClose={closeModal} />;
    case 'settings':
      return <SettingsModal section={modal.section ?? 'general'} onClose={closeModal} />;
    case 'compare':
      return <CompareModal leftId={modal.leftId} rightId={modal.rightId} onClose={closeModal} />;
    case 'product-edit':
      return <ProductEditModal productId={modal.productId} onClose={closeModal} />;
    case 'workflow-export':
      return <WorkflowExportModal productId={modal.productId} onClose={closeModal} />;
    case 'translate-direction':
      return <TranslateDirectionModal onClose={closeModal} />;
    default:
      return null;
  }
}

export default function App() {
  const hydrate = useAppStore((state) => state.hydrate);
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrateError = useAppStore((state) => state.hydrateError);
  const toast = useAppStore((state) => state.toast);
  const openModal = useAppStore((state) => state.openModal);
  const serverConfig = useAppStore((state) => state.serverConfig);

  useTheme();
  useAutosave();
  useShortcuts();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="app-shell">
      <TopToolbar />
      <ServiceBanner />

      <main className="app-main">
        <Onboarding />

        {hydrateError ? (
          <div className="hydration-error">
            <Icon name="alert" size={20} />
            <div>
              <strong>无法读取本地数据</strong>
              <p>{hydrateError}</p>
              <p className="hydration-hint">
                可能是浏览器禁用了本地存储（无痕模式或隐私设置）。你仍然可以编辑，但刷新后内容可能丢失。
              </p>
            </div>
            <div className="hydration-actions">
              <Button
                variant="secondary"
                icon="refresh"
                onClick={() => window.location.reload()}
              >
                重新加载
              </Button>
              <Button variant="ghost" onClick={() => toast('已忽略存储错误，继续编辑。', 'warning')}>
                继续编辑
              </Button>
            </div>
          </div>
        ) : null}

        {!hydrated ? (
          <LoadingScreen />
        ) : (
          <div className="workspace-grid">
            <div className="editor-column">
              <DraftPanel />
              <TranslateBar />
              <TranslationPanel />
              <ProductsPanel />
            </div>
            <aside className="side-column" aria-label="辅助面板">
              <ActiveLorasPanel />
              <QuickTranslateCard />
              <OutputQuickPanel />
              <PrivacyCard />
            </aside>
          </div>
        )}

        <div className="footer-note">
          <span>
            Prompt Studio · v1.2.0 · 数据保存在本地
            {serverConfig ? ` · 翻译：${serverConfig.isMock ? '模拟模式' : serverConfig.label}` : ''}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => openModal({ type: 'settings', section: 'about' })}
          >
            隐私与说明
          </button>
        </div>
      </main>

      <Modals />
      <ToastViewport />
      <ConfirmDialog />
    </div>
  );
}
