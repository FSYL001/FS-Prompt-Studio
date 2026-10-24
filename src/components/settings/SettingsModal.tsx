import { useEffect, useState } from 'react';
import type { SettingsSection } from '../../store/appStore';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/primitives';
import { Icon, type IconName } from '../ui/Icon';
import { GeneralSettings } from './GeneralSettings';
import { TranslateSettings } from './TranslateSettings';
import { DictionarySettings } from './DictionarySettings';
import { WorkflowSettings } from './WorkflowSettings';
import { DataSettings } from './DataSettings';
import { AboutSettings } from './AboutSettings';

const TABS: Array<{ id: SettingsSection; label: string; icon: IconName }> = [
  { id: 'general', label: '常规与输出', icon: 'settings' },
  { id: 'translate', label: '翻译服务', icon: 'translate' },
  { id: 'dictionary', label: '自定义词典', icon: 'edit' },
  { id: 'workflow', label: 'ComfyUI 工作流', icon: 'workflow' },
  { id: 'data', label: '数据与备份', icon: 'database' },
  { id: 'about', label: '关于', icon: 'info' },
];

function renderSection(section: SettingsSection) {
  switch (section) {
    case 'translate':
      return <TranslateSettings />;
    case 'dictionary':
      return <DictionarySettings />;
    case 'workflow':
      return <WorkflowSettings />;
    case 'data':
      return <DataSettings />;
    case 'about':
      return <AboutSettings />;
    default:
      return <GeneralSettings />;
  }
}

export function SettingsModal({
  section = 'general',
  onClose,
}: {
  section?: SettingsSection;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsSection>(section);
  const hydrated = useAppStore((state) => state.hydrated);

  useEffect(() => {
    setTab(section);
  }, [section]);

  return (
    <Modal
      title="设置"
      subtitle="常规设置会自动保存；翻译 API Key 需要点击保存后写入服务端。"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <span className="modal-footer-note">
            数据默认仅保存在本浏览器 · 输入 / 输出均按纯文本处理
          </span>
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        </>
      }
    >
      {!hydrated ? (
        <p className="settings-note">正在读取本地设置…</p>
      ) : (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="设置分类">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item ${tab === item.id ? 'is-active' : ''}`}
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="settings-content" key={tab}>
            {renderSection(tab)}
          </div>
        </div>
      )}
    </Modal>
  );
}
