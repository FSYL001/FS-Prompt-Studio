import { describe, expect, it } from 'vitest';
import { composeTranslatedText, tokenizePrompt } from '../src/domain/promptParse';
import { assemblePrompts, createProduct } from '../src/domain/product';
import { diffLines } from '../src/domain/diff';
import { DEFAULT_OUTPUT, DEFAULT_PARAMS } from '../src/domain/types';
import { nowIso } from '../src/domain/id';
import { patchComfyWorkflow, createExampleWorkflowJson, EXAMPLE_WORKFLOW_MAPPING } from '../src/domain/workflow';
import { clearTranslationCache, translateSegments } from '../server/translate/index.js';

const mockConfig = {
  provider: 'mock' as const,
  baseUrl: '',
  model: '',
  timeoutMs: 5000,
  apiKey: '',
  proxyMode: 'auto' as const,
  proxyUrl: '',
};

describe('核心流程：草稿 → 翻译 → 对照 → 成品 → 历史 → 工作流', () => {
  it('端到端数据结构保持完整', async () => {
    clearTranslationCache();
    const draft = '一个白发女孩，穿着黑色连衣裙，站在樱花树下';
    const tokens = tokenizePrompt(draft, { splitSentences: true });
    const contentIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.kind === 'content');

    const response = await translateSegments({
      segments: contentIndexes.map(({ token, index }) => ({ id: `t${index}`, text: token.value })),
      direction: 'zh-en',
      config: mockConfig,
    });
    const byId = new Map(response.results.map((item) => [item.id, item.text]));
    const translations = new Map<number, string>();
    contentIndexes.forEach(({ token, index }) => {
      translations.set(index, byId.get(`t${index}`) ?? token.value);
    });

    const composed = composeTranslatedText(tokens, translations, 'zh-en');
    expect(composed.pairs).toHaveLength(contentIndexes.length);
    expect(composed.text.toLowerCase()).toContain('white hair');
    expect(composed.text).toContain('cherry blossom tree');

    const product = createProduct({
      englishText: composed.text,
      draftText: draft,
      negativeText: 'lowres, blurry',
      segments: [],
      activeLoras: [],
      params: { ...DEFAULT_PARAMS },
      presetId: 'sdxl',
      output: { ...DEFAULT_OUTPUT, includeParams: true },
      alignment: {
        direction: 'zh-en',
        sourceLang: 'zh',
        targetLang: 'en',
        sourceText: draft,
        targetText: composed.text,
        pairs: composed.pairs,
        provider: response.provider,
        mock: response.mock,
        createdAt: nowIso(),
      },
      name: '白发女孩',
    });

    expect(product.final).toContain('Negative prompt: lowres, blurry');
    expect(product.final).toContain('Steps:');
    expect(product.alignment?.pairs.length).toBe(composed.pairs.length);

    const versionTwo = `${product.englishText}, smiling, soft light`;
    const diff = diffLines(product.englishText, versionTwo);
    expect(diff.added + diff.removed).toBeGreaterThan(0);

    const assembly = assemblePrompts({
      englishText: product.englishText,
      draftText: product.draftText,
      negativeText: product.negativeText,
      segments: product.segments,
      activeLoras: product.loras,
      params: product.params,
      presetId: product.presetId,
      output: product.output,
    });
    const workflow = patchComfyWorkflow({
      templateJson: createExampleWorkflowJson(),
      mapping: EXAMPLE_WORKFLOW_MAPPING,
      positive: assembly.positive,
      negative: assembly.negative,
      loras: product.loras,
    });
    expect(workflow.patched.positive).toBe(true);
    expect(JSON.parse(workflow.json)['6'].inputs.text).toContain('white hair');
  });

  it('翻译失败时不会产生半成品或覆盖内容', async () => {
    const source = '一个白发女孩';
    let resultText: string | null = null;
    try {
      await translateSegments({
        segments: [{ id: 'x', text: source }],
        direction: 'zh-en',
        config: {
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          timeoutMs: 5000,
          apiKey: '',
          proxyMode: 'auto',
          proxyUrl: '',
        },
      });
      resultText = 'should not happen';
    } catch (error) {
      expect((error as { code?: string }).code).toBe('NO_KEY');
    }
    expect(resultText).toBeNull();
    expect(source).toBe('一个白发女孩');
  });
});
