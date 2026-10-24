import { fetchText, describeHttpError } from '../http.js';
import { TranslationError, DEFAULT_BASE_URLS } from '../types.js';
import type { ProviderTranslateRequest, TranslationProvider } from '../types.js';

function chatCompletionsUrl(baseUrl: string): string {
  const base = (baseUrl || DEFAULT_BASE_URLS.openai).trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function buildSystemPrompt(request: ProviderTranslateRequest): string {
  const target = request.direction === 'zh-en' ? 'English' : 'Simplified Chinese';
  const source = request.direction === 'zh-en' ? 'Chinese' : 'English';
  const mode =
    request.mode === 'natural'
      ? 'Prefer fluent, natural sentences that read well for image generation. Keep the meaning exact.'
      : 'Translate faithfully and concisely. For short tags or phrases, use standard concise image-prompt vocabulary instead of explanatory sentences. Do not make sentences longer than necessary.';

  const glossary = request.dictionary
    .filter((entry) => entry.cn.trim() && entry.en.trim())
    .slice(0, 200)
    .map((entry) =>
      request.direction === 'zh-en' ? `- ${entry.cn} => ${entry.en}` : `- ${entry.en} => ${entry.cn}`,
    );

  return [
    `You are a precise translator for AI image-generation prompts. Translate each input segment from ${source} to ${target}.`,
    mode,
    'Hard rules:',
    '- Translate only the given text. Never add characters, clothing, actions, quality words, artists, camera details, styles, or negative prompts that are not present.',
    '- Preserve placeholders exactly as written, for example [[PS0]], [[PS1]]. Never translate, reorder, or remove them.',
    '- Preserve line-level meaning; keep short tags as short tags and complete sentences as complete sentences.',
    '- If a segment is already in the target language, return it unchanged.',
    '- Return ONLY a JSON object with the exact shape {"translations": ["...", "..."]}. The array must contain exactly one string per input segment, in the same order. No markdown, no explanation.',
    glossary.length > 0 ? 'User glossary (must be respected):\n' + glossary.join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function extractContent(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new TranslationError('翻译服务返回了无法识别的数据。', 'BAD_RESPONSE');
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    const errorMessage = (payload as { error?: { message?: unknown } }).error?.message;
    throw new TranslationError(
      typeof errorMessage === 'string' ? `翻译服务报错：${errorMessage}` : '翻译服务没有返回结果。',
      'BAD_RESPONSE',
    );
  }
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part && 'text' in part
          ? String((part as { text?: unknown }).text ?? '')
          : '',
      )
      .join('');
  }
  throw new TranslationError('翻译服务返回内容为空。', 'BAD_RESPONSE');
}

function parseTranslations(content: string, expected: number): string[] {
  let raw = content.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const objectStart = raw.indexOf('{');
    const objectEnd = raw.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      try {
        parsed = JSON.parse(raw.slice(objectStart, objectEnd + 1));
      } catch {
        parsed = undefined;
      }
    }
    if (parsed === undefined) {
      const arrayStart = raw.indexOf('[');
      const arrayEnd = raw.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        try {
          parsed = JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
        } catch {
          parsed = undefined;
        }
      }
    }
  }

  let list: unknown = parsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    list = (parsed as { translations?: unknown }).translations;
  }
  if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
    throw new TranslationError(
      '翻译服务返回的格式不符合要求，本次翻译已取消，原内容没有被修改。',
      'BAD_RESPONSE',
      '可以在设置中换用其它翻译服务。',
    );
  }
  if (list.length !== expected) {
    throw new TranslationError(
      `翻译服务返回了 ${list.length} 条结果，但需要 ${expected} 条，本次翻译已取消。`,
      'COUNT_MISMATCH',
    );
  }
  return (list as string[]).map((item) => item.trim());
}

export const openaiProvider: TranslationProvider = {
  id: 'openai',
  label: 'OpenAI 兼容接口',
  requiresKey: true,
  maxChars: 12000,
  async translate(request: ProviderTranslateRequest): Promise<string[]> {
    if (!request.config.apiKey.trim()) {
      throw new TranslationError(
        '尚未配置 OpenAI 兼容接口的 API Key。请在「设置 → 翻译服务」中填写并保存。',
        'NO_KEY',
        '密钥只保存在服务端的配置文件中，不会写入浏览器存储。',
      );
    }
    const { status, body } = await fetchText(
      chatCompletionsUrl(request.config.baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: request.config.model || 'gpt-4o-mini',
          temperature: 0.1,
          messages: [
            { role: 'system', content: buildSystemPrompt(request) },
            {
              role: 'user',
              content: JSON.stringify({ segments: request.texts }),
            },
          ],
        }),
      },
      { timeoutMs: request.config.timeoutMs },
    );

    if (status < 200 || status >= 300) throw describeHttpError(status, body);
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new TranslationError('翻译服务返回了无法解析的 JSON。', 'BAD_RESPONSE', body.slice(0, 200));
    }
    return parseTranslations(extractContent(payload), request.texts.length);
  },
  async test(request: ProviderTranslateRequest): Promise<string> {
    const [sample] = await this.translate({ ...request, texts: ['一个女孩站在樱花树下，长发'] });
    return sample;
  },
};
