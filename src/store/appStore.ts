import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE,
  type Alignment,
  type DictionaryEntry,
  type Direction,
  type HistoryEntry,
  type Lora,
  type OutputConfig,
  type PresetId,
  type Product,
  type ProductLora,
  type PromptParams,
  type PromptSegment,
  type Settings,
  type TranslateMode,
  type Workspace,
  type WorkspaceSnapshot,
  type WorkflowTemplate,
} from '../domain/types';
import { newId, nowIso } from '../domain/id';
import { collectLoraTerms } from '../domain/loraTerms';
import { hasCJK, splitPromptSegments } from '../domain/promptParse';
import { composeFromSegments } from '../domain/promptParse';
import { assemblePrompts, createProduct } from '../domain/product';
import { applyPreset } from '../domain/presets';
import {
  applyBackup,
  buildBackup,
  clearLocalData,
  deleteHistoryRecords,
  deleteLoraRecord,
  deleteProductRecord,
  loadLocalData,
  parseBackupText,
  saveHistoryRecord,
  saveLoraRecord,
  saveProductRecord,
  saveSettingsRecord,
  saveWorkspaceRecord,
  type LocalData,
} from '../db/repositories';
import { ApiError, fetchTranslateConfig, type PublicTranslateConfig } from '../services/translateApi';
import { translatePromptText, translateSingleText } from '../services/translation';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export type EditorStatusKind = 'idle' | 'saving' | 'saved' | 'translating' | 'error';

export interface EditorStatus {
  kind: EditorStatusKind;
  message?: string;
  at?: string;
}

export interface TranslateErrorInfo {
  message: string;
  hint?: string;
  code?: string;
  direction?: Direction;
}

export interface PreTranslateBackup {
  side: 'translation' | 'english';
  text: string;
  alignment: Alignment | null;
  at: string;
}

export interface LastTranslation {
  side: 'translation' | 'english';
  text: string;
  alignment: Alignment | null;
  at: string;
}

export type SettingsSection = 'general' | 'translate' | 'dictionary' | 'workflow' | 'data' | 'about';

export type ModalState =
  | { type: null }
  | { type: 'history' }
  | { type: 'lora-library' }
  | { type: 'settings'; section?: SettingsSection }
  | { type: 'compare'; leftId: string; rightId: string }
  | { type: 'product-edit'; productId: string }
  | { type: 'lora-edit'; loraId: string | null }
  | { type: 'workflow-export'; productId: string }
  | { type: 'translate-direction' };

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface ConfirmState extends ConfirmOptions {
  id: string;
}

export interface EditorSnapshot {
  draftText: string;
  translationZhText: string;
  englishText: string;
  negativeText: string;
  alignment: Alignment | null;
  segments: PromptSegment[];
  segmentsMode: boolean;
}

export interface AppState {
  hydrated: boolean;
  hydrating: boolean;
  hydrateError: string | null;

  settings: Settings;
  workspace: Workspace;
  loras: Lora[];
  products: Product[];
  history: HistoryEntry[];

  status: EditorStatus;
  lastSavedAt: string | null;
  translateBusy: boolean;
  translateError: TranslateErrorInfo | null;
  preTranslateBackup: PreTranslateBackup | null;
  lastTranslation: LastTranslation | null;
  segmentBusyId: string | null;
  generating: boolean;

  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];

  alignmentVisible: boolean;

  toasts: ToastItem[];
  modal: ModalState;
  confirmState: ConfirmState | null;

  serverConfig: PublicTranslateConfig | null;
  serverConfigError: string | null;

  hydrate: () => Promise<void>;
  refreshServerConfig: (notify?: boolean) => Promise<void>;
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  confirmAction: (options: ConfirmOptions) => void;
  runConfirm: () => Promise<void>;
  cancelConfirm: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  setTheme: (theme: Settings['theme']) => void;
  updateOutputConfig: (patch: Partial<OutputConfig>) => void;
  choosePreset: (presetId: PresetId) => void;
  toggleAdvanced: () => void;
  completeOnboarding: () => void;
  setTranslateMode: (mode: TranslateMode) => void;
  addDictionaryEntry: (entry: DictionaryEntry) => void;
  updateDictionaryEntry: (index: number, entry: DictionaryEntry) => void;
  removeDictionaryEntry: (index: number) => void;
  saveWorkflow: (workflow: WorkflowTemplate) => void;
  removeWorkflow: (id: string) => void;
  setActiveWorkflow: (id: string | null) => void;

  setDraftText: (text: string) => void;
  setTranslationZhText: (text: string) => void;
  setEnglishText: (text: string) => void;
  setNegativeText: (text: string) => void;
  setNotes: (text: string) => void;
  setParams: (patch: Partial<PromptParams>) => void;
  clearDraft: () => void;
  clearTranslationZh: () => void;
  clearEnglish: () => void;
  clearNegative: () => void;
  useDraftForTranslation: () => void;
  undo: () => void;
  redo: () => void;
  toggleAlignment: () => void;

  requestTranslate: (direction?: Direction) => void;
  runTranslation: (direction: Direction) => Promise<void>;
  restorePreTranslation: () => void;
  restoreLastTranslation: (side: 'translation' | 'english') => void;
  dismissTranslateError: () => void;

  enterSegmentsMode: () => void;
  exitSegmentsMode: () => void;
  refreshSegmentsFromEnglish: () => void;
  syncSegmentsToEnglish: () => void;
  setSegmentText: (id: string, text: string) => void;
  setSegmentTranslation: (id: string, text: string) => void;
  setSegmentWeight: (id: string, weight: number | null) => void;
  setSegmentPolarity: (id: string, polarity: 'positive' | 'negative') => void;
  toggleSegmentLock: (id: string) => void;
  addSegment: (text?: string) => void;
  deleteSegment: (id: string) => void;
  duplicateSegment: (id: string) => void;
  moveSegment: (from: number, to: number) => void;
  translateSegment: (id: string) => Promise<void>;
  translateAllSegments: () => Promise<void>;
  clearSegments: () => void;

  saveLora: (lora: Lora) => Promise<void>;
  deleteLora: (id: string) => Promise<void>;
  toggleLoraFavorite: (id: string) => void;
  setLoraEnabled: (id: string, enabled: boolean) => void;
  addActiveLora: (loraId: string) => void;
  removeActiveLora: (index: number) => void;
  updateActiveLora: (index: number, patch: Partial<ProductLora>) => void;
  moveActiveLora: (from: number, to: number) => void;
  resetActiveLoraWeight: (index: number) => void;
  toggleActiveLora: (index: number) => void;

  generateProduct: (name?: string) => Promise<Product | null>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  toggleProductFavorite: (id: string) => void;
  renameProduct: (id: string, name: string) => Promise<void>;
  reloadProduct: (id: string) => Promise<void>;

  createHistorySnapshot: (type?: 'draft' | 'manual', name?: string) => Promise<HistoryEntry | null>;
  restoreHistory: (id: string) => Promise<void>;
  deleteHistory: (ids: string[]) => Promise<void>;
  toggleHistoryFavorite: (id: string) => void;
  clearHistory: () => Promise<void>;
  openCompare: (leftId: string, rightId: string) => void;

  saveNow: () => Promise<void>;
  newPrompt: () => Promise<void>;
  exportBackupJson: () => string;
  importBackupText: (raw: string, mode: 'replace' | 'merge') => Promise<void>;
  clearAllData: () => Promise<void>;

  markSaving: () => void;
  markSaved: (at: string) => void;
  markSaveError: (message: string) => void;
}

let lastUndoAt = 0;

function snapshotEditor(workspace: Workspace): EditorSnapshot {
  return {
    draftText: workspace.draftText,
    translationZhText: workspace.translationZhText,
    englishText: workspace.englishText,
    negativeText: workspace.negativeText,
    alignment: workspace.alignment,
    segments: workspace.segments.map((segment) => ({ ...segment })),
    segmentsMode: workspace.segmentsMode,
  };
}

function withUndo(state: AppState, force = false): Partial<AppState> {
  const now = Date.now();
  if (!force && now - lastUndoAt < 700) return {};
  lastUndoAt = now;
  return {
    undoStack: [...state.undoStack.slice(-49), snapshotEditor(state.workspace)],
    redoStack: [],
  };
}

function snapshotWorkspace(workspace: Workspace): WorkspaceSnapshot {
  return {
    draftText: workspace.draftText,
    translationZhText: workspace.translationZhText,
    englishText: workspace.englishText,
    negativeText: workspace.negativeText,
    alignment: workspace.alignment,
    segments: workspace.segments.map((segment) => ({ ...segment })),
    activeLoras: workspace.activeLoras.map((lora) => ({ ...lora, triggerWords: [...lora.triggerWords] })),
    params: { ...workspace.params },
    presetId: workspace.presetId,
    notes: workspace.notes,
  };
}

function workspaceFromSnapshot(snapshot: WorkspaceSnapshot, current: Workspace): Workspace {
  return {
    ...current,
    draftText: snapshot.draftText,
    translationZhText: snapshot.translationZhText,
    englishText: snapshot.englishText,
    negativeText: snapshot.negativeText,
    alignment: snapshot.alignment,
    segments: snapshot.segments.map((segment) => ({ ...segment })),
    activeLoras: snapshot.activeLoras.map((lora) => ({ ...lora, triggerWords: [...lora.triggerWords] })),
    params: { ...snapshot.params },
    presetId: snapshot.presetId,
    notes: snapshot.notes,
    segmentsMode: snapshot.segments.length > 0 ? current.segmentsMode : false,
    updatedAt: nowIso(),
  };
}

function deriveSegments(english: string, existing: PromptSegment[] = []): PromptSegment[] {
  return splitPromptSegments(english).map((text, index) => {
    const matched = existing.find((segment) => segment.text === text);
    const fallback = existing[index];
    const source = matched ?? fallback;
    return {
      id: newId('seg'),
      text,
      translated: source && source.text === text ? source.translated : '',
      polarity: matched?.polarity ?? 'positive',
      locked: matched?.locked ?? false,
      weight: matched?.weight ?? null,
    };
  });
}

function addOrReplace<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [item, ...list];
  const next = [...list];
  next[index] = item;
  return next;
}

function pruneHistoryList(
  entries: HistoryEntry[],
  limit: number,
): { kept: HistoryEntry[]; removedIds: string[] } {
  const sorted = [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const favorites = sorted.filter((entry) => entry.favorite);
  const others = sorted.filter((entry) => !entry.favorite);
  const keepCount = Math.max(0, limit - favorites.length);
  const keepIds = new Set([...favorites, ...others.slice(0, keepCount)].map((entry) => entry.id));
  return {
    kept: sorted.filter((entry) => keepIds.has(entry.id)),
    removedIds: sorted.filter((entry) => !keepIds.has(entry.id)).map((entry) => entry.id),
  };
}

function buildHistoryEntry(
  type: HistoryEntry['type'],
  name: string,
  workspace: Workspace,
  options: { createdAt?: string; productId?: string | null; favorite?: boolean } = {},
): HistoryEntry {
  return {
    id: newId('history'),
    type,
    name: name.slice(0, 200),
    favorite: options.favorite ?? false,
    createdAt: options.createdAt ?? nowIso(),
    productId: options.productId ?? null,
    snapshot: snapshotWorkspace(workspace),
  };
}

function friendlyError(error: unknown): { message: string; hint?: string; code?: string } {
  if (error instanceof ApiError) {
    return { message: error.message, hint: error.hint, code: error.code };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: '发生未知错误，请重试。' };
}

export const useAppStore = create<AppState>()((set, get) => ({
  hydrated: false,
  hydrating: false,
  hydrateError: null,

  settings: { ...DEFAULT_SETTINGS },
  workspace: { ...DEFAULT_WORKSPACE },
  loras: [],
  products: [],
  history: [],

  status: { kind: 'idle' },
  lastSavedAt: null,
  translateBusy: false,
  translateError: null,
  preTranslateBackup: null,
  lastTranslation: null,
  segmentBusyId: null,
  generating: false,

  undoStack: [],
  redoStack: [],
  alignmentVisible: false,

  toasts: [],
  modal: { type: null },
  confirmState: null,

  serverConfig: null,
  serverConfigError: null,

  hydrate: async () => {
    if (get().hydrated || get().hydrating) return;
    set({ hydrating: true, hydrateError: null });
    try {
      const data = await loadLocalData();
      set({
        hydrated: true,
        hydrating: false,
        settings: data.settings,
        workspace: data.workspace,
        loras: data.loras,
        products: data.products,
        history: [...data.history].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        status: { kind: 'idle' },
      });
      void get().refreshServerConfig(false);
    } catch (error) {
      set({
        hydrating: false,
        hydrateError: error instanceof Error ? error.message : '读取本地数据失败。',
      });
    }
  },

  refreshServerConfig: async (notify = false) => {
    try {
      const config = await fetchTranslateConfig();
      set({ serverConfig: config, serverConfigError: null });
      if (notify) {
        get().toast(
          config.isMock
            ? '当前是模拟翻译模式，结果只用于界面测试。'
            : `翻译服务：${config.label}`,
          config.isMock ? 'warning' : 'success',
        );
      }
    } catch (error) {
      const { message } = friendlyError(error);
      set({ serverConfigError: message });
      if (notify) get().toast(message, 'error');
    }
  },

  toast: (message, tone = 'info') => {
    const existing = get().toasts.find((toast) => toast.message === message && toast.tone === tone);
    if (existing) return;
    const id = newId('toast');
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, tone }] }));
    const duration =
      tone === 'error' ? 8000 : tone === 'warning' ? 5500 : tone === 'success' ? 3000 : 4000;
    setTimeout(() => get().dismissToast(id), duration);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: { type: null } }),
  confirmAction: (options) =>
    set({ confirmState: { ...options, id: newId('confirm') } }),
  runConfirm: async () => {
    const confirmState = get().confirmState;
    if (!confirmState) return;
    set({ confirmState: null });
    try {
      await confirmState.onConfirm();
    } catch (error) {
      get().toast(friendlyError(error).message, 'error');
    }
  },
  cancelConfirm: () => set({ confirmState: null }),

  updateSettings: (patch) => {
    const settings: Settings = { ...get().settings, ...patch, updatedAt: nowIso() };
    set({ settings });
    void saveSettingsRecord(settings).catch((error) =>
      get().toast(`设置保存失败：${friendlyError(error).message}`, 'error'),
    );
  },
  setTheme: (theme) => {
    get().updateSettings({ theme });
  },
  updateOutputConfig: (patch) => {
    const settings = get().settings;
    get().updateSettings({ output: { ...settings.output, ...patch } });
  },
  choosePreset: (presetId) => {
    const state = get();
    const result = applyPreset(
      { presetId: state.workspace.presetId, output: state.settings.output, params: state.workspace.params },
      presetId,
    );
    const settings: Settings = {
      ...state.settings,
      presetId,
      output: result.output,
      updatedAt: nowIso(),
    };
    set({
      settings,
      workspace: { ...state.workspace, presetId, params: result.params, updatedAt: nowIso() },
    });
    void saveSettingsRecord(settings).catch(() => undefined);
    get().toast(`已切换输出预设：${presetId === 'custom' ? '自定义' : presetId.toUpperCase()}`, 'info');
  },
  toggleAdvanced: () => get().updateSettings({ advancedOpen: !get().settings.advancedOpen }),
  completeOnboarding: () => get().updateSettings({ onboardingSeen: true }),
  setTranslateMode: (mode) => get().updateSettings({ translateMode: mode }),
  addDictionaryEntry: (entry) => {
    const dictionary = [...get().settings.dictionary, entry];
    get().updateSettings({ dictionary });
  },
  updateDictionaryEntry: (index, entry) => {
    const dictionary = get().settings.dictionary.map((item, i) => (i === index ? entry : item));
    get().updateSettings({ dictionary });
  },
  removeDictionaryEntry: (index) => {
    const dictionary = get().settings.dictionary.filter((_, i) => i !== index);
    get().updateSettings({ dictionary });
  },
  saveWorkflow: (workflow) => {
    const workflows = addOrReplace(get().settings.workflows, workflow);
    get().updateSettings({ workflows, activeWorkflowId: workflow.id });
  },
  removeWorkflow: (id) => {
    const workflows = get().settings.workflows.filter((item) => item.id !== id);
    const activeWorkflowId =
      get().settings.activeWorkflowId === id ? (workflows[0]?.id ?? null) : get().settings.activeWorkflowId;
    get().updateSettings({ workflows, activeWorkflowId });
  },
  setActiveWorkflow: (id) => get().updateSettings({ activeWorkflowId: id }),

  setDraftText: (text) =>
    set((state) => ({
      ...withUndo(state),
      workspace: { ...state.workspace, draftText: text },
    })),
  setTranslationZhText: (text) =>
    set((state) => ({
      ...withUndo(state),
      workspace: { ...state.workspace, translationZhText: text },
    })),
  setEnglishText: (text) =>
    set((state) => ({
      ...withUndo(state),
      workspace: { ...state.workspace, englishText: text },
    })),
  setNegativeText: (text) =>
    set((state) => ({
      ...withUndo(state),
      workspace: { ...state.workspace, negativeText: text },
    })),
  setNotes: (text) => set((state) => ({ workspace: { ...state.workspace, notes: text } })),
  setParams: (patch) =>
    set((state) => ({ workspace: { ...state.workspace, params: { ...state.workspace.params, ...patch } } })),
  clearDraft: () =>
    set((state) => ({
      ...withUndo(state, true),
      workspace: { ...state.workspace, draftText: '' },
    })),
  clearTranslationZh: () =>
    set((state) => ({
      ...withUndo(state, true),
      workspace: { ...state.workspace, translationZhText: '', alignment: null },
      preTranslateBackup: null,
    })),
  clearEnglish: () =>
    set((state) => ({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        englishText: '',
        alignment: null,
        segments: [],
      },
      preTranslateBackup: null,
    })),
  clearNegative: () =>
    set((state) => ({ ...withUndo(state, true), workspace: { ...state.workspace, negativeText: '' } })),
  useDraftForTranslation: () => {
    const state = get();
    if (!state.workspace.draftText.trim()) {
      get().toast('草稿是空的，没有内容可以填入。', 'info');
      return;
    }
    set({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        translationZhText: state.workspace.draftText,
        updatedAt: nowIso(),
      },
    });
    get().toast('已把草稿填入翻译中文框，可以直接翻译。', 'success');
  },
  undo: () =>
    set((state) => {
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) return {};
      lastUndoAt = Date.now();
      return {
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack.slice(-49), snapshotEditor(state.workspace)],
        workspace: { ...state.workspace, ...previous },
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next) return {};
      lastUndoAt = Date.now();
      return {
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack.slice(-49), snapshotEditor(state.workspace)],
        workspace: { ...state.workspace, ...next },
      };
    }),
  toggleAlignment: () => set((state) => ({ alignmentVisible: !state.alignmentVisible })),

  requestTranslate: (direction) => {
    const state = get();
    if (state.translateBusy) return;
    let translation = state.workspace.translationZhText.trim();
    const english = state.workspace.englishText.trim();
    const draft = state.workspace.draftText.trim();
    if (!translation && !english) {
      if (!draft) {
        get().toast('请先在草稿或翻译框中输入内容。', 'warning');
        return;
      }
      set({
        workspace: { ...state.workspace, translationZhText: state.workspace.draftText, updatedAt: nowIso() },
      });
      translation = draft;
    }

    if (direction) {
      if (direction === 'zh-en' && !translation && draft) {
        set({
          workspace: { ...state.workspace, translationZhText: state.workspace.draftText, updatedAt: nowIso() },
        });
        translation = draft;
      }
      const source = direction === 'zh-en' ? translation : english;
      const target = direction === 'zh-en' ? english : translation;
      if (!source) {
        get().toast(
          direction === 'zh-en'
            ? '翻译中文框是空的，没有可翻译的中文。可以先点「使用草稿」。'
            : '英文框是空的，没有可翻译的英文。',
          'warning',
        );
        return;
      }
      if (target) {
        get().confirmAction({
          title: '替换现有内容？',
          message:
            direction === 'zh-en'
              ? '翻译将覆盖当前英文框。翻译前的内容会保留，可以随时恢复。'
              : '翻译将覆盖当前中文翻译框。翻译前的内容会保留，可以随时恢复。',
          confirmLabel: '翻译并替换',
          onConfirm: () => get().runTranslation(direction),
        });
        return;
      }
      void get().runTranslation(direction);
      return;
    }

    if (translation && english) {
      set({ modal: { type: 'translate-direction' } });
      return;
    }
    void get().runTranslation(translation ? 'zh-en' : 'en-zh');
  },

  runTranslation: async (direction) => {
    const state = get();
    if (state.translateBusy) return;
    const { workspace, settings } = state;
    const sourceText = direction === 'zh-en' ? workspace.translationZhText : workspace.englishText;
    if (!sourceText.trim()) {
      get().toast('没有可翻译的内容。', 'warning');
      return;
    }
    const targetSide: 'translation' | 'english' = direction === 'zh-en' ? 'english' : 'translation';
    const previousTargetText =
      direction === 'zh-en' ? workspace.englishText : workspace.translationZhText;
    const backup: PreTranslateBackup | null = previousTargetText.trim()
      ? {
          side: targetSide,
          text: previousTargetText,
          alignment: workspace.alignment,
          at: nowIso(),
        }
      : null;

    set({
      ...withUndo(state, true),
      translateBusy: true,
      translateError: null,
      status: { kind: 'translating' },
      modal: { type: null },
      preTranslateBackup: backup,
    });

    try {
      const outcome = await translatePromptText({
        sourceText,
        direction,
        mode: settings.translateMode,
        dictionary: settings.dictionary,
        protectedTerms: collectLoraTerms(state.loras, workspace.activeLoras),
      });

      if (outcome.noop) {
        set({ translateBusy: false, status: { kind: 'idle' }, preTranslateBackup: null });
        get().toast(
          direction === 'zh-en'
            ? '没有检测到需要翻译的中文，英文框未改动。'
            : '没有检测到需要翻译的英文，中文翻译框未改动。',
          'info',
        );
        return;
      }

      const current = get();
      const patch: Partial<Workspace> =
        direction === 'zh-en'
          ? { englishText: outcome.text, alignment: outcome.alignment }
          : { translationZhText: outcome.text, alignment: outcome.alignment };
      if (direction === 'zh-en' && current.workspace.segmentsMode) {
        patch.segments = deriveSegments(outcome.text, current.workspace.segments);
      }
      const workspaceNext: Workspace = { ...current.workspace, ...patch, updatedAt: nowIso() };
      set({
        workspace: workspaceNext,
        translateBusy: false,
        status: { kind: 'idle' },
        translateError: null,
        lastTranslation: {
          side: targetSide,
          text: outcome.text,
          alignment: outcome.alignment,
          at: nowIso(),
        },
        preTranslateBackup: backup,
      });

      if (outcome.mock) {
        get().toast(
          '已使用「本地模拟翻译」（不是真实翻译）。请到设置中配置真实翻译服务后再正式使用。',
          'warning',
        );
      } else {
        get().toast(`翻译完成 · ${outcome.providerLabel}`, 'success');
      }
    } catch (error) {
      const info = friendlyError(error);
      set({
        translateBusy: false,
        status: { kind: 'error', message: info.message },
        translateError: { message: info.message, hint: info.hint, code: info.code, direction },
      });
      get().toast(`翻译失败：${info.message}`, 'error');
    }
  },

  restorePreTranslation: () => {
    const state = get();
    const backup = state.preTranslateBackup;
    if (!backup) return;
    set({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        translationZhText:
          backup.side === 'translation' ? backup.text : state.workspace.translationZhText,
        englishText: backup.side === 'english' ? backup.text : state.workspace.englishText,
        alignment: backup.alignment,
        updatedAt: nowIso(),
      },
      preTranslateBackup: null,
      translateError: null,
    });
    get().toast('已恢复翻译前的内容。', 'success');
  },

  restoreLastTranslation: (side) => {
    const state = get();
    const last = state.lastTranslation;
    if (!last || last.side !== side) {
      get().toast('没有可恢复的上次翻译结果。', 'info');
      return;
    }
    set({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        translationZhText: side === 'translation' ? last.text : state.workspace.translationZhText,
        englishText: side === 'english' ? last.text : state.workspace.englishText,
        alignment: last.alignment,
        updatedAt: nowIso(),
      },
    });
    get().toast('已恢复上次翻译结果。', 'success');
  },

  dismissTranslateError: () => set({ translateError: null }),

  enterSegmentsMode: () => {
    const state = get();
    if (state.workspace.segmentsMode) return;
    const segments = state.workspace.segments.length
      ? state.workspace.segments
      : deriveSegments(state.workspace.englishText);
    set({
      workspace: { ...state.workspace, segments, segmentsMode: true, updatedAt: nowIso() },
    });
  },
  exitSegmentsMode: () => {
    const state = get();
    const english = composeFromSegments(state.workspace.segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      workspace: {
        ...state.workspace,
        segmentsMode: false,
        englishText: english || state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  refreshSegmentsFromEnglish: () => {
    const state = get();
    const segments = deriveSegments(state.workspace.englishText, state.workspace.segments);
    set({
      ...withUndo(state, true),
      workspace: { ...state.workspace, segments, segmentsMode: true, updatedAt: nowIso() },
    });
    get().toast('已按当前英文提示词重新拆分片段。', 'info');
  },
  syncSegmentsToEnglish: () => {
    const state = get();
    const english = composeFromSegments(state.workspace.segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state, true),
      workspace: { ...state.workspace, englishText: english, updatedAt: nowIso() },
    });
    get().toast('已根据片段重新组合英文提示词。', 'success');
  },
  setSegmentText: (id, text) => {
    const state = get();
    const segments = state.workspace.segments.map((segment) =>
      segment.id === id ? { ...segment, text } : segment,
    );
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state),
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  setSegmentTranslation: (id, text) => {
    const state = get();
    const segments = state.workspace.segments.map((segment) =>
      segment.id === id ? { ...segment, translated: text } : segment,
    );
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state),
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  setSegmentWeight: (id, weight) => {
    const state = get();
    const safeWeight =
      weight === null || !Number.isFinite(weight) ? null : Math.min(10, Math.max(-10, weight));
    const segments = state.workspace.segments.map((segment) =>
      segment.id === id ? { ...segment, weight: safeWeight } : segment,
    );
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state),
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  setSegmentPolarity: (id, polarity) => {
    const state = get();
    const segments = state.workspace.segments.map((segment) =>
      segment.id === id ? { ...segment, polarity } : segment,
    );
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state),
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  toggleSegmentLock: (id) => {
    set((state) => ({
      workspace: {
        ...state.workspace,
        segments: state.workspace.segments.map((segment) =>
          segment.id === id ? { ...segment, locked: !segment.locked } : segment,
        ),
      },
    }));
  },
  addSegment: (text = '') => {
    const state = get();
    const segment: PromptSegment = {
      id: newId('seg'),
      text,
      translated: '',
      polarity: 'positive',
      locked: false,
      weight: null,
    };
    set({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        segments: [...state.workspace.segments, segment],
        segmentsMode: true,
        updatedAt: nowIso(),
      },
    });
  },
  deleteSegment: (id) => {
    const state = get();
    const segments = state.workspace.segments.filter((segment) => segment.id !== id);
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  duplicateSegment: (id) => {
    const state = get();
    const index = state.workspace.segments.findIndex((segment) => segment.id === id);
    if (index === -1) return;
    const copy: PromptSegment = {
      ...state.workspace.segments[index],
      id: newId('seg'),
      locked: false,
    };
    const segments = [...state.workspace.segments];
    segments.splice(index + 1, 0, copy);
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      ...withUndo(state, true),
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  moveSegment: (from, to) => {
    const state = get();
    const segments = [...state.workspace.segments];
    if (from < 0 || from >= segments.length || to < 0 || to >= segments.length || from === to) return;
    const [item] = segments.splice(from, 1);
    segments.splice(to, 0, item);
    const english = composeFromSegments(segments, {
      output: state.settings.output,
      polarity: 'positive',
    });
    set({
      workspace: {
        ...state.workspace,
        segments,
        englishText: state.workspace.segmentsMode ? english : state.workspace.englishText,
        updatedAt: nowIso(),
      },
    });
  },
  translateSegment: async (id) => {
    const state = get();
    const segment = state.workspace.segments.find((item) => item.id === id);
    if (!segment || !segment.text.trim()) {
      get().toast('这个片段是空的，无法翻译。', 'warning');
      return;
    }
    if (segment.locked) {
      get().toast('该片段已锁定，解锁后才能翻译。', 'warning');
      return;
    }
    if (state.segmentBusyId) return;
    set({ segmentBusyId: id });
    try {
      const result = await translateSingleText({
        text: segment.text,
        mode: state.settings.translateMode,
        dictionary: state.settings.dictionary,
        protectedTerms: collectLoraTerms(state.loras, state.workspace.activeLoras),
      });
      get().setSegmentTranslation(id, result.text);
      get().toast(
        result.mock ? '片段翻译完成（本地模拟翻译，不是真实翻译）' : '片段翻译完成',
        result.mock ? 'warning' : 'success',
      );
    } catch (error) {
      get().toast(`片段翻译失败：${friendlyError(error).message}`, 'error');
    } finally {
      set({ segmentBusyId: null });
    }
  },
  translateAllSegments: async () => {
    const state = get();
    if (state.segmentBusyId) return;
    const pending = state.workspace.segments.filter((segment) => !segment.locked && segment.text.trim());
    if (pending.length === 0) {
      get().toast('没有可翻译的片段。', 'info');
      return;
    }
    set({ segmentBusyId: 'all' });
    let failed = 0;
    for (const segment of pending) {
      const current = get().workspace.segments.find((item) => item.id === segment.id);
      if (!current) continue;
      try {
        const result = await translateSingleText({
          text: current.text,
          mode: get().settings.translateMode,
          dictionary: get().settings.dictionary,
          protectedTerms: collectLoraTerms(get().loras, get().workspace.activeLoras),
        });
        get().setSegmentTranslation(segment.id, result.text);
      } catch {
        failed++;
      }
    }
    set({ segmentBusyId: null });
    get().toast(
      failed > 0 ? `片段翻译完成，有 ${failed} 个片段失败，可单独重试。` : '全部片段翻译完成。',
      failed > 0 ? 'warning' : 'success',
    );
  },
  clearSegments: () => {
    const state = get();
    set({
      ...withUndo(state, true),
      workspace: { ...state.workspace, segments: [], updatedAt: nowIso() },
    });
  },

  saveLora: async (lora) => {
    const next: Lora = { ...lora, updatedAt: nowIso(), createdAt: lora.createdAt || nowIso() };
    set((state) => ({ loras: addOrReplace(state.loras, next) }));
    try {
      await saveLoraRecord(next);
      get().toast('LoRA 已保存。', 'success');
    } catch (error) {
      get().toast(`LoRA 保存失败：${friendlyError(error).message}`, 'error');
    }
  },
  deleteLora: async (id) => {
    set((state) => ({ loras: state.loras.filter((lora) => lora.id !== id) }));
    try {
      await deleteLoraRecord(id);
      get().toast('LoRA 已删除。当前作品中的快照仍保留。', 'success');
    } catch (error) {
      get().toast(`删除 LoRA 失败：${friendlyError(error).message}`, 'error');
    }
  },
  toggleLoraFavorite: (id) => {
    const state = get();
    const lora = state.loras.find((item) => item.id === id);
    if (!lora) return;
    void get().saveLora({ ...lora, favorite: !lora.favorite, updatedAt: nowIso() });
  },
  setLoraEnabled: (id, enabled) => {
    const state = get();
    const lora = state.loras.find((item) => item.id === id);
    if (!lora) return;
    void get().saveLora({ ...lora, enabled, updatedAt: nowIso() });
  },
  addActiveLora: (loraId) => {
    const state = get();
    const lora = state.loras.find((item) => item.id === loraId);
    if (!lora) {
      get().toast('找不到这个 LoRA，可能已被删除。', 'error');
      return;
    }
    if (state.workspace.activeLoras.some((item) => item.loraId === loraId)) {
      get().toast('这个 LoRA 已经在当前作品里了。', 'info');
      return;
    }
    const active: ProductLora = {
      loraId: lora.id,
      name: lora.name,
      file: lora.file,
      weight: Math.min(lora.weightMax, Math.max(lora.weightMin, lora.defaultWeight)),
      triggerWords: [...lora.triggerWords],
      promptPrefix: lora.promptPrefix,
      enabled: lora.enabled,
    };
    set({
      workspace: {
        ...state.workspace,
        activeLoras: [...state.workspace.activeLoras, active],
        updatedAt: nowIso(),
      },
    });
    get().toast(`已添加 LoRA：${lora.name}`, 'success');
  },
  removeActiveLora: (index) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        activeLoras: state.workspace.activeLoras.filter((_, i) => i !== index),
        updatedAt: nowIso(),
      },
    })),
  updateActiveLora: (index, patch) =>
    set((state) => {
      const safe = { ...patch };
      if (typeof safe.weight === 'number') {
        safe.weight = Number.isFinite(safe.weight)
          ? Math.min(10, Math.max(-10, safe.weight))
          : 0.8;
      }
      return {
        workspace: {
          ...state.workspace,
          activeLoras: state.workspace.activeLoras.map((lora, i) =>
            i === index ? { ...lora, ...safe } : lora,
          ),
          updatedAt: nowIso(),
        },
      };
    }),
  moveActiveLora: (from, to) => {
    const state = get();
    const list = [...state.workspace.activeLoras];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    set({ workspace: { ...state.workspace, activeLoras: list, updatedAt: nowIso() } });
  },
  resetActiveLoraWeight: (index) => {
    const state = get();
    const active = state.workspace.activeLoras[index];
    if (!active) return;
    const definition = state.loras.find((lora) => lora.id === active.loraId);
    const weight = definition ? definition.defaultWeight : 0.8;
    const clamped = definition
      ? Math.min(definition.weightMax, Math.max(definition.weightMin, weight))
      : weight;
    get().updateActiveLora(index, { weight: clamped });
  },
  toggleActiveLora: (index) => {
    const state = get();
    const active = state.workspace.activeLoras[index];
    if (!active) return;
    get().updateActiveLora(index, { enabled: !active.enabled });
  },

  generateProduct: async (name) => {
    const state = get();
    if (state.generating) return null;
    const workspace = state.workspace;
    set({ generating: true });
    try {
      // 先把当前工作区落盘，避免用户在生成后立即刷新导致最后几秒的编辑丢失。
      await saveWorkspaceRecord({ ...workspace, updatedAt: nowIso() }).catch(() => undefined);
      const assembly = assemblePrompts({
        englishText: workspace.englishText,
        draftText: workspace.draftText,
        negativeText: workspace.negativeText,
        segments: workspace.segments,
        activeLoras: workspace.activeLoras,
        params: workspace.params,
        presetId: workspace.presetId,
        output: state.settings.output,
      });
      if (!assembly.positive.trim()) {
        get().toast('成品提示词为空，请先输入或翻译内容。', 'warning');
        return null;
      }
      const product = createProduct({
        englishText: workspace.englishText,
        draftText: workspace.draftText,
        translationZhText: workspace.translationZhText,
        negativeText: workspace.negativeText,
        segments: workspace.segments,
        activeLoras: workspace.activeLoras,
        params: workspace.params,
        presetId: workspace.presetId,
        output: state.settings.output,
        alignment: workspace.alignment,
        name,
        assembly,
      });
      const entry = buildHistoryEntry('product', product.name, workspace, {
        createdAt: product.createdAt,
        productId: product.id,
      });
      const pruned = pruneHistoryList([entry, ...state.history], state.settings.historyLimit);
      set({
        products: [product, ...state.products],
        history: pruned.kept,
        generating: false,
        status: { kind: 'saved', at: nowIso() },
        lastSavedAt: nowIso(),
      });
      await saveProductRecord(product);
      await saveHistoryRecord(entry);
      if (pruned.removedIds.length > 0) {
        await deleteHistoryRecords(pruned.removedIds).catch(() => undefined);
      }
      if (assembly.warnings.length > 0) {
        get().toast(assembly.warnings[0], 'warning');
      } else {
        get().toast('成品已生成，草稿与翻译内容保持不变。', 'success');
      }
      return product;
    } catch (error) {
      get().toast(`生成成品失败：${friendlyError(error).message}`, 'error');
      return null;
    } finally {
      set({ generating: false });
    }
  },
  updateProduct: async (product) => {
    const next: Product = { ...product, updatedAt: nowIso() };
    set((state) => ({ products: addOrReplace(state.products, next) }));
    try {
      await saveProductRecord(next);
      get().toast('成品已更新。', 'success');
    } catch (error) {
      get().toast(`保存成品失败：${friendlyError(error).message}`, 'error');
    }
  },
  deleteProduct: async (id) => {
    set((state) => ({ products: state.products.filter((product) => product.id !== id) }));
    try {
      await deleteProductRecord(id);
      get().toast('成品已删除。历史记录中的快照仍保留。', 'success');
    } catch (error) {
      get().toast(`删除成品失败：${friendlyError(error).message}`, 'error');
    }
  },
  toggleProductFavorite: (id) => {
    const state = get();
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    void get().updateProduct({ ...product, favorite: !product.favorite });
  },
  renameProduct: async (id, name) => {
    const state = get();
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    const trimmed = name.trim();
    if (!trimmed) {
      get().toast('名称不能为空。', 'warning');
      return;
    }
    await get().updateProduct({ ...product, name: trimmed.slice(0, 200) });
  },
  reloadProduct: async (id) => {
    const state = get();
    const product = state.products.find((item) => item.id === id);
    if (!product) {
      get().toast('找不到这个成品。', 'error');
      return;
    }
    if (
      state.workspace.draftText.trim() ||
      state.workspace.translationZhText.trim() ||
      state.workspace.englishText.trim()
    ) {
      const backup = buildHistoryEntry('draft', `载入成品前自动备份 ${nowIso().slice(11, 19)}`, state.workspace);
      await saveHistoryRecord(backup).catch(() => undefined);
      set((current) => ({ history: [backup, ...current.history] }));
    }
    const workspace: Workspace = {
      ...state.workspace,
      draftText: product.draftText,
      translationZhText: product.translationZhText || product.draftText,
      englishText: product.englishText,
      negativeText: product.negativeText,
      alignment: product.alignment,
      segments: product.segments.map((segment) => ({ ...segment })),
      segmentsMode: false,
      activeLoras: product.loras.map((lora) => ({ ...lora, triggerWords: [...lora.triggerWords] })),
      params: { ...product.params },
      presetId: product.presetId,
      notes: product.notes,
      updatedAt: nowIso(),
    };
    set({ workspace, modal: { type: null }, status: { kind: 'saved', at: nowIso() } });
    get().toast('已把成品载入编辑器。', 'success');
  },

  createHistorySnapshot: async (type = 'manual', name) => {
    const state = get();
    const entry = buildHistoryEntry(
      type,
      name ?? `${type === 'draft' ? '草稿版本' : '手动保存'} ${nowIso().slice(11, 19)}`,
      state.workspace,
    );
    const pruned = pruneHistoryList([entry, ...state.history], state.settings.historyLimit);
    set({ history: pruned.kept });
    try {
      await saveHistoryRecord(entry);
      if (pruned.removedIds.length > 0) {
        await deleteHistoryRecords(pruned.removedIds).catch(() => undefined);
      }
      get().toast('已保存到历史记录。', 'success');
    } catch (error) {
      get().toast(`保存历史失败：${friendlyError(error).message}`, 'error');
    }
    return entry;
  },
  restoreHistory: async (id) => {
    const state = get();
    const entry = state.history.find((item) => item.id === id);
    if (!entry) {
      get().toast('找不到这条历史记录。', 'error');
      return;
    }
    const backup = buildHistoryEntry(
      'draft',
      `恢复前自动备份 ${nowIso().slice(11, 19)}`,
      state.workspace,
    );
    const pruned = pruneHistoryList([backup, ...state.history], state.settings.historyLimit);
    set({ history: pruned.kept });
    await saveHistoryRecord(backup).catch(() => undefined);
    if (pruned.removedIds.length > 0) {
      await deleteHistoryRecords(pruned.removedIds).catch(() => undefined);
    }
    set({
      ...withUndo(state, true),
      workspace: workspaceFromSnapshot(entry.snapshot, state.workspace),
      modal: { type: null },
      status: { kind: 'saved', at: nowIso() },
      translateError: null,
    });
    get().toast(`已恢复：${entry.name}`, 'success');
  },
  deleteHistory: async (ids) => {
    if (ids.length === 0) return;
    set((state) => ({ history: state.history.filter((entry) => !ids.includes(entry.id)) }));
    try {
      await deleteHistoryRecords(ids);
      get().toast(`已删除 ${ids.length} 条历史记录。`, 'success');
    } catch (error) {
      get().toast(`删除历史失败：${friendlyError(error).message}`, 'error');
    }
  },
  toggleHistoryFavorite: (id) => {
    const state = get();
    const entry = state.history.find((item) => item.id === id);
    if (!entry) return;
    const next = { ...entry, favorite: !entry.favorite };
    set({ history: state.history.map((item) => (item.id === id ? next : item)) });
    void saveHistoryRecord(next).catch((error) =>
      get().toast(`更新收藏失败：${friendlyError(error).message}`, 'error'),
    );
  },
  clearHistory: async () => {
    const ids = get().history.map((entry) => entry.id);
    set({ history: [] });
    try {
      await deleteHistoryRecords(ids);
      get().toast('历史记录已清空。', 'success');
    } catch (error) {
      get().toast(`清空历史失败：${friendlyError(error).message}`, 'error');
    }
  },
  openCompare: (leftId, rightId) => set({ modal: { type: 'compare', leftId, rightId } }),

  saveNow: async () => {
    const at = nowIso();
    set({ status: { kind: 'saving' } });
    try {
      await saveWorkspaceRecord({ ...get().workspace, updatedAt: at });
      set({ status: { kind: 'saved', at }, lastSavedAt: at });
      get().toast('已保存当前内容。', 'success');
    } catch (error) {
      set({ status: { kind: 'error', message: friendlyError(error).message } });
      get().toast(`保存失败：${friendlyError(error).message}`, 'error');
    }
  },
  newPrompt: async () => {
    const state = get();
    if (
      state.workspace.draftText.trim() ||
      state.workspace.translationZhText.trim() ||
      state.workspace.englishText.trim()
    ) {
      const backup = buildHistoryEntry(
        'draft',
        `新建前自动备份 ${nowIso().slice(11, 19)}`,
        state.workspace,
      );
      const pruned = pruneHistoryList([backup, ...state.history], state.settings.historyLimit);
      set({ history: pruned.kept });
      await saveHistoryRecord(backup).catch(() => undefined);
      if (pruned.removedIds.length > 0) {
        await deleteHistoryRecords(pruned.removedIds).catch(() => undefined);
      }
    }
    set({
      ...withUndo(state, true),
      workspace: {
        ...DEFAULT_WORKSPACE,
        params: { ...state.workspace.params },
        presetId: state.workspace.presetId,
        updatedAt: nowIso(),
      },
      alignmentVisible: false,
      translateError: null,
      preTranslateBackup: null,
      lastTranslation: null,
      status: { kind: 'idle' },
      modal: { type: null },
    });
    get().toast('已新建提示词，上一版保存在历史记录。', 'success');
  },
  exportBackupJson: () => {
    const state = get();
    const backup = buildBackup({
      settings: state.settings,
      workspace: state.workspace,
      loras: state.loras,
      products: state.products,
      history: state.history,
    });
    return JSON.stringify(backup, null, 2);
  },
  importBackupText: async (raw, mode) => {
    const parsed = parseBackupText(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    const data = await applyBackup(parsed.backup, mode);
    set({
      settings: data.settings,
      workspace: data.workspace,
      loras: data.loras,
      products: data.products,
      history: [...data.history].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      modal: { type: null },
      status: { kind: 'saved', at: nowIso() },
      undoStack: [],
      redoStack: [],
    });
    get().toast(`导入完成：${data.loras.length} 个 LoRA、${data.products.length} 个成品、${data.history.length} 条历史。`, 'success');
  },
  clearAllData: async () => {
    await clearLocalData();
    set({
      settings: { ...DEFAULT_SETTINGS },
      workspace: { ...DEFAULT_WORKSPACE },
      loras: [],
      products: [],
      history: [],
      undoStack: [],
      redoStack: [],
      translateError: null,
      preTranslateBackup: null,
      lastTranslation: null,
      modal: { type: null },
      status: { kind: 'idle' },
    });
    get().toast('本地数据已全部清除（服务端翻译配置未受影响）。', 'success');
  },

  markSaving: () => set({ status: { kind: 'saving' } }),
  markSaved: (at) => set({ status: { kind: 'saved', at }, lastSavedAt: at }),
  markSaveError: (message) => {
    set({ status: { kind: 'error', message } });
    get().toast(`自动保存失败：${message}`, 'error');
  },
}));

/** 清理只包含空白字符的片段，供 UI 使用。 */
export function hasEnglishContent(segments: PromptSegment[]): boolean {
  return segments.some((segment) => segment.text.trim() && !hasCJK(segment.text));
}

export type { LocalData };
