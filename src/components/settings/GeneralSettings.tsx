import { MODEL_TYPES } from '../../domain/types';
import { modelTypeLabel, getPreset } from '../../domain/presets';
import { useAppStore } from '../../store/appStore';
import { Button, Field, SectionLabel, Segmented, ToggleRow } from '../ui/primitives';

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const presetId = useAppStore((state) => state.workspace.presetId);
  const params = useAppStore((state) => state.workspace.params);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const updateOutput = useAppStore((state) => state.updateOutputConfig);
  const choosePreset = useAppStore((state) => state.choosePreset);
  const setParams = useAppStore((state) => state.setParams);
  const setTheme = useAppStore((state) => state.setTheme);
  const toast = useAppStore((state) => state.toast);
  const preset = getPreset(presetId);

  const openGenerationStudio = () => {
    const raw = (settings.generationUrl || '').trim() || 'http://127.0.0.1:8188/';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        toast('生图地址只支持 http:// 或 https://。', 'error');
        return;
      }
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      toast('生图地址格式不正确，请填写完整的 http:// 或 https:// 地址。', 'error');
    }
  };

  return (
    <div className="settings-section">
      <SectionLabel hint="默认 ComfyUI: http://127.0.0.1:8188/">生图工作台</SectionLabel>
      <div className="settings-row">
        <Field
          label="生图页面地址"
          hint="顶部「前往生图」按钮会在新标签页打开这个地址，可改成你自己的 ComfyUI / WebUI 地址。"
        >
          <input
            className="input"
            value={settings.generationUrl}
            onChange={(event) => updateSettings({ generationUrl: event.target.value })}
            placeholder="http://127.0.0.1:8188/"
            spellCheck={false}
          />
        </Field>
        <Field label="快捷操作" hint="地址会在浏览器新标签页打开。">
          <div className="settings-inline-actions settings-inline-tight">
            <Button size="sm" variant="secondary" icon="external" onClick={openGenerationStudio}>
              打开生图页面
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              onClick={() => updateSettings({ generationUrl: 'http://127.0.0.1:8188/' })}
            >
              恢复默认
            </Button>
          </div>
        </Field>
      </div>

      <SectionLabel hint="自动保存">外观</SectionLabel>
      <div className="settings-row">
        <Field label="主题">
          <Segmented
            value={settings.theme}
            ariaLabel="主题"
            onChange={setTheme}
            options={[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
              { value: 'system', label: '跟随系统' },
            ]}
          />
        </Field>
        <Field label="翻译结果风格" hint="忠实模式不会添加原文没有的内容。">
          <Segmented
            value={settings.translateMode}
            ariaLabel="翻译模式"
            onChange={(mode) => updateSettings({ translateMode: mode })}
            options={[
              { value: 'faithful', label: '忠实翻译' },
              { value: 'natural', label: '自然描述' },
            ]}
          />
        </Field>
      </div>

      <SectionLabel hint="只影响输出格式，不改动提示词内容">输出预设与格式</SectionLabel>
      <div className="settings-row">
        <Field label="输出预设">
          <select
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
        </Field>
        <Field label="提示词输出格式" hint="标签会用分隔符连接；每行一个片段则按行输出。">
          <select
            className="input select"
            value={settings.output.format}
            onChange={(event) =>
              updateOutput({ format: event.target.value as typeof settings.output.format })
            }
          >
            <option value="tags">逗号 / 自定义分隔符</option>
            <option value="lines">每行一个片段</option>
            <option value="custom">自定义分隔符</option>
          </select>
        </Field>
      </div>
      <p className="settings-note">{preset.summary}</p>

      <div className="settings-row">
        <Field
          label="分隔符"
          hint="支持换行请用 \n；生效于成品输出与片段组合。"
        >
          <input
            className="input"
            value={settings.output.separator}
            onChange={(event) => updateOutput({ separator: event.target.value })}
            disabled={settings.output.format === 'lines'}
            maxLength={24}
            placeholder=", "
          />
        </Field>
        <Field label="自定义分隔符" hint="仅「自定义分隔符」格式使用。">
          <input
            className="input"
            value={settings.output.customSeparator}
            onChange={(event) => updateOutput({ customSeparator: event.target.value })}
            disabled={settings.output.format !== 'custom'}
            maxLength={24}
            placeholder="\n"
          />
        </Field>
      </div>

      <div className="settings-toggles">
        <ToggleRow
          label="输出权重语法"
          hint="把片段权重包裹为 (内容:权重)；并非所有模型/前端都支持。"
          checked={settings.output.includeWeights}
          onChange={(checked) => updateOutput({ includeWeights: checked })}
        />
        <ToggleRow
          label="追加 LoRA 触发词"
          hint="只追加你在 LoRA 里填写的触发词，不会自动添加质量词。"
          checked={settings.output.includeTriggers}
          onChange={(checked) => updateOutput({ includeTriggers: checked })}
        />
        <ToggleRow
          label="正负提示词分开输出"
          hint="开启后负向提示词单独成段；关闭则合并到正向。"
          checked={settings.output.negativeSeparate}
          onChange={(checked) => updateOutput({ negativeSeparate: checked })}
        />
        <ToggleRow
          label="纯英文检查"
          hint="成品中残留中文时给出提示。"
          checked={settings.output.pureEnglish}
          onChange={(checked) => updateOutput({ pureEnglish: checked })}
        />
        <ToggleRow
          label="导出时包含采样参数"
          hint="把 Steps / CFG / Sampler 等参数写入成品末尾。"
          checked={settings.output.includeParams}
          onChange={(checked) => updateOutput({ includeParams: checked })}
        />
        <ToggleRow
          label="导出 TXT 时附带中文注释"
          hint="注释只写入 TXT 导出文件，不会混入提示词。"
          checked={settings.output.includeChineseComments}
          onChange={(checked) => updateOutput({ includeChineseComments: checked })}
        />
      </div>

      <div className="settings-row">
        <Field
          label="LoRA 输出格式"
          hint="ComfyUI 纯文本不会伪造 <lora:...> 调用；真正的工作流请用模板导出。"
        >
          <select
            className="input select"
            value={settings.output.loraFormat}
            onChange={(event) =>
              updateOutput({ loraFormat: event.target.value as typeof settings.output.loraFormat })
            }
          >
            <option value="sd">SD / WebUI：&lt;lora:文件名:权重&gt;</option>
            <option value="comfyui-text">ComfyUI 纯提示词：只输出触发词</option>
            <option value="custom">自定义 LoRA 模板</option>
          </select>
        </Field>
        <Field label="LoRA 模板" hint="可用占位符：{file} {name} {weight} {triggers}">
          <input
            className="input"
            value={settings.output.loraTokenTemplate}
            onChange={(event) => updateOutput({ loraTokenTemplate: event.target.value })}
            disabled={settings.output.loraFormat === 'comfyui-text'}
            maxLength={160}
          />
        </Field>
      </div>

      <ToggleRow
        label="使用自定义完整输出模板"
        hint="适合特定前端。{positive} {negative} {loras} {triggers} {params}"
        checked={settings.output.useCustomTemplate}
        onChange={(checked) => updateOutput({ useCustomTemplate: checked })}
      />
      {settings.output.useCustomTemplate ? (
        <Field
          label="完整输出模板"
          hint="{positive} 为必填占位符；模板中的 {loras} 会单独插入 LoRA 标签。"
        >
          <textarea
            className="input textarea"
            value={settings.output.customOutputTemplate}
            onChange={(event) => updateOutput({ customOutputTemplate: event.target.value })}
            rows={4}
            spellCheck={false}
          />
        </Field>
      ) : null}

      <SectionLabel hint="写入成品与导出文件">模型与采样参数</SectionLabel>
      <div className="settings-row settings-row-3">
        <Field label="模型类型">
          <select
            className="input select"
            value={params.modelType}
            onChange={(event) =>
              setParams({ modelType: event.target.value as typeof params.modelType })
            }
          >
            {MODEL_TYPES.map((type) => (
              <option value={type} key={type}>
                {modelTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="模型文件名">
          <input
            className="input"
            value={params.modelName}
            onChange={(event) => setParams({ modelName: event.target.value })}
            placeholder="可选，仅作记录"
          />
        </Field>
        <Field label="采样器">
          <input
            className="input"
            value={params.sampler}
            onChange={(event) => setParams({ sampler: event.target.value })}
            placeholder="DPM++ 2M Karras"
          />
        </Field>
      </div>
      <div className="settings-row settings-row-4">
        <Field label="步数">
          <input
            className="input"
            type="number"
            min={1}
            max={300}
            value={params.steps}
            onChange={(event) => setParams({ steps: Math.max(1, Number(event.target.value) || 1) })}
          />
        </Field>
        <Field label="CFG">
          <input
            className="input"
            type="number"
            step="0.5"
            min={0}
            max={60}
            value={params.cfg}
            onChange={(event) => setParams({ cfg: Math.max(0, Number(event.target.value) || 0) })}
          />
        </Field>
        <Field label="宽度">
          <input
            className="input"
            type="number"
            min={64}
            max={8192}
            step={64}
            value={params.width}
            onChange={(event) => setParams({ width: Math.max(64, Number(event.target.value) || 512) })}
          />
        </Field>
        <Field label="高度">
          <input
            className="input"
            type="number"
            min={64}
            max={8192}
            step={64}
            value={params.height}
            onChange={(event) => setParams({ height: Math.max(64, Number(event.target.value) || 512) })}
          />
        </Field>
      </div>
      <div className="settings-row settings-row-3">
        <Field label="随机种子">
          <input
            className="input"
            type="number"
            value={params.seed}
            onChange={(event) => setParams({ seed: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="Clip skip">
          <input
            className="input"
            type="number"
            min={0}
            max={20}
            value={params.clipSkip}
            onChange={(event) => setParams({ clipSkip: Math.max(0, Number(event.target.value) || 0) })}
          />
        </Field>
      </div>
      <p className="settings-note">
        提示：预设只提供默认值，不会自动往提示词里添加「masterpiece」「best quality」等质量词。
      </p>

      <SectionLabel>新手引导</SectionLabel>
      <div className="settings-inline-actions">
        <Button
          size="sm"
          variant="secondary"
          icon="sparkles"
          onClick={() => {
            updateSettings({ onboardingSeen: false });
            useAppStore.getState().toast('已重新开启新手引导，关闭设置后即可看到。', 'info');
          }}
        >
          重新显示新手引导
        </Button>
      </div>
    </div>
  );
}
