import { TranslationError } from './types.js';
import type { ProviderTranslateRequest, TranslationProvider } from './types.js';

/**
 * 本地模拟翻译。
 * 明确标记为 mock：使用内置小词典做替换，无法翻译的内容会保留中文原文。
 * 这只用于没有配置真实 API 时测试界面，不代表真实翻译质量。
 */

const ZH_EN: Record<string, string> = {
  一个白发女孩: 'a girl with white hair',
  一个美丽的女孩: 'a beautiful girl',
  黑色连衣裙: 'black dress',
  蓝色眼睛: 'blue eyes',
  樱花树: 'cherry blossom tree',
  樱花: 'cherry blossoms',
  连衣裙: 'dress',
  白发: 'white hair',
  长发: 'long hair',
  女孩: 'girl',
  一个: 'a',
  穿着: 'wearing',
  苹果: 'apple',
  红色: 'red',
  蓝色的: 'blue',
  蓝色: 'blue',
  站在: 'standing under',
  树下: 'the tree',
  美丽的: 'beautiful',
  微笑: 'smile',
  看着: 'looking at',
  镜头: 'camera',
  猫: 'cat',
  天空: 'sky',
  夜晚: 'night',
  城市: 'city',
  赛博朋克: 'cyberpunk',
  动漫: 'anime',
  写实: 'photorealistic',
  肖像: 'portrait',
  特写: 'close-up',
  光线: 'lighting',
  阳光: 'sunlight',
  森林: 'forest',
  海滩: 'beach',
  白色: 'white',
  黑色: 'black',
  微风吹过: 'a gentle breeze blowing through',
  她的: 'her',
  白色连衣裙: 'white dress',
  蓝天: 'blue sky',
  背景: 'background',
};

const EN_ZH: Record<string, string> = {};
for (const [zh, en] of Object.entries(ZH_EN)) {
  if (!EN_ZH[en]) EN_ZH[en] = zh;
}

function translateZhToEn(text: string): string {
  const phrases = Object.keys(ZH_EN).sort((a, b) => b.length - a.length);
  let output = text;
  for (const phrase of phrases) {
    const value = ZH_EN[phrase];
    output = output.split(phrase).join(` ${value} `);
  }
  return output
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function translateEnToZh(text: string): string {
  const phrases = Object.keys(EN_ZH).sort((a, b) => b.length - a.length);
  let output = text;
  for (const phrase of phrases) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    output = output.replace(pattern, ` ${EN_ZH[phrase]} `);
  }
  return output.replace(/[ \t]+/g, ' ').trim();
}

export const mockProvider: TranslationProvider = {
  id: 'mock',
  label: '本地模拟翻译（仅演示，不是真实翻译）',
  requiresKey: false,
  maxChars: 100000,
  async translate(request: ProviderTranslateRequest): Promise<string[]> {
    return request.texts.map((text) =>
      request.direction === 'zh-en' ? translateZhToEn(text) : translateEnToZh(text),
    );
  },
  async test(request: ProviderTranslateRequest): Promise<string> {
    if (!request.texts.length) {
      throw new TranslationError('没有可翻译的内容。', 'EMPTY_INPUT');
    }
    return this.translate({ ...request, texts: ['一个白发女孩，穿着黑色连衣裙'] }).then(
      ([value]) => value,
    );
  },
};

/** 供测试与界面展示的“模拟词典”规模。 */
export const MOCK_DICTIONARY_SIZE = Object.keys(ZH_EN).length;
