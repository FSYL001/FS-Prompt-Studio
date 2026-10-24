import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BASE_URLS,
  PROVIDER_LABELS,
  providerRequiresKey,
} from './translate/types.js';
import type { ProviderId, TranslateConfig } from './translate/types.js';

/**
 * 服务端翻译配置。
 * API Key 只存在服务端配置文件（默认 server/data/translate-config.json）或环境变量中，
 * 客户端接口永远不会返回密钥明文。
 */

const DATA_DIR = process.env.PROMPT_STUDIO_DATA_DIR
  ? path.resolve(process.env.PROMPT_STUDIO_DATA_DIR)
  : path.join(process.cwd(), 'server', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'translate-config.json');

const VALID_PROVIDERS: ProviderId[] = ['google-free', 'openai', 'deepl', 'mock'];

interface StoredConfig {
  provider?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
}

export interface PublicTranslateConfig {
  provider: ProviderId;
  label: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keySource: 'config' | 'env' | 'none';
  requiresKey: boolean;
  isMock: boolean;
  dataDestination: string;
  defaultBaseUrls: Record<ProviderId, string>;
  configPath: string;
}

function readStored(): StoredConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredConfig) : {};
  } catch {
    return {};
  }
}

function envString(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProvider(raw: string): ProviderId {
  const value = raw.trim().toLowerCase();
  return (VALID_PROVIDERS as string[]).includes(value) ? (value as ProviderId) : 'google-free';
}

function envKeyFor(provider: ProviderId): string {
  const generic = envString('PROMPT_STUDIO_TRANSLATE_API_KEY');
  if (generic) return generic;
  if (provider === 'openai') return envString('OPENAI_API_KEY');
  if (provider === 'deepl') return envString('DEEPL_API_KEY');
  return '';
}

export interface ResolvedConfig {
  config: TranslateConfig;
  keySource: 'config' | 'env' | 'none';
  fileApiKey: string;
}

export function resolveTranslateConfig(): ResolvedConfig {
  const stored = readStored();
  const envProvider = envString('PROMPT_STUDIO_TRANSLATE_PROVIDER');
  const provider = normalizeProvider(
    typeof stored.provider === 'string' && stored.provider
      ? stored.provider
      : envProvider || 'google-free',
  );
  const baseUrl =
    (typeof stored.baseUrl === 'string' ? stored.baseUrl.trim() : '') ||
    envString('PROMPT_STUDIO_TRANSLATE_BASE_URL') ||
    '';
  const model =
    (typeof stored.model === 'string' ? stored.model.trim() : '') ||
    envString('PROMPT_STUDIO_TRANSLATE_MODEL') ||
    'gpt-4o-mini';
  const storedTimeout =
    typeof stored.timeoutMs === 'number' && Number.isFinite(stored.timeoutMs)
      ? stored.timeoutMs
      : undefined;
  const envTimeout = Number(envString('PROMPT_STUDIO_TRANSLATE_TIMEOUT_MS'));
  const timeoutMs = Math.min(
    120000,
    Math.max(2000, storedTimeout ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 20000)),
  );
  const fileApiKey = typeof stored.apiKey === 'string' ? stored.apiKey.trim() : '';
  const envApiKey = envKeyFor(provider);
  const apiKey = fileApiKey || envApiKey;

  return {
    config: { provider, baseUrl, model, timeoutMs, apiKey },
    keySource: fileApiKey ? 'config' : envApiKey ? 'env' : 'none',
    fileApiKey,
  };
}

export function getTranslateConfig(): TranslateConfig {
  return resolveTranslateConfig().config;
}

function destinationFor(config: TranslateConfig): string {
  switch (config.provider) {
    case 'mock':
      return '本机（不会发送到网络）';
    case 'google-free':
      return config.baseUrl || DEFAULT_BASE_URLS['google-free'];
    case 'openai':
      return config.baseUrl || DEFAULT_BASE_URLS.openai;
    case 'deepl':
      return config.baseUrl || DEFAULT_BASE_URLS.deepl;
  }
}

export function getPublicTranslateConfig(): PublicTranslateConfig {
  const resolved = resolveTranslateConfig();
  const config = resolved.config;
  return {
    provider: config.provider,
    label: PROVIDER_LABELS[config.provider],
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    hasKey: Boolean(config.apiKey),
    keySource: resolved.keySource,
    requiresKey: providerRequiresKey(config.provider),
    isMock: config.provider === 'mock',
    dataDestination: destinationFor(config),
    defaultBaseUrls: DEFAULT_BASE_URLS,
    configPath: CONFIG_PATH,
  };
}

export interface ConfigPatch {
  provider?: ProviderId;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** undefined = 保持不变；空字符串 = 清除；其它 = 保存新密钥 */
  apiKey?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function assertUrl(baseUrl: string): void {
  if (!baseUrl) return;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ConfigError('接口地址格式不正确，需要以 http:// 或 https:// 开头。');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError('接口地址只支持 http:// 或 https://。');
  }
}

export function saveTranslateConfig(patch: ConfigPatch): PublicTranslateConfig {
  const current = readStored();
  const currentResolved = resolveTranslateConfig();
  const provider = patch.provider
    ? ((VALID_PROVIDERS as string[]).includes(patch.provider)
        ? patch.provider
        : (() => {
            throw new ConfigError('不支持的翻译服务类型。');
          })())
    : normalizeProvider(
        typeof current.provider === 'string' && current.provider
          ? current.provider
          : currentResolved.config.provider,
      );

  const baseUrl = patch.baseUrl !== undefined ? patch.baseUrl.trim() : (current.baseUrl ?? '');
  assertUrl(baseUrl);
  const model = patch.model !== undefined ? patch.model.trim() : (current.model ?? '');
  if (model.length > 160) throw new ConfigError('模型名称过长。');

  let timeoutMs =
    patch.timeoutMs !== undefined
      ? patch.timeoutMs
      : typeof current.timeoutMs === 'number'
        ? current.timeoutMs
        : currentResolved.config.timeoutMs;
  if (!Number.isFinite(timeoutMs)) timeoutMs = 20000;
  timeoutMs = Math.min(120000, Math.max(2000, Math.round(timeoutMs)));

  let apiKey: string;
  if (patch.apiKey === undefined) {
    apiKey = typeof current.apiKey === 'string' ? current.apiKey : '';
  } else {
    apiKey = patch.apiKey.trim();
    if (apiKey.length > 500) throw new ConfigError('API Key 过长，请检查是否粘贴了多余内容。');
  }

  const next: StoredConfig = {
    provider,
    baseUrl,
    model,
    timeoutMs,
    apiKey,
  };

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
    try {
      fs.chmodSync(CONFIG_PATH, 0o600);
    } catch {
      /* Windows 上可能不支持，忽略 */
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`保存翻译配置失败：${reason}`);
  }

  return getPublicTranslateConfig();
}

/** 供测试使用：修改数据目录后重新加载。 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
