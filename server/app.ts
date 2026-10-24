import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError, z } from 'zod';
import {
  ConfigError,
  getPublicTranslateConfig,
  getTranslateConfig,
  saveTranslateConfig,
} from './config.js';
import { translateSegments, testTranslation, getProvider } from './translate/index.js';
import { TranslationError, providerRequiresKey } from './translate/types.js';
import type { ProviderId, TranslateConfig } from './translate/types.js';

const ProviderEnum = z.enum(['google-free', 'openai', 'deepl', 'mock']);

const TranslateBodySchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string().min(1).max(160),
        text: z.string().max(20000),
      }),
    )
    .min(1)
    .max(150),
  direction: z.enum(['zh-en', 'en-zh']),
  mode: z.enum(['faithful', 'natural']).optional(),
  dictionary: z
    .array(z.object({ cn: z.string().max(200), en: z.string().max(400) }))
    .max(300)
    .optional(),
  protectedTerms: z.array(z.string().max(200)).max(200).optional(),
});

const ConfigBodySchema = z.object({
  provider: ProviderEnum.optional(),
  baseUrl: z.string().max(400).optional(),
  model: z.string().max(160).optional(),
  timeoutMs: z.number().int().min(2000).max(120000).optional(),
  apiKey: z.string().max(500).optional(),
});

const TestBodySchema = z.object({
  provider: ProviderEnum.optional(),
  baseUrl: z.string().max(400).optional(),
  model: z.string().max(160).optional(),
  timeoutMs: z.number().int().min(2000).max(120000).optional(),
  apiKey: z.string().max(500).optional(),
});

function configFromTestBody(body: z.infer<typeof TestBodySchema>): TranslateConfig {
  const saved = getTranslateConfig();
  const provider = (body.provider ?? saved.provider) as ProviderId;
  const providerChanged = provider !== saved.provider;
  return {
    provider,
    baseUrl: body.baseUrl ?? (providerChanged ? '' : saved.baseUrl),
    model: body.model ?? (providerChanged ? 'gpt-4o-mini' : saved.model),
    timeoutMs: body.timeoutMs ?? saved.timeoutMs,
    apiKey:
      body.apiKey !== undefined
        ? body.apiKey
        : providerChanged
          ? ''
          : saved.apiKey,
  };
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    const config = getPublicTranslateConfig();
    res.json({
      ok: true,
      app: 'prompt-studio',
      version: 1,
      provider: config.provider,
      providerLabel: config.label,
      isMock: config.isMock,
      hasKey: config.hasKey,
    });
  });

  app.get('/api/translate/config', (_req, res) => {
    res.json({ config: getPublicTranslateConfig() });
  });

  app.put('/api/translate/config', (req, res, next) => {
    try {
      const body = ConfigBodySchema.parse(req.body ?? {});
      const config = saveTranslateConfig(body);
      res.json({ ok: true, config });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/translate/test', async (req, res, next) => {
    try {
      const body = TestBodySchema.parse(req.body ?? {});
      const config = configFromTestBody(body);
      if (providerRequiresKey(config.provider) && !config.apiKey.trim()) {
        throw new TranslationError(
          '还没有填写 API Key，无法测试。请填写后再测试连接。',
          'NO_KEY',
        );
      }
      const result = await testTranslation(config);
      res.json({ ...result, providerLabel: getProvider(config.provider).label });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/translate', async (req, res, next) => {
    try {
      const body = TranslateBodySchema.parse(req.body ?? {});
      const result = await translateSegments({
        segments: body.segments,
        direction: body.direction,
        mode: body.mode,
        dictionary: body.dictionary,
        protectedTerms: body.protectedTerms,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // 未匹配的 /api 请求返回 JSON，而不是 SPA 页面
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: '接口不存在，请检查地址。' },
    });
  });

  const distDir = path.join(process.cwd(), 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (/\.(js|css|woff2?|png|svg)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      const detail = error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '参数'}：${issue.message}`)
        .join('；');
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `请求参数不正确（${detail}）。`,
        },
      });
      return;
    }
    if (error instanceof SyntaxError && 'status' in error && (error as { status?: number }).status === 400) {
      res.status(400).json({
        error: { code: 'BAD_JSON', message: '请求内容不是合法的 JSON。' },
      });
      return;
    }
    if (error instanceof ConfigError) {
      res.status(400).json({
        error: { code: 'CONFIG_ERROR', message: error.message },
      });
      return;
    }
    if (error instanceof TranslationError) {
      const status = error.code === 'NO_KEY' || error.code === 'TOO_LONG' ? 400 : 502;
      res.status(status).json({
        error: {
          code: error.code,
          message: error.message,
          hint: error.hint,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('request entity too large')) {
      res.status(413).json({
        error: { code: 'TOO_LARGE', message: '请求内容过大，请分段处理。' },
      });
      return;
    }
    console.error('[prompt-studio] 未处理的错误：', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: '服务器出现意外错误，请稍后重试。如果持续出现，请查看服务端日志。',
      },
    });
  });

  return app;
}
