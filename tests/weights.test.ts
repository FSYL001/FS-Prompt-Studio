import { describe, expect, it } from 'vitest';
import { applyWeight, countWeightGroups, parseWeightUnits } from '../src/domain/weights';

function unitsOf(text: string, granularity: 'word' | 'sentence') {
  return parseWeightUnits(text, granularity)
    .filter((unit) => unit.type === 'unit')
    .map((unit) => unit.text);
}

describe('片段加权工具', () => {
  it('按单词拆分，保持括号内的短语完整', () => {
    expect(unitsOf('a (long hair:1.2), blue eyes', 'word')).toEqual([
      'a',
      '(long hair:1.2)',
      'blue',
      'eyes',
    ]);
  });

  it('中文按词切分为可点击单元', () => {
    expect(unitsOf('一个白发女孩', 'word')).toEqual(['一个', '白发', '女孩']);
    expect(unitsOf('穿着黑色连衣裙', 'word')).toEqual(['穿着', '黑色', '连衣裙']);
  });

  it('按单句拆分，逗号分隔的短句各为一块', () => {
    expect(unitsOf('long hair, blue eyes. smiling', 'sentence')).toEqual([
      'long hair',
      'blue eyes',
      'smiling',
    ]);
  });

  it('加权时添加圆括号，再次点击叠加', () => {
    const source = 'long hair';
    const first = applyWeight(source, 0, source.length, 'increase');
    expect(first.text).toBe('(long hair)');
    const second = applyWeight(first.text, first.start, first.end, 'increase');
    expect(second.text).toBe('((long hair))');
  });

  it('降权时添加方括号，再次点击叠加', () => {
    const source = 'blue eyes';
    const first = applyWeight(source, 0, source.length, 'decrease');
    expect(first.text).toBe('[blue eyes]');
    const second = applyWeight(first.text, first.start, first.end, 'decrease');
    expect(second.text).toBe('[[blue eyes]]');
  });

  it('相反方向点击时取消一层', () => {
    const increased = '(long hair)';
    const decreased = applyWeight(increased, 0, increased.length, 'decrease');
    expect(decreased.text).toBe('long hair');

    const low = '[blue eyes]';
    const raised = applyWeight(low, 0, low.length, 'increase');
    expect(raised.text).toBe('blue eyes');
  });

  it('数字权重降权时不会拆坏 :1.2', () => {
    const source = '(long hair:1.2)';
    const result = applyWeight(source, 0, source.length, 'decrease');
    expect(result.text).toBe('[(long hair:1.2)]');
  });

  it('只改写目标片段，保留前后内容与空格', () => {
    const source = 'masterpiece, long hair, blue eyes';
    const unit = parseWeightUnits(source, 'word').find((item) => item.text === 'long');
    expect(unit).toBeTruthy();
    const result = applyWeight(source, unit!.start, unit!.end, 'increase');
    expect(result.text).toBe('masterpiece, (long) hair, blue eyes');
  });

  it('统计加权与降权括号（按最外层分组）', () => {
    expect(countWeightGroups('(a), ((b)), [c], [[d]]')).toEqual({ increased: 2, decreased: 2 });
  });
});
