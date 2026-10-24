import { describe, expect, it } from 'vitest';
import {
  composeFromSegments,
  composeTranslatedText,
  detectLanguage,
  splitPromptSegments,
  tokenizePrompt,
} from '../src/domain/promptParse';
import { DEFAULT_OUTPUT } from '../src/domain/types';
import type { PromptSegment } from '../src/domain/types';

function segment(text: string, overrides: Partial<PromptSegment> = {}): PromptSegment {
  return {
    id: text,
    text,
    translated: '',
    polarity: 'positive',
    locked: false,
    weight: null,
    ...overrides,
  };
}

describe('语言识别', () => {
  it('区分中文、英文与中英混合', () => {
    expect(detectLanguage('一个白发女孩')).toBe('zh');
    expect(detectLanguage('long hair, blue eyes')).toBe('en');
    expect(detectLanguage('1girl，长发')).toBe('mixed');
    expect(detectLanguage('123 !!!')).toBe('unknown');
  });
});

describe('提示词分词', () => {
  it('不会拆开括号、权重和 LoRA 标签', () => {
    const tokens = tokenizePrompt('苹果，(red apple:1.2)，<lora:style:0.8>');
    expect(tokens.map((token) => token.kind)).not.toContain('space');
    expect(tokens.some((token) => token.kind === 'protected' && token.value === '<lora:style:0.8>')).toBe(
      true,
    );
    expect(tokens.some((token) => token.kind === 'content' && token.value === '(red apple:1.2)')).toBe(
      true,
    );
    const delimiters = tokens.filter((token) => token.kind === 'delim').map((token) => token.value);
    expect(delimiters).toEqual(['，', '，']);
  });

  it('句末标点在翻译模式下会单独成为分隔符', () => {
    const tokens = tokenizePrompt('一个女孩站在樱花树下。她微笑着。');
    const delimiters = tokens.filter((token) => token.kind === 'delim').map((token) => token.value);
    expect(delimiters).toEqual(['。', '。']);
  });

  it('保留准确字符偏移', () => {
    const source = '一个女孩, long hair';
    const tokens = tokenizePrompt(source);
    for (const token of tokens) {
      expect(source.slice(token.start, token.end)).toBe(token.value);
    }
  });
});

describe('片段拆分', () => {
  it('按顶层逗号、分号、换行拆分', () => {
    expect(splitPromptSegments('1girl, long hair, blue eyes\nsmiling')).toEqual([
      '1girl',
      'long hair',
      'blue eyes',
      'smiling',
    ]);
  });

  it('括号内部不拆分，完整句子保持原样', () => {
    expect(splitPromptSegments('a, (b, c), d')).toEqual(['a', '(b, c)', 'd']);
    expect(splitPromptSegments('一个女孩站在樱花树下。她微笑着。')).toEqual([
      '一个女孩站在樱花树下。她微笑着。',
    ]);
  });

  it('支持中英混合片段', () => {
    expect(splitPromptSegments('1girl，长发，蓝色眼睛')).toEqual(['1girl', '长发', '蓝色眼睛']);
  });
});

describe('双语重组', () => {
  it('保留标点、权重、LoRA 标签，并计算真实区间', () => {
    const source = '苹果，红色的苹果，(长发:1.2)，<lora:style:0.8>';
    const tokens = tokenizePrompt(source);
    const translations = new Map<number, string>();
    tokens.forEach((token, index) => {
      if (token.value === '苹果') translations.set(index, 'apple');
      if (token.value === '红色的苹果') translations.set(index, 'red apple');
      if (token.value === '(长发:1.2)') translations.set(index, '(long hair:1.2)');
    });

    const result = composeTranslatedText(tokens, translations, 'zh-en');
    expect(result.text).toBe('apple, red apple, (long hair:1.2), <lora:style:0.8>');
    expect(result.pairs.map((pair) => pair.target)).toEqual([
      'apple',
      'red apple',
      '(long hair:1.2)',
    ]);
    for (const pair of result.pairs) {
      expect(result.text.slice(pair.targetStart, pair.targetEnd)).toBe(pair.target);
      expect(source.slice(pair.sourceStart, pair.sourceEnd)).toBe(pair.source);
    }
  });

  it('英文转中文时使用中文标点', () => {
    const source = 'long hair, blue eyes. smiling';
    const tokens = tokenizePrompt(source);
    const translations = new Map<number, string>();
    tokens.forEach((token, index) => {
      if (token.value === 'long hair') translations.set(index, '长发');
      if (token.value === 'blue eyes') translations.set(index, '蓝色眼睛');
      if (token.value === 'smiling') translations.set(index, '微笑');
    });
    const result = composeTranslatedText(tokens, translations, 'en-zh');
    expect(result.text).toBe('长发，蓝色眼睛。微笑');
  });

  it('长句保持为一个整句对照，不拆成单词', () => {
    const source = '一个非常美丽的女孩静静地站在盛开的樱花树下';
    const tokens = tokenizePrompt(source);
    const translations = new Map<number, string>();
    tokens.forEach((token, index) => {
      if (token.kind === 'content') {
        translations.set(index, 'a very beautiful girl standing quietly under a blooming cherry blossom tree');
      }
    });
    const result = composeTranslatedText(tokens, translations, 'zh-en');
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].granularity).toBe('sentence');
    expect(result.pairs[0].target.split(' ').length).toBeGreaterThan(5);
  });

  it('没有译文的片段保留原文', () => {
    const tokens = tokenizePrompt('长发');
    const result = composeTranslatedText(tokens, new Map(), 'zh-en');
    expect(result.text).toBe('长发');
    expect(result.pairs[0].unchanged).toBe(true);
  });
});

describe('片段组合', () => {
  it('支持权重、正负向与自定义分隔符', () => {
    const segments = [
      segment('long hair', { weight: 1.2 }),
      segment('blue eyes'),
      segment('bad hands', { polarity: 'negative' }),
    ];
    const positive = composeFromSegments(segments, {
      output: { ...DEFAULT_OUTPUT, separator: ', ', format: 'tags', includeWeights: true },
    });
    expect(positive).toBe('(long hair:1.2), blue eyes');

    const negative = composeFromSegments(segments, {
      output: DEFAULT_OUTPUT,
      polarity: 'negative',
    });
    expect(negative).toBe('bad hands');

    const lines = composeFromSegments(segments, {
      output: { ...DEFAULT_OUTPUT, format: 'lines', includeWeights: false },
    });
    expect(lines).toBe('long hair\nblue eyes');
  });

  it('中文片段优先使用译文，没有译文时保留原文', () => {
    const segments = [
      segment('长发', { translated: 'long hair' }),
      segment('蓝色眼睛'),
    ];
    expect(composeFromSegments(segments, { output: DEFAULT_OUTPUT })).toBe('long hair, 蓝色眼睛');
  });
});
