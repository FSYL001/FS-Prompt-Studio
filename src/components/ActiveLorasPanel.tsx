import { useEffect, useState } from 'react';
import type { Lora, ProductLora } from '../domain/types';
import { fillLoraTemplate, formatWeight, loraPromptPrefixes } from '../domain/lora';

function externalUrl(raw: string): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
import { modelTypeLabel } from '../domain/presets';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Toggle,
  ToggleRow,
} from './ui/primitives';

function ActiveLoraItem({
  active,
  index,
  definition,
  dragIndex,
  onDragStart,
  onDrop,
}: {
  active: ProductLora;
  index: number;
  definition: Lora | undefined;
  dragIndex: number | null;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  const updateActiveLora = useAppStore((state) => state.updateActiveLora);
  const removeActiveLora = useAppStore((state) => state.removeActiveLora);
  const resetActiveLoraWeight = useAppStore((state) => state.resetActiveLoraWeight);
  const toggleActiveLora = useAppStore((state) => state.toggleActiveLora);
  const output = useAppStore((state) => state.settings.output);
  const openModal = useAppStore((state) => state.openModal);
  const toast = useAppStore((state) => state.toast);
  const englishText = useAppStore((state) => state.workspace.englishText);
  const setEnglishText = useAppStore((state) => state.setEnglishText);
  const negativeText = useAppStore((state) => state.workspace.negativeText);
  const setNegativeText = useAppStore((state) => state.setNegativeText);

  const [triggerText, setTriggerText] = useState(active.triggerWords.join(', '));
  useEffect(() => {
    setTriggerText(active.triggerWords.join(', '));
  }, [active.triggerWords]);

  const prefixes = loraPromptPrefixes(active);

  const min = definition?.weightMin ?? -2;
  const max = definition?.weightMax ?? 2;
  const weight = active.weight;
  const defaultWeight = definition?.defaultWeight ?? 0.8;
  const tokenPreview =
    output.loraFormat === 'comfyui-text'
      ? 'ComfyUI 纯文本：只输出触发词'
      : active.file
        ? fillLoraTemplate(output.loraTokenTemplate || '<lora:{file}:{weight}>', {
            file: active.file,
            name: active.name,
            weight: formatWeight(active.weight),
            triggers: active.triggerWords.join(', '),
          })
        : '缺少文件名，无法生成 LoRA 语法';

  const commitTriggers = () => {
    const next = triggerText
      .split(/[,，]/)
      .map((item) => item.trim().replace(/^@+/, ''))
      .filter(Boolean)
      .slice(0, 50);
    updateActiveLora(index, { triggerWords: next });
  };

  const addTrigger = (trigger: string) => {
    const token = trigger.startsWith('@') ? trigger : `@${trigger}`;
    const base = englishText.trim();
    if (base.toLowerCase().includes(token.toLowerCase())) {
      toast(`英文提示词中已有 ${token}。`, 'info');
      return;
    }
    const separator = base && !/[,，.。]$/.test(base) ? ', ' : base ? ' ' : '';
    setEnglishText(`${base}${separator}${token}`);
    toast(`已添加 ${token}（触发词）到英文提示词。`, 'success');
  };

  const addPrefixes = (prefixes: string[]) => {
    const clean = prefixes.map((prefix) => prefix.trim()).filter(Boolean);
    if (clean.length === 0) return;
    const combined = clean.join(', ');
    const base = englishText.trim();
    if (base.toLowerCase().startsWith(combined.toLowerCase())) {
      toast('英文提示词已经以这些推荐前缀开头。', 'info');
      return;
    }
    const separator = /[,，.。]$/.test(combined) ? ' ' : ', ';
    setEnglishText(base ? `${combined}${separator}${base}`.trim() : combined);
    toast(clean.length > 1 ? '已把全部推荐前缀放到英文提示词开头。' : '已把推荐前缀放到英文提示词开头。', 'success');
  };

  const addRecommendedNegative = () => {
    const clean = (active.recommendedNegative ?? '').trim();
    if (!clean) return;
    const base = negativeText.trim();
    if (base.toLowerCase().includes(clean.toLowerCase())) {
      toast('负面英文中已包含这段推荐词。', 'info');
      return;
    }
    const separator = base && !/[,，.。]$/.test(base) ? ', ' : base ? ' ' : '';
    setNegativeText(`${base}${separator}${clean}`);
    toast('已把推荐负面提示词加入负面英文框。', 'success');
  };

  return (
    <li
      className={`active-lora ${dragIndex === index ? 'is-dragging' : ''}`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(index);
      }}
    >
      <div className="active-lora-head">
        <span className="drag-handle" title="拖动调整 LoRA 顺序">
          <Icon name="grip" size={15} />
        </span>
        <div className="active-lora-title">
          <span className={`lora-name ${active.enabled ? '' : 'is-disabled'}`}>
            {active.name || '未命名 LoRA'}
          </span>
          <span className="lora-file" title={active.file || '缺少文件名'}>
            {active.file || '⚠ 缺少文件名'}
          </span>
        </div>
        <label className="mini-toggle" title="启用 / 暂时停用">
          <Toggle
            checked={active.enabled}
            onChange={() => toggleActiveLora(index)}
            label={`启用 ${active.name}`}
          />
        </label>
        <IconButton
          icon="x"
          label="从当前作品移除"
          size="sm"
          onClick={() => removeActiveLora(index)}
        />
      </div>

      {!active.file ? (
        <div className="active-lora-missing">
          <Icon name="alert" size={14} />
          <span>补全文件名后才能输出 LoRA 语法。</span>
          <button type="button" className="link-button" onClick={() => openModal({ type: 'lora-library' })}>
            去补全
          </button>
        </div>
      ) : null}

      <div className="weight-row">
        <input
          className="range"
          type="range"
          min={min}
          max={max}
          step={0.05}
          value={weight}
          onChange={(event) => updateActiveLora(index, { weight: Number(event.target.value) })}
          aria-label={`${active.name} 权重滑块`}
        />
        <input
          className="input weight-number"
          type="number"
          min={-10}
          max={10}
          step={0.05}
          value={weight}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) updateActiveLora(index, { weight: value });
          }}
          aria-label={`${active.name} 权重`}
        />
        <button
          type="button"
          className="icon-btn btn-ghost icon-btn-sm"
          title={`恢复默认权重（${defaultWeight}）`}
          aria-label="恢复默认权重"
          onClick={() => resetActiveLoraWeight(index)}
        >
          <Icon name="refresh" size={15} />
        </button>
      </div>

      <div className="weight-meta">
        <span>
          范围 {min} – {max} · 默认 {defaultWeight}
        </span>
        {weight < 0 ? <span className="weight-warning">负权重可能产生反向效果，请谨慎使用</span> : null}
      </div>

      <label className="trigger-row">
        <span>触发词</span>
        <input
          className="input trigger-input"
          value={triggerText}
          onChange={(event) => setTriggerText(event.target.value)}
          onBlur={commitTriggers}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTriggers();
              (event.target as HTMLInputElement).blur();
            }
          }}
          placeholder="例如：my_style, masterpiece"
          spellCheck={false}
        />
      </label>

      {active.triggerWords.length > 0 ? (
        <div className="trigger-chip-list compact">
          {active.triggerWords.map((trigger) => (
            <button
              key={trigger}
              type="button"
              className="trigger-pill"
              onClick={() => addTrigger(trigger)}
              title="点击加入英文提示词"
            >
              @{trigger}
            </button>
          ))}
        </div>
      ) : null}

      {prefixes.length > 0 ? (
        <div className="active-lora-prefix">
          <div className="active-lora-prefix-head">
            <span>推荐前缀 · {prefixes.length}</span>
            <button type="button" className="link-button" onClick={() => addPrefixes(prefixes)}>
              全部加入英文开头
            </button>
          </div>
          <div className="active-lora-prefix-list">
            {prefixes.map((prefix) => (
              <div className="active-lora-prefix-row" key={prefix}>
                <code>{prefix}</code>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => addPrefixes([prefix])}
                  title="只加入这一条前缀"
                >
                  加入
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(active.recommendedNegative ?? '').trim() ? (
        <div className="active-lora-prefix active-lora-negative">
          <div className="active-lora-prefix-head">
            <span>推荐负面</span>
            <button type="button" className="link-button" onClick={addRecommendedNegative}>
              加入负面英文
            </button>
          </div>
          <code>{active.recommendedNegative}</code>
        </div>
      ) : null}

      <div className="lora-token-preview" title="按当前输出设置生成的 LoRA 片段">
        <code>{tokenPreview}</code>
        {externalUrl(active.sourceUrl ?? '') ? (
          <a
            className="active-lora-source"
            href={externalUrl(active.sourceUrl ?? '') ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={12} /> 出处
          </a>
        ) : null}
        {definition ? null : (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              toast('这个 LoRA 已不在库中，当前保留的是作品内的快照。', 'info');
              openModal({ type: 'lora-library' });
            }}
          >
            库中已删除
          </button>
        )}
      </div>
    </li>
  );
}

export function ActiveLorasPanel() {
  const activeLoras = useAppStore((state) => state.workspace.activeLoras);
  const loras = useAppStore((state) => state.loras);
  const openModal = useAppStore((state) => state.openModal);
  const moveActiveLora = useAppStore((state) => state.moveActiveLora);
  const loraFormat = useAppStore((state) => state.settings.output.loraFormat);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <Card
      title={
        <span className="panel-title">
          <Icon name="layers" size={17} /> 当前 LoRA
          {activeLoras.length > 0 ? <Badge tone="accent">{activeLoras.length}</Badge> : null}
        </span>
      }
      subtitle={
        loraFormat === 'comfyui-text'
          ? '当前为 ComfyUI 纯文本模式：成品只包含触发词，不会伪造 LoRA 调用语法。'
          : '调整权重与顺序，成品会按当前格式输出。'
      }
      actions={
        <Button size="sm" variant="secondary" icon="folder" onClick={() => openModal({ type: 'lora-library' })}>
          管理库
        </Button>
      }
      className="side-card active-loras-card"
    >
      {activeLoras.length === 0 ? (
        <EmptyState
          icon="layers"
          title="还没有使用 LoRA"
          description="从 LoRA 库添加后，可分别调整权重、触发词与顺序。"
          action={
            <Button size="sm" variant="primary" icon="plus" onClick={() => openModal({ type: 'lora-library' })}>
              添加 LoRA
            </Button>
          }
        />
      ) : (
        <ul className="active-lora-list">
          {activeLoras.map((active, index) => (
            <ActiveLoraItem
              key={`${active.loraId ?? active.name}-${index}`}
              active={active}
              index={index}
              definition={loras.find((lora) => lora.id === active.loraId)}
              dragIndex={dragIndex}
              onDragStart={(from) => setDragIndex(from)}
              onDrop={(to) => {
                if (dragIndex !== null) moveActiveLora(dragIndex, to);
                setDragIndex(null);
              }}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function OutputQuickPanel() {
  const settings = useAppStore((state) => state.settings);
  const params = useAppStore((state) => state.workspace.params);
  const presetId = useAppStore((state) => state.workspace.presetId);
  const choosePreset = useAppStore((state) => state.choosePreset);
  const updateOutput = useAppStore((state) => state.updateOutputConfig);
  const openModal = useAppStore((state) => state.openModal);
  const model = modelTypeLabel(params.modelType);

  return (
    <Card
      title={
        <span className="panel-title">
          <Icon name="settings" size={17} /> 输出与模型
        </span>
      }
      subtitle="预设只改变输出习惯，不会自动添加质量词或风格。"
      className="side-card"
      actions={
        <Button size="sm" variant="ghost" icon="edit" onClick={() => openModal({ type: 'settings', section: 'general' })}>
          更多
        </Button>
      }
    >
      <div className="quick-preset">
        <label className="field-label" htmlFor="quick-preset">
          输出预设
        </label>
        <select
          id="quick-preset"
          className="input select"
          value={presetId}
          onChange={(event) => choosePreset(event.target.value as typeof presetId)}
        >
          <option value="sd15">SD 1.5</option>
          <option value="sdxl">SDXL</option>
          <option value="flux">FLUX</option>
          <option value="comfyui">ComfyUI 通用</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      <div className="quick-summary">
        <Badge tone="outline">{model}</Badge>
        <span>{params.width}×{params.height}</span>
        <span>Steps {params.steps}</span>
        <span>CFG {params.cfg}</span>
      </div>

      <div className="quick-divider" />

      <div className="quick-field">
        <label className="field-label" htmlFor="quick-separator">
          分隔符
        </label>
        <input
          id="quick-separator"
          className="input"
          value={settings.output.format === 'lines' ? '\\n' : settings.output.separator}
          onChange={(event) => updateOutput({ separator: event.target.value })}
          disabled={settings.output.format === 'lines'}
          placeholder=", "
        />
      </div>

      <div className="quick-field">
        <label className="field-label" htmlFor="quick-lora-format">
          LoRA 输出
        </label>
        <select
          id="quick-lora-format"
          className="input select"
          value={settings.output.loraFormat}
          onChange={(event) =>
            updateOutput({ loraFormat: event.target.value as typeof settings.output.loraFormat })
          }
        >
          <option value="sd">SD 语法 &lt;lora:文件:权重&gt;</option>
          <option value="comfyui-text">ComfyUI 纯文本（仅触发词）</option>
          <option value="custom">自定义模板</option>
        </select>
      </div>

      <div className="quick-toggles">
        <ToggleRow
          label="输出权重语法"
          checked={settings.output.includeWeights}
          onChange={(checked) => updateOutput({ includeWeights: checked })}
        />
        <ToggleRow
          label="追加触发词"
          checked={settings.output.includeTriggers}
          onChange={(checked) => updateOutput({ includeTriggers: checked })}
        />
        <ToggleRow
          label="正负提示词分开"
          checked={settings.output.negativeSeparate}
          onChange={(checked) => updateOutput({ negativeSeparate: checked })}
        />
      </div>
    </Card>
  );
}

export function PrivacyCard() {
  const serverConfig = useAppStore((state) => state.serverConfig);
  const openModal = useAppStore((state) => state.openModal);

  return (
    <section className="privacy-card">
      <div className="privacy-title">
        <Icon name="database" size={16} />
        本地优先
      </div>
      <p>草稿、LoRA 库、成品与历史都保存在当前浏览器。翻译时只发送需要翻译的文本片段。</p>
      <p className="privacy-destination">
        当前翻译目的地：
        <strong>{serverConfig?.dataDestination ?? '未知（后端未连接）'}</strong>
      </p>
      <button type="button" className="link-button" onClick={() => openModal({ type: 'settings', section: 'data' })}>
        数据备份 / 清除
      </button>
    </section>
  );
}
