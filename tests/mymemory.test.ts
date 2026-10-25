import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestText = vi.fn();

vi.mock('../server/translate/net.js', () => ({ requestText }));

const { myMemoryProvider } = await import('../server/translate/providers/mymemory.js');

const config = {
  provider: 'mymemory' as const,
  baseUrl: '',
  model: '',
  timeoutMs: 5000,
  apiKey: '',
  proxyMode: 'manual' as const,
  proxyUrl: 'http://127.0.0.1:7890',
};

describe('MyMemory 免费备用', () => {
  beforeEach(() => requestText.mockReset());

  it('使用 langpair 并在配置代理时传入代理', async () => {
    requestText.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        responseStatus: 200,
        responseData: { translatedText: 'a white-haired girl' },
      }),
    });

    const result = await myMemoryProvider.translate({
      texts: ['一个白发女孩'],
      direction: 'zh-en',
      mode: 'faithful',
      dictionary: [],
      config,
    });

    expect(result).toEqual(['a white-haired girl']);
    const [url, options] = requestText.mock.calls[0];
    expect(url).toContain('langpair=zh-CN%7Cen');
    expect(options.proxyUrl).toBe('http://127.0.0.1:7890');
  });

  it('把 MyMemory 的额度警告转成可读错误', async () => {
    requestText.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        responseStatus: 200,
        responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' },
      }),
    });

    await expect(
      myMemoryProvider.translate({
        texts: ['测试'],
        direction: 'zh-en',
        mode: 'faithful',
        dictionary: [],
        config,
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });
});
