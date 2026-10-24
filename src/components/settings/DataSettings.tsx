import { useEffect, useRef, useState } from 'react';
import type { Backup } from '../../domain/types';
import { downloadText } from '../../domain/id';
import {
  getBackupStats,
  getStorageSummary,
  parseBackupText,
  type BackupStats,
} from '../../db/repositories';
import { useAppStore } from '../../store/appStore';
import { Badge, Button, InlineError, InlineWarning, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';

function formatBytes(value: number | null): string {
  if (value === null) return '未知';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function DataSettings() {
  const exportBackupJson = useAppStore((state) => state.exportBackupJson);
  const importBackupText = useAppStore((state) => state.importBackupText);
  const clearAllData = useAppStore((state) => state.clearAllData);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const openModal = useAppStore((state) => state.openModal);
  const toast = useAppStore((state) => state.toast);

  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<{
    loras: number;
    products: number;
    history: number;
    usedBytes: number | null;
    quotaBytes: number | null;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<{
    backup: Backup;
    stats: BackupStats;
    fileName: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [importing, setImporting] = useState(false);

  const refreshSummary = () => {
    void getStorageSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  };

  useEffect(() => {
    refreshSummary();
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    setImportPreview(null);
    if (file.size > 10 * 1024 * 1024) {
      setImportError('文件超过 10MB，已拒绝导入。');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseBackupText(text);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }
      setImportPreview({
        backup: parsed.backup,
        stats: getBackupStats(parsed.backup),
        fileName: file.name,
      });
    } catch (error) {
      setImportError(
        `读取文件失败：${error instanceof Error ? error.message : '未知错误'}。可以重新选择文件。`,
      );
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    setImportError(null);
    try {
      await importBackupText(JSON.stringify(importPreview.backup), mode);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败。');
      setImporting(false);
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    if (mode === 'replace') {
      confirmAction({
        title: '替换全部本地数据？',
        message:
          '当前浏览器中的草稿、LoRA 库、成品与历史将被删除，并用备份内容替换。此操作不可撤销，建议先导出当前数据。',
        confirmLabel: '替换并导入',
        danger: true,
        onConfirm: doImport,
      });
    } else {
      void doImport();
    }
  };

  const exportBackup = () => {
    try {
      const json = exportBackupJson();
      downloadText(
        `prompt-studio-backup-${new Date().toISOString().slice(0, 10)}.json`,
        json,
        'application/json;charset=utf-8',
      );
      toast('完整备份已导出。', 'success');
    } catch (error) {
      toast(`导出失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  };

  const clearData = () => {
    confirmAction({
      title: '清除全部本地数据？',
      message:
        '草稿、LoRA 库、成品、历史与本地设置都会被删除。这个操作无法恢复，除非你已有备份。服务端翻译配置不受影响。',
      confirmLabel: '继续',
      danger: true,
      onConfirm: () => {
        confirmAction({
          title: '最后确认：真的要删除吗？',
          message: '删除后不可撤销。建议先导出备份。',
          confirmLabel: '确认全部删除',
          danger: true,
          onConfirm: async () => {
            await clearAllData();
          },
        });
      },
    });
  };

  return (
    <div className="settings-section">
      <SectionLabel hint="IndexedDB · 仅当前浏览器">存储概览</SectionLabel>
      <div className="storage-summary">
        <div className="storage-stat">
          <span className="storage-value">{summary?.loras ?? '—'}</span>
          <span className="storage-label">LoRA</span>
        </div>
        <div className="storage-stat">
          <span className="storage-value">{summary?.products ?? '—'}</span>
          <span className="storage-label">成品</span>
        </div>
        <div className="storage-stat">
          <span className="storage-value">{summary?.history ?? '—'}</span>
          <span className="storage-label">历史记录</span>
        </div>
        <div className="storage-stat">
          <span className="storage-value">{formatBytes(summary?.usedBytes ?? null)}</span>
          <span className="storage-label">已用空间</span>
        </div>
        <Button size="sm" variant="ghost" icon="refresh" onClick={refreshSummary}>
          刷新
        </Button>
      </div>
      {summary?.quotaBytes ? (
        <p className="settings-note">浏览器可用配额约 {formatBytes(summary.quotaBytes)}。</p>
      ) : null}

      <SectionLabel>备份与恢复</SectionLabel>
      <p className="settings-note">
        备份包含设置、词典、工作流模板、LoRA 库、成品、历史与当前草稿。导入前会校验数据结构并显示预览，不会执行任何脚本。
      </p>
      <div className="settings-inline-actions">
        <Button variant="primary" icon="download" onClick={exportBackup}>
          导出完整备份（JSON）
        </Button>
        <Button variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>
          选择备份文件…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button
          variant="ghost"
          icon="history"
          onClick={() => openModal({ type: 'history' })}
        >
          打开历史记录
        </Button>
      </div>

      {importError ? (
        <InlineError message={importError} onDismiss={() => setImportError(null)} />
      ) : null}

      {importPreview ? (
        <div className="import-preview">
          <div className="import-preview-head">
            <Icon name="upload" size={18} />
            <div>
              <div className="import-preview-title">导入预览：{importPreview.fileName}</div>
              <div className="import-preview-meta">
                导出于 {new Date(importPreview.stats.exportedAt).toLocaleString('zh-CN')}
              </div>
            </div>
            <Badge tone="success">数据校验通过</Badge>
          </div>
          <div className="import-stats">
            <span>LoRA {importPreview.stats.loras}</span>
            <span>成品 {importPreview.stats.products}</span>
            <span>历史 {importPreview.stats.history}</span>
            <span>词典 {importPreview.stats.dictionaryEntries}</span>
            <span>工作流 {importPreview.stats.workflows}</span>
            <span>{importPreview.stats.hasWorkspace ? '包含当前草稿' : '不含当前草稿'}</span>
          </div>
          <div className="import-modes">
            <label className={`import-mode ${mode === 'merge' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              <span>
                <strong>合并导入</strong>
                <small>保留现有数据，同 ID 时保留更新时间较新的版本。</small>
              </span>
            </label>
            <label className={`import-mode ${mode === 'replace' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              <span>
                <strong>替换导入</strong>
                <small>删除现有本地数据后导入，需要二次确认。</small>
              </span>
            </label>
          </div>
          {mode === 'merge' ? (
            <InlineWarning>
              合并模式会用备份中的设置与工作流覆盖本地设置；草稿只有在备份包含草稿时才会被替换。
            </InlineWarning>
          ) : null}
          <div className="settings-inline-actions">
            <Button variant="ghost" onClick={() => setImportPreview(null)} disabled={importing}>
              取消
            </Button>
            <Button variant="primary" icon="upload" loading={importing} onClick={confirmImport}>
              开始导入
            </Button>
          </div>
        </div>
      ) : null}

      <SectionLabel>危险操作</SectionLabel>
      <div className="danger-zone">
        <div>
          <div className="danger-zone-title">清除全部本地数据</div>
          <p>
            这会删除当前浏览器中的全部 Prompt Studio 数据。请先导出备份。服务端翻译 API
            配置不在本地，不会被删除。
          </p>
        </div>
        <Button variant="danger" icon="trash" onClick={clearData}>
          清除数据
        </Button>
      </div>

      <InlineWarning>
        导入的 JSON 只会作为普通数据解析并做严格校验，不执行其中的任何脚本；所有文本在界面中按纯文本渲染。
        但请只导入你自己信任的备份文件。
      </InlineWarning>
    </div>
  );
}
