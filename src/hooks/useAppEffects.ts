import { useEffect } from 'react';
import { nowIso } from '../domain/id';
import { saveWorkspaceRecord } from '../db/repositories';
import { useAppStore } from '../store/appStore';

/** 草稿自动保存：与成品生成、历史快照是相互独立的数据行为。 */
export function useAutosave() {
  const hydrated = useAppStore((state) => state.hydrated);
  const draftText = useAppStore((state) => state.workspace.draftText);
  const englishText = useAppStore((state) => state.workspace.englishText);
  const negativeText = useAppStore((state) => state.workspace.negativeText);
  const alignment = useAppStore((state) => state.workspace.alignment);
  const segments = useAppStore((state) => state.workspace.segments);
  const segmentsMode = useAppStore((state) => state.workspace.segmentsMode);
  const activeLoras = useAppStore((state) => state.workspace.activeLoras);
  const params = useAppStore((state) => state.workspace.params);
  const presetId = useAppStore((state) => state.workspace.presetId);
  const notes = useAppStore((state) => state.workspace.notes);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    useAppStore.getState().markSaving();
    const timer = setTimeout(() => {
      const state = useAppStore.getState();
      const at = nowIso();
      saveWorkspaceRecord({ ...state.workspace, updatedAt: at })
        .then(() => {
          if (!cancelled) useAppStore.getState().markSaved(at);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            useAppStore.getState().markSaveError(error instanceof Error ? error.message : '未知错误');
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hydrated, draftText, englishText, negativeText, alignment, segments, segmentsMode, activeLoras, params, presetId, notes]);

  // 页面隐藏 / 刷新前再尝试落盘一次，减少“最后 400ms 编辑丢失”的窗口。
  useEffect(() => {
    if (!hydrated) return;
    const flush = () => {
      const state = useAppStore.getState();
      if (!state.hydrated) return;
      try {
        void saveWorkspaceRecord({ ...state.workspace, updatedAt: nowIso() });
      } catch {
        /* 页面卸载阶段无法提示，忽略 */
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [hydrated]);
}

/** 主题应用：浅色 / 深色 / 跟随系统。 */
export function useTheme() {
  const theme = useAppStore((state) => state.settings.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#16151a' : '#f6f5f2');
      try {
        localStorage.setItem('prompt-studio-theme', resolved);
      } catch {
        /* ignore */
      }
    };
    apply();
    const handleChange = () => {
      if (theme === 'system') apply();
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [theme]);
}

/** 全局快捷键：Ctrl/Cmd+S 保存，Ctrl/Cmd+Enter 翻译。 */
export function useShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void useAppStore.getState().saveNow();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        useAppStore.getState().requestTranslate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
