import { useEffect, useState } from 'react';
import { formatTime } from '../domain/id';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import { Button, IconButton } from './ui/primitives';

function StatusPill() {
  const status = useAppStore((state) => state.status);
  const lastSavedAt = useAppStore((state) => state.lastSavedAt);

  let label = '本地编辑';
  let tone = 'idle';
  if (status.kind === 'saving') {
    label = '保存中…';
    tone = 'busy';
  } else if (status.kind === 'saved') {
    label = `已保存${status.at ? ` · ${formatTime(status.at)}` : ''}`;
    tone = 'saved';
  } else if (status.kind === 'translating') {
    label = '翻译中…';
    tone = 'busy';
  } else if (status.kind === 'error') {
    label = '保存失败';
    tone = 'error';
  } else if (lastSavedAt) {
    label = '已保存';
    tone = 'saved';
  }

  return (
    <span className={`status-pill status-${tone}`} role="status" title={status.message ?? label}>
      {tone === 'busy' ? <span className="spinner spinner-sm" aria-hidden /> : <span className="status-dot" />}
      {label}
    </span>
  );
}

export function TopToolbar() {
  const newPrompt = useAppStore((state) => state.newPrompt);
  const saveNow = useAppStore((state) => state.saveNow);
  const openModal = useAppStore((state) => state.openModal);
  const theme = useAppStore((state) => state.settings.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const activeLoras = useAppStore((state) => state.workspace.activeLoras.length);
  const generationUrl = useAppStore((state) => state.settings.generationUrl);
  const toast = useAppStore((state) => state.toast);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = () => setSystemDark(media.matches);
    media.addEventListener('change', handle);
    return () => media.removeEventListener('change', handle);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  const openGenerationStudio = () => {
    const raw = (generationUrl || '').trim() || 'http://127.0.0.1:8188/';
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      toast('生图地址格式不正确，请在设置中填写完整的 http:// 或 https:// 地址。', 'error');
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      toast('生图地址只支持 http:// 或 https://。', 'error');
      return;
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="/" aria-label="FS-Prompt Studio 首页">
          <span className="brand-mark" aria-hidden>
            <img className="brand-icon" src="/logo-mark.svg" alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-name">FS-Prompt Studio</span>
            <span className="brand-sub">AI 生图提示词编辑器</span>
          </span>
        </a>

        <nav className="toolbar-actions" aria-label="主要操作">
          <Button
            variant="ghost"
            icon="plus"
            className="toolbar-btn"
            onClick={() => void newPrompt()}
            title="新建提示词（当前内容会备份到历史记录）"
          >
            新建
          </Button>
          <Button
            variant="ghost"
            icon="save"
            className="toolbar-btn"
            onClick={() => void saveNow()}
            title="保存当前草稿（Ctrl/Cmd + S）"
          >
            保存
          </Button>
          <Button
            variant="ghost"
            icon="history"
            className="toolbar-btn"
            onClick={() => openModal({ type: 'history' })}
          >
            历史
          </Button>
          <Button
            variant="ghost"
            icon="layers"
            className="toolbar-btn"
            onClick={() => openModal({ type: 'lora-library' })}
          >
            LoRA
            {activeLoras > 0 ? <span className="nav-count">{activeLoras}</span> : null}
          </Button>
          <Button
            variant="soft"
            icon="external"
            className="toolbar-btn studio-btn"
            onClick={openGenerationStudio}
            title={`前往生图：${generationUrl || 'http://127.0.0.1:8188/'}`}
          >
            <span className="studio-full">前往生图</span>
            <span className="studio-short">生图</span>
          </Button>
          <Button
            variant="ghost"
            icon="settings"
            className="toolbar-btn"
            onClick={() => openModal({ type: 'settings' })}
          >
            设置
          </Button>
        </nav>

        <div className="topbar-right">
          <StatusPill />
          <IconButton
            icon={isDark ? 'sun' : 'moon'}
            label={isDark ? '切换到浅色主题' : '切换到深色主题'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          />
          <IconButton
            icon="info"
            label="关于与隐私"
            onClick={() => openModal({ type: 'settings', section: 'about' })}
            className="toolbar-about"
          />
          <span className="sr-only">当前主题：{theme}</span>
        </div>
      </div>
    </header>
  );
}
