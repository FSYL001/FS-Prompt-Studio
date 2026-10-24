import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

let server: Server;
let baseUrl = '';
let tempDir = '';

async function api(pathname: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'prompt-studio-test-'));
  process.env.PROMPT_STUDIO_DATA_DIR = tempDir;
  const { saveTranslateConfig } = await import('../server/config.js');
  saveTranslateConfig({ provider: 'mock', baseUrl: '', model: '', timeoutMs: 5000, apiKey: '' });
  const { createApp } = await import('../server/app.js');
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法获取测试端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe('后端 API', () => {
  it('健康检查返回当前翻译服务状态', async () => {
    const result = await api('/api/health');
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.provider).toBe('mock');
    expect(result.body.isMock).toBe(true);
  });

  it('翻译接口返回顺序一致的结果并跳过英文片段', async () => {
    const result = await api('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        segments: [
          { id: 's1', text: '一个白发女孩，穿着黑色连衣裙' },
          { id: 's2', text: 'long hair' },
        ],
        direction: 'zh-en',
        mode: 'faithful',
      }),
    });
    expect(result.status).toBe(200);
    expect(result.body.mock).toBe(true);
    expect(result.body.results).toHaveLength(2);
    expect(result.body.results[0].text.toLowerCase()).toContain('girl');
    expect(result.body.results[1].skipped).toBe(true);
    expect(result.body.results[1].text).toBe('long hair');
  });

  it('翻译接口保护 LoRA 触发词', async () => {
    const result = await api('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        segments: [{ id: 'trigger', text: '@dizzy, 一个白发女孩' }],
        direction: 'zh-en',
        protectedTerms: ['dizzy'],
      }),
    });
    expect(result.status).toBe(200);
    expect(result.body.results[0].text).toContain('@dizzy');
  });

  it('参数错误返回中文提示', async () => {
    const result = await api('/api/translate', {
      method: 'POST',
      body: JSON.stringify({ segments: [], direction: 'zh-en' }),
    });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('BAD_REQUEST');
    expect(result.body.error.message).toContain('请求参数不正确');
  });

  it('连接测试返回模拟结果标记', async () => {
    const result = await api('/api/translate/test', { method: 'POST', body: '{}' });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.mock).toBe(true);
    expect(result.body.providerLabel).toContain('模拟');
  });

  it('保存配置后不回传密钥明文', async () => {
    const save = await api('/api/translate/config', {
      method: 'PUT',
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.example.com/v1',
        model: 'test-model',
        timeoutMs: 8000,
        apiKey: 'sk-super-secret-value',
      }),
    });
    expect(save.status).toBe(200);
    expect(save.body.config.hasKey).toBe(true);
    expect(save.body.config.keySource).toBe('config');
    expect(JSON.stringify(save.body)).not.toContain('sk-super-secret-value');

    const get = await api('/api/translate/config');
    expect(get.body.config.provider).toBe('openai');
    expect(get.body.config.model).toBe('test-model');
    expect(JSON.stringify(get.body)).not.toContain('sk-super-secret-value');
  });

  it('缺少密钥的服务明确返回 NO_KEY，而不是伪造翻译', async () => {
    await api('/api/translate/config', {
      method: 'PUT',
      body: JSON.stringify({ provider: 'openai', apiKey: '' }),
    });
    const result = await api('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        segments: [{ id: 's1', text: '长发' }],
        direction: 'zh-en',
      }),
    });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('NO_KEY');
    expect(result.body.error.message).toContain('API Key');
  });

  it('接口地址校验失败时给出可理解的中文错误', async () => {
    const result = await api('/api/translate/config', {
      method: 'PUT',
      body: JSON.stringify({ baseUrl: 'ftp://example.com' }),
    });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain('http');
  });

  it('未知接口返回 JSON 404', async () => {
    const result = await api('/api/nope');
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
  });

  it('测试结束后恢复模拟配置', async () => {
    const result = await api('/api/translate/config', {
      method: 'PUT',
      body: JSON.stringify({ provider: 'mock', baseUrl: '', model: '', apiKey: '' }),
    });
    expect(result.body.config.isMock).toBe(true);
  });
});
