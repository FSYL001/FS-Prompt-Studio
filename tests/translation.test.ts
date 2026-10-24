import { beforeEach, describe, expect, it } from 'vitest';
import {
  protectPromptSyntax,
  restorePromptSyntax,
} from '../server/translate/guard.js';
import { clearTranslationCache, translateSegments, testTranslation } from '../server/translate/index.js';
import { TranslationError } from '../server/translate/types.js';
import { mockProvider } from '../server/translate/providers/mock.js';

const mockConfig = {
  provider: 'mock' as const,
  baseUrl: '',
  model: '',
  timeoutMs: 5000,
  apiKey: '',
};

describe('提示词语法保护', () => {
  it('保护 LoRA 标签、BREAK 与权重数字', () => {
    const source = '(white hair:1.2), <lora:style_xyz:0.8>, BREAK, (long hair:0.9)';
    const guarded = protectPromptSyntax(source);
    expect(guarded.text).not.toContain('<lora:');
    expect(guarded.text).not.toContain('BREAK');
    expect(guarded.text).not.toContain(':1.2');
    expect(restorePromptSyntax(guarded.text, guarded.tokens)).toBe(source);
  });

  it('翻译服务移动占位符位置时仍能恢复并清理空格', () => {
    const guarded = protectPromptSyntax('(white hair:1.2)');
    const translated = '(white hair [[PS0]])';
    const restored = restorePromptSyntax(translated, guarded.tokens);
    expect(restored).toBe('(white hair:1.2)');
  });

  it('保护 @触发词 与已知 LoRA 触发词，不翻译成普通词义', () => {
    const source = '@dizzy, watercolor_style, 一个白发女孩';
    const guarded = protectPromptSyntax(source, ['watercolor_style']);
    expect(guarded.text).not.toContain('@dizzy');
    expect(guarded.text).not.toContain('watercolor_style');
    expect(restorePromptSyntax(guarded.text, guarded.tokens)).toBe(source);
  });

  it('占位符丢失时取消本次翻译，避免破坏语法', () => {
    const guarded = protectPromptSyntax('<lora:style:0.8>');
    expect(() => restorePromptSyntax('a lora style', guarded.tokens)).toThrow(TranslationError);
  });
});

describe('翻译编排（模拟服务）', () => {
  beforeEach(() => {
    clearTranslationCache();
    expect(mockProvider.translate).toBeTypeOf('function');
  });

  it('保持顺序、跳过无需翻译的片段并收集缓存状态', async () => {
    const first = await translateSegments({
      segments: [
        { id: 'a', text: '一个白发女孩，穿着黑色连衣裙' },
        { id: 'b', text: 'long hair' },
        { id: 'c', text: '蓝色眼睛' },
      ],
      direction: 'zh-en',
      config: mockConfig,
    });
    expect(first.mock).toBe(true);
    expect(first.results.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(first.results[1].skipped).toBe(true);
    expect(first.results[1].text).toBe('long hair');
    expect(first.results[0].text.toLowerCase()).toContain('girl');
    expect(first.results[0].text.toLowerCase()).toContain('dress');

    const second = await translateSegments({
      segments: [{ id: 'a', text: '一个白发女孩，穿着黑色连衣裙' }],
      direction: 'zh-en',
      config: mockConfig,
    });
    expect(second.results[0].cached).toBe(true);
    expect(second.results[0].text).toBe(first.results[0].text);
  });

  it('翻译带权重的片段时保留语法', async () => {
    const result = await translateSegments({
      segments: [{ id: 'w', text: '(白发:1.2)' }],
      direction: 'zh-en',
      config: mockConfig,
    });
    expect(result.results[0].text).toContain(':1.2');
    expect(result.results[0].text).toContain('white hair');
  });

  it('真实翻译流程中保留 @dizzy 触发词', async () => {
    const result = await translateSegments({
      segments: [{ id: 't', text: '@dizzy, 一个白发女孩' }],
      direction: 'zh-en',
      protectedTerms: ['dizzy'],
      config: mockConfig,
    });
    expect(result.results[0].text).toContain('@dizzy');
    expect(result.results[0].text.toLowerCase()).toContain('girl');
  });

  it('英文转中文可用', async () => {
    const result = await translateSegments({
      segments: [{ id: 'r', text: 'long hair' }],
      direction: 'en-zh',
      config: mockConfig,
    });
    expect(result.results[0].text).toBe('长发');
  });

  it('没有 API Key 时明确报错，不返回伪造结果', async () => {
    await expect(
      translateSegments({
        segments: [{ id: 'x', text: '长发' }],
        direction: 'zh-en',
        config: {
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          timeoutMs: 5000,
          apiKey: '',
        },
      }),
    ).rejects.toMatchObject({ code: 'NO_KEY' });
  });

  it('连接测试在模拟模式下标记 mock', async () => {
    const result = await testTranslation(mockConfig);
    expect(result.mock).toBe(true);
    expect(result.sample.length).toBeGreaterThan(0);
    expect(result.provider).toBe('mock');
  });

  it('模拟翻译不会假装翻译未知中文', async () => {
    const result = await translateSegments({
      segments: [{ id: 'u', text: '未知的奇幻生物' }],
      direction: 'zh-en',
      config: mockConfig,
    });
    expect(result.results[0].text).toContain('未知');
    expect(result.mock).toBe(true);
  });
});
