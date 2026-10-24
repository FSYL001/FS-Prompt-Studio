import { z } from 'zod';

/**
 * 全局数据结构定义。
 * 所有需要持久化 / 导入导出的数据都先经过这里的 Zod Schema 校验，
 * 避免损坏的本地数据或恶意 JSON 进入应用状态。
 */

export const MODEL_TYPES = ['sd15', 'sdxl', 'flux', 'comfyui', 'custom'] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

export const PRESET_IDS = ['sd15', 'sdxl', 'flux', 'comfyui', 'custom'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const LORA_FORMATS = ['sd', 'comfyui-text', 'custom'] as const;
export type LoraFormat = (typeof LORA_FORMATS)[number];

export const OUTPUT_FORMATS = ['tags', 'lines', 'custom'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const LANGUAGES = ['zh', 'en', 'mixed', 'unknown'] as const;
export type Lang = (typeof LANGUAGES)[number];

export const DIRECTIONS = ['zh-en', 'en-zh'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const TRANSLATE_MODES = ['faithful', 'natural'] as const;
export type TranslateMode = (typeof TRANSLATE_MODES)[number];

export const PROVIDERS = ['google-free', 'openai', 'deepl', 'mock'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEMES)[number];

export const POLARITIES = ['positive', 'negative'] as const;
export type Polarity = (typeof POLARITIES)[number];

const shortText = (max: number) => z.string().max(max).default('');

export const IdSchema = z.string().min(1).max(160);

export const OutputConfigSchema = z.object({
  format: z.enum(OUTPUT_FORMATS).default('tags'),
  separator: z.string().max(24).default(', '),
  customSeparator: z.string().max(24).default(', '),
  includeWeights: z.boolean().default(true),
  includeTriggers: z.boolean().default(true),
  includeChineseComments: z.boolean().default(false),
  includeParams: z.boolean().default(false),
  pureEnglish: z.boolean().default(true),
  negativeSeparate: z.boolean().default(true),
  loraFormat: z.enum(LORA_FORMATS).default('sd'),
  loraTokenTemplate: z.string().max(160).default('<lora:{file}:{weight}>'),
  useCustomTemplate: z.boolean().default(false),
  customOutputTemplate: z
    .string()
    .max(2000)
    .default('{positive}\nNegative prompt: {negative}\n{loras}'),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const PromptParamsSchema = z.object({
  modelType: z.enum(MODEL_TYPES).default('sdxl'),
  modelName: shortText(160),
  steps: z.number().int().min(1).max(300).default(30),
  cfg: z.number().min(0).max(60).default(7),
  sampler: shortText(120).default('DPM++ 2M Karras'),
  seed: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER).default(-1),
  width: z.number().int().min(64).max(8192).default(1024),
  height: z.number().int().min(64).max(8192).default(1024),
  clipSkip: z.number().int().min(0).max(20).default(2),
});
export type PromptParams = z.infer<typeof PromptParamsSchema>;

export const PromptSegmentSchema = z.object({
  id: IdSchema,
  text: z.string().max(8000).default(''),
  translated: z.string().max(8000).default(''),
  polarity: z.enum(POLARITIES).default('positive'),
  locked: z.boolean().default(false),
  weight: z.number().min(-10).max(10).nullable().default(null),
});
export type PromptSegment = z.infer<typeof PromptSegmentSchema>;

export const ProductLoraSchema = z.object({
  loraId: IdSchema.nullable().default(null),
  name: z.string().max(160).default(''),
  file: z.string().max(400).default(''),
  weight: z.number().min(-10).max(10).default(0.8),
  triggerWords: z.array(z.string().max(200)).max(50).default([]),
  enabled: z.boolean().default(true),
});
export type ProductLora = z.infer<typeof ProductLoraSchema>;

export const AlignmentPairSchema = z.object({
  source: z.string().max(8000),
  target: z.string().max(8000),
  sourceStart: z.number().int().min(0),
  sourceEnd: z.number().int().min(0),
  targetStart: z.number().int().min(0),
  targetEnd: z.number().int().min(0),
  granularity: z.enum(['segment', 'sentence']).default('segment'),
  /** 该片段未经过翻译服务（例如已经是目标语言、或包含特殊语法），表示如实保留。 */
  unchanged: z.boolean().optional(),
  /** 对齐/翻译存在不确定性时标记，UI 会提示。 */
  uncertain: z.boolean().optional(),
});
export type AlignmentPair = z.infer<typeof AlignmentPairSchema>;

export const AlignmentSchema = z.object({
  direction: z.enum(DIRECTIONS),
  sourceLang: z.enum(['zh', 'en', 'mixed']),
  targetLang: z.enum(['zh', 'en']),
  sourceText: z.string().max(100000),
  targetText: z.string().max(100000),
  pairs: z.array(AlignmentPairSchema).max(4000),
  provider: z.string().max(80).optional(),
  mock: z.boolean().optional(),
  createdAt: z.string().max(40),
});
export type Alignment = z.infer<typeof AlignmentSchema>;

export const LoraSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(160),
  file: z.string().max(400).default(''),
  triggerWords: z.array(z.string().max(200)).max(50).default([]),
  descCn: z.string().max(4000).default(''),
  descEn: z.string().max(4000).default(''),
  defaultWeight: z.number().min(-10).max(10).default(0.8),
  weightMin: z.number().min(-10).max(10).default(0),
  weightMax: z.number().min(-10).max(10).default(1.5),
  modelTypes: z.array(z.enum(MODEL_TYPES)).max(8).default(['sd15', 'sdxl', 'flux', 'comfyui']),
  category: z.string().max(80).default('未分类'),
  notes: z.string().max(4000).default(''),
  favorite: z.boolean().default(false),
  enabled: z.boolean().default(true),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type Lora = z.infer<typeof LoraSchema>;

export const DictionaryEntrySchema = z.object({
  cn: z.string().min(1).max(200),
  en: z.string().max(400).default(''),
});
export type DictionaryEntry = z.infer<typeof DictionaryEntrySchema>;

export const WorkflowTemplateSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  json: z.string().max(2_000_000).default(''),
  mapping: z
    .object({
      positiveNodeId: z.string().max(40).default(''),
      negativeNodeId: z.string().max(40).default(''),
      loraLoaderNodeIds: z.array(z.string().max(40)).max(50).default([]),
      checkpointNodeId: z.string().max(40).default(''),
    })
    .default({}),
  createdAt: z.string().max(40),
});
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;

export const SettingsSchema = z.object({
  id: z.string().default('settings:current'),
  theme: z.enum(THEMES).default('system'),
  generationUrl: z.string().max(2000).default('http://127.0.0.1:8188/'),
  presetId: z.enum(PRESET_IDS).default('sdxl'),
  output: OutputConfigSchema.default({}),
  translateMode: z.enum(TRANSLATE_MODES).default('faithful'),
  translator: z
    .object({
      provider: z.enum(PROVIDERS).default('google-free'),
      baseUrl: z.string().max(400).default(''),
      model: z.string().max(160).default('gpt-4o-mini'),
      timeoutMs: z.number().int().min(2000).max(120000).default(20000),
    })
    .default({}),
  dictionary: z.array(DictionaryEntrySchema).max(500).default([]),
  workflows: z.array(WorkflowTemplateSchema).max(30).default([]),
  activeWorkflowId: z.string().max(160).nullable().default(null),
  onboardingSeen: z.boolean().default(false),
  advancedOpen: z.boolean().default(false),
  historyLimit: z.number().int().min(20).max(5000).default(500),
  updatedAt: z.string().max(40).default(''),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().default('workspace:current'),
  draftText: z.string().max(100000).default(''),
  translationZhText: z.string().max(100000).default(''),
  englishText: z.string().max(100000).default(''),
  negativeText: z.string().max(100000).default(''),
  alignment: AlignmentSchema.nullable().default(null),
  segments: z.array(PromptSegmentSchema).max(500).default([]),
  segmentsMode: z.boolean().default(false),
  activeLoras: z.array(ProductLoraSchema).max(100).default([]),
  params: PromptParamsSchema.default({}),
  presetId: z.enum(PRESET_IDS).default('sdxl'),
  notes: z.string().max(20000).default(''),
  updatedAt: z.string().max(40).default(''),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceSnapshotSchema = z.object({
  draftText: z.string().max(100000).default(''),
  translationZhText: z.string().max(100000).default(''),
  englishText: z.string().max(100000).default(''),
  negativeText: z.string().max(100000).default(''),
  alignment: AlignmentSchema.nullable().default(null),
  segments: z.array(PromptSegmentSchema).max(500).default([]),
  activeLoras: z.array(ProductLoraSchema).max(100).default([]),
  params: PromptParamsSchema.default({}),
  presetId: z.enum(PRESET_IDS).default('sdxl'),
  notes: z.string().max(20000).default(''),
});
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;

export const ProductSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  positive: z.string().max(100000).default(''),
  negative: z.string().max(100000).default(''),
  final: z.string().max(120000).default(''),
  draftText: z.string().max(100000).default(''),
  translationZhText: z.string().max(100000).default(''),
  englishText: z.string().max(100000).default(''),
  negativeText: z.string().max(100000).default(''),
  alignment: AlignmentSchema.nullable().default(null),
  segments: z.array(PromptSegmentSchema).max(500).default([]),
  loras: z.array(ProductLoraSchema).max(100).default([]),
  params: PromptParamsSchema.default({}),
  presetId: z.enum(PRESET_IDS).default('sdxl'),
  output: OutputConfigSchema.default({}),
  notes: z.string().max(20000).default(''),
  favorite: z.boolean().default(false),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type Product = z.infer<typeof ProductSchema>;

export const HistoryEntrySchema = z.object({
  id: IdSchema,
  type: z.enum(['product', 'draft', 'manual']).default('manual'),
  name: z.string().min(1).max(200),
  favorite: z.boolean().default(false),
  createdAt: z.string().max(40),
  productId: IdSchema.nullable().default(null),
  snapshot: WorkspaceSnapshotSchema,
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const BackupSchema = z.object({
  app: z.literal('prompt-studio'),
  formatVersion: z.literal(1),
  exportedAt: z.string().max(40),
  data: z.object({
    settings: SettingsSchema,
    loras: z.array(LoraSchema).max(5000),
    products: z.array(ProductSchema).max(5000),
    history: z.array(HistoryEntrySchema).max(10000),
    workspace: WorkspaceSchema.nullable().default(null),
  }),
});
export type Backup = z.infer<typeof BackupSchema>;

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export const DEFAULT_WORKSPACE: Workspace = WorkspaceSchema.parse({});
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
export const DEFAULT_PARAMS: PromptParams = PromptParamsSchema.parse({});
export const DEFAULT_OUTPUT: OutputConfig = OutputConfigSchema.parse({});

export function safeParseSettings(raw: unknown): Settings {
  const parsed = SettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // 兼容旧版本缺少字段的情况：合并默认值后再解析。
  const merged = SettingsSchema.safeParse({
    ...DEFAULT_SETTINGS,
    ...(typeof raw === 'object' && raw ? raw : {}),
  });
  return merged.success ? merged.data : DEFAULT_SETTINGS;
}

export function safeParseWorkspace(raw: unknown): Workspace {
  const parsed = WorkspaceSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_WORKSPACE;
  const workspace = parsed.data;
  // 兼容旧版本：旧草稿没有独立的中文翻译框，用草稿内容回填，避免用户内容“消失”。
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !('translationZhText' in raw) &&
    workspace.draftText &&
    !workspace.translationZhText
  ) {
    return { ...workspace, translationZhText: workspace.draftText };
  }
  return workspace;
}
