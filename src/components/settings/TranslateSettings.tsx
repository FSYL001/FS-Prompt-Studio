import { useEffect, useState } from 'react';
import type { ProviderId } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import {
  ApiError,
  saveTranslateConfig,
  testTranslation,
  type TestResult,
} from '../../services/translateApi';
import { Badge, Button, Field, InlineError, InlineWarning, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';

const PROVIDER_INFO: Array<{
  value: ProviderId;
  label: string;
  description: string;
  requiresKey: boolean;
}> = [
  {
    value: 'google-free',
    label: 'Google 翻译公共接口（免费）',
    description:
      '无需密钥，开箱即用。使用的是非官方公共接口，可能限流或随时不可用；大陆网络建议在下方配置 VPN/Clash 的本地代理。',
    requiresKey: false,
  },
  {
    value: 'mymemory',
    label: 'MyMemory 免费备用（无需密钥）',
    description:
      'Google 超时或无法连接时可直接切换。无需密钥，免费额度有限；适合临时使用，长文建议配置自己的 API。',
    requiresKey: false,
  },
  {
    value: 'openai',
    label: 'OpenAI 兼容接口',
    description:
      '支持 OpenAI、DeepSeek、通义等兼容 /chat/completions 的服务，翻译质量和术语控制最好，可配合自定义词典。',
    requiresKey: true,
  },
  {
    value: 'deepl',
    label: 'DeepL API',
    description: '适合自然语言翻译；需要 DeepL 密钥，免费版地址是 api-free.deepl.com。',
    requiresKey: true,
  },
  {
    value: 'mock',
    label: '本地模拟翻译（仅演示）',
    description:
      '只做少量内置词典替换，无法翻译的内容会保留中文。明确标记为模拟，不能当成真实翻译使用。',
    requiresKey: false,
  },
];

export function TranslateSettings() {
  const serverConfig = useAppStore((state) => state.serverConfig);
  const serverConfigError = useAppStore((state) => state.serverConfigError);
  const refresh = useAppStore((state) => state.refreshServerConfig);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const toast = useAppStore((state) => state.toast);
  const confirmAction = useAppStore((state) => state.confirmAction);

  const [provider, setProvider] = useState<ProviderId>(serverConfig?.provider ?? 'google-free');
  const [baseUrl, setBaseUrl] = useState(serverConfig?.baseUrl ?? '');
  const [model, setModel] = useState(serverConfig?.model ?? 'gpt-4o-mini');
  const [timeoutMs, setTimeoutMs] = useState(serverConfig?.timeoutMs ?? 20000);
  const [proxyMode, setProxyMode] = useState<'auto' | 'manual' | 'off'>(
    serverConfig?.proxyMode ?? 'auto',
  );
  const [proxyUrl, setProxyUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    if (!serverConfig) return;
    setProvider(serverConfig.provider);
    setBaseUrl(serverConfig.baseUrl);
    setModel(serverConfig.model);
    setTimeoutMs(serverConfig.timeoutMs);
    setProxyMode(serverConfig.proxyMode);
    setProxyUrl('');
    setApiKey('');
    setTestResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverConfig]);

  const info = PROVIDER_INFO.find((item) => item.value === provider) ?? PROVIDER_INFO[0];
  const defaults = serverConfig?.defaultBaseUrls ?? {};
  const providerChanged = serverConfig ? provider !== serverConfig.provider : false;
  const configPathLabel = serverConfig?.configPath
    ? serverConfig.configPath.split(/[\\/]/).slice(-2).join('/')
    : 'server/data/translate-config.json';

  const buildPatch = () => {
    const patch: {
      provider: ProviderId;
      baseUrl: string;
      model: string;
      timeoutMs: number;
      apiKey?: string;
      proxyMode: 'auto' | 'manual' | 'off';
      proxyUrl?: string;
    } = {
      provider,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      timeoutMs,
      proxyMode,
    };
    if (apiKey.trim()) patch.apiKey = apiKey.trim();
    else if (providerChanged) patch.apiKey = '';
    if (proxyUrl.trim()) patch.proxyUrl = proxyUrl.trim();
    return patch;
  };

  const handleSave = async () => {
    if (timeoutMs < 2000 || timeoutMs > 120000) {
      setError({ message: '超时时间需要在 2 秒到 120 秒之间。' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const config = await saveTranslateConfig(buildPatch());
      updateSettings({
        translator: {
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          timeoutMs: config.timeoutMs,
        },
      });
      await refresh(false);
      setApiKey('');
      setTestResult(null);
      toast(
        config.isMock
          ? '已保存为模拟翻译模式：结果仅用于界面测试，不是真实翻译。'
          : `翻译服务已保存：${config.label}`,
        config.isMock ? 'warning' : 'success',
      );
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : '保存失败。';
      const hint = caught instanceof ApiError ? caught.hint : undefined;
      setError({ message, hint });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await testTranslation(buildPatch());
      setTestResult(result);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : '测试失败。';
      const hint = caught instanceof ApiError ? caught.hint : undefined;
      setError({ message, hint });
    } finally {
      setTesting(false);
    }
  };

  const clearKey = () => {
    confirmAction({
      title: '清除服务端保存的 API Key？',
      message:
        '清除后如果环境变量中也没有配置密钥，翻译将无法使用。浏览器从未保存过这个密钥。',
      confirmLabel: '清除密钥',
      danger: true,
      onConfirm: async () => {
        await saveTranslateConfig({ apiKey: '' });
        await refresh(false);
        setApiKey('');
        toast('已清除服务端保存的 API Key。', 'success');
      },
    });
  };

  return (
    <div className="settings-section">
      {serverConfigError ? (
        <InlineError
          message={serverConfigError}
          hint="请确认后端 API 服务已启动（npm run dev）。"
          onRetry={() => void refresh(true)}
        />
      ) : null}

      <SectionLabel hint={serverConfig ? serverConfig.label : '读取中…'}>翻译服务</SectionLabel>
      <div className="provider-current">
        <div className="provider-current-main">
          <span className="provider-current-label">当前服务</span>
          <strong>{serverConfig?.label ?? '尚未连接后端'}</strong>
          {serverConfig?.isMock ? <Badge tone="warning">模拟翻译</Badge> : null}
          {serverConfig?.requiresKey ? (
            serverConfig.hasKey ? (
              <Badge tone="success">密钥已配置</Badge>
            ) : (
              <Badge tone="danger">缺少密钥</Badge>
            )
          ) : null}
        </div>
        <div className="provider-current-meta">
          数据发送目的地：<code>{serverConfig?.dataDestination ?? '未知'}</code>
        </div>
      </div>

      <Field label="翻译服务类型">
        <select
          className="input select"
          value={provider}
          onChange={(event) => {
            const next = event.target.value as ProviderId;
            setProvider(next);
            setBaseUrl('');
            setApiKey('');
            setTestResult(null);
            setError(null);
            if (next === 'openai') setModel('gpt-4o-mini');
            else setModel('');
          }}
        >
          {PROVIDER_INFO.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="settings-note">{info.description}</p>
      {provider === 'mock' ? (
        <InlineWarning>
          模拟翻译会把未收录的中文原样保留，只用于检查界面与对照显示，不是真实翻译。请勿用它生成正式成品。
        </InlineWarning>
      ) : null}

      <div className="settings-row">
        <Field
          label="接口地址"
          hint={
            provider === 'google-free'
              ? '留空使用官方公共地址；也可以通过代理地址访问。'
              : provider === 'mymemory'
                ? '留空使用 https://api.mymemory.translated.net；一般不需要修改。'
                : provider === 'deepl'
                ? '免费版：https://api-free.deepl.com；专业版：https://api.deepl.com'
                : provider === 'openai'
                  ? '例如 https://api.openai.com/v1 或 https://api.deepseek.com/v1，留空使用默认值。'
                  : '模拟模式不需要接口地址。'
          }
        >
          <input
            className="input"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={defaults[provider] || '（不需要）'}
            disabled={provider === 'mock'}
            spellCheck={false}
          />
        </Field>
        <Field label="超时时间（毫秒）" hint="网络较慢时可以适当调大，过小会频繁超时。">
          <input
            className="input"
            type="number"
            min={2000}
            max={120000}
            step={1000}
            value={timeoutMs}
            onChange={(event) => setTimeoutMs(Number(event.target.value) || 20000)}
          />
        </Field>
      </div>

      <SectionLabel hint="服务端访问 Google / MyMemory 时使用">网络代理</SectionLabel>
      <div className="settings-row">
        <Field
          label="代理模式"
          hint="只影响本地服务端访问翻译网站，不改变浏览器代理。"
        >
          <select
            className="input select"
            value={proxyMode}
            onChange={(event) => {
              setProxyMode(event.target.value as 'auto' | 'manual' | 'off');
              setTestResult(null);
              setError(null);
            }}
          >
            <option value="auto">自动检测（环境变量 / Windows 系统代理）</option>
            <option value="manual">手动填写</option>
            <option value="off">不使用代理（直连）</option>
          </select>
        </Field>
        <Field
          label="代理地址"
          hint="HTTP 或 SOCKS。Clash 常见 7890；v2rayN HTTP 常见 10809、SOCKS 常见 10808。"
        >
          <input
            className="input"
            value={proxyUrl}
            onChange={(event) => setProxyUrl(event.target.value)}
            placeholder={
              serverConfig?.hasProxy
                ? `已检测到 ${serverConfig.proxyDisplay} · 留空保持不变`
                : 'http://127.0.0.1:7890'
            }
            disabled={proxyMode !== 'manual'}
            spellCheck={false}
          />
        </Field>
      </div>
      <p className="settings-note">
        {proxyMode === 'off'
          ? '已关闭代理：Node 服务端会直接连接翻译网站。'
          : proxyMode === 'manual'
            ? serverConfig?.hasProxy && serverConfig.proxyMode === 'manual'
              ? `当前手动代理：${serverConfig.proxyDisplay}。留空保存会保持原代理。`
              : '填写 VPN/Clash/v2rayN 的本地 HTTP 或 SOCKS 端口；保存后可点「测试连接」验证。'
            : serverConfig?.hasProxy
              ? `已自动检测到代理：${serverConfig.proxyDisplay}（来源：${
                  serverConfig.proxySource === 'system'
                    ? 'Windows 系统代理'
                    : serverConfig.proxySource === 'env'
                      ? '环境变量'
                      : '配置文件'
                }）。`
              : '未检测到代理。如果浏览器能打开 Google 但工具超时，请改「手动填写」，输入 VPN 的本地端口。'}
      </p>

      {provider === 'openai' ? (
        <Field
          label="模型名称"
          hint="例如 gpt-4o-mini、deepseek-chat。模型需要支持 JSON 输出。"
        >
          <input
            className="input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="gpt-4o-mini"
            spellCheck={false}
          />
        </Field>
      ) : null}

      {info.requiresKey ? (
        <Field
          label="API Key"
          hint={
            serverConfig?.keySource === 'env'
              ? '当前密钥来自服务端环境变量。填写新密钥会保存到服务端配置文件。'
              : '密钥只发送给本地后端并保存在服务端配置文件中，不会写入浏览器存储。'
          }
        >
          <div className="secret-input">
            <input
              className="input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={serverConfig?.hasKey ? '已配置 · 留空保持不变' : '粘贴 API Key'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="icon-btn btn-ghost icon-btn-sm"
              onClick={() => setShowKey((value) => !value)}
              title={showKey ? '隐藏密钥' : '显示密钥'}
              aria-label={showKey ? '隐藏密钥' : '显示密钥'}
            >
              <Icon name="eye" size={16} />
            </button>
          </div>
        </Field>
      ) : null}

      <div className="settings-inline-actions">
        <Button variant="primary" icon="save" loading={saving} onClick={() => void handleSave()}>
          保存翻译配置
        </Button>
        <Button variant="secondary" icon="refresh" loading={testing} onClick={() => void handleTest()}>
          测试连接
        </Button>
        {serverConfig?.hasKey ? (
          <Button variant="ghost" icon="trash" onClick={clearKey}>
            清除密钥
          </Button>
        ) : null}
      </div>

      {error ? <InlineError message={error.message} hint={error.hint} onDismiss={() => setError(null)} /> : null}

      {testResult ? (
        <div className={`test-result ${testResult.mock ? 'is-mock' : ''}`}>
          <div className="test-result-head">
            <Icon name={testResult.mock ? 'alert' : 'check'} size={17} />
            <strong>{testResult.mock ? '模拟翻译连接正常（不是真实翻译）' : '连接成功'}</strong>
            <Badge tone="outline">{testResult.providerLabel}</Badge>
            <span className="meta-text">{testResult.latencyMs} ms</span>
          </div>
          <div className="test-result-sample">
            <span>示例翻译</span>
            <code>{testResult.sample || '（空）'}</code>
          </div>
        </div>
      ) : null}

      <SectionLabel>隐私与服务端配置</SectionLabel>
      <ul className="settings-list">
        <li>
          翻译请求经由本地后端发送，浏览器不会直接调用第三方接口，也不会保存 API Key。
        </li>
        <li>
          代理只用于服务端访问翻译网站，不会修改浏览器代理，也不会改变本地页面连接。
        </li>
        <li>
          服务端配置文件：
          <code title={serverConfig?.configPath ?? undefined}>{configPathLabel}</code>
        </li>
        <li>
          密钥来源：
          {serverConfig?.keySource === 'config'
            ? '服务端配置文件'
            : serverConfig?.keySource === 'env'
              ? '环境变量'
              : '未配置'}
          。也可以用环境变量 <code>PROMPT_STUDIO_TRANSLATE_API_KEY</code> 或 <code>OPENAI_API_KEY</code> 配置。
        </li>
        <li>只有点击翻译时才会发送文本；草稿、LoRA、成品与历史默认不会上传。</li>
        <li>免费公共接口的使用条款与稳定性由第三方决定，本应用不对其可用性作保证。</li>
      </ul>
    </div>
  );
}
