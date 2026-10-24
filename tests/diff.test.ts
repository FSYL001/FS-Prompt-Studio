import { describe, expect, it } from 'vitest';
import { diffLines } from '../src/domain/diff';

describe('版本差异', () => {
  it('标记新增、删除与相同行', () => {
    const result = diffLines('one\ntwo\nthree', 'one\nTWO\nthree\nfour');
    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
    const added = result.lines.filter((line) => line.type === 'add').map((line) => line.text);
    const removed = result.lines.filter((line) => line.type === 'remove').map((line) => line.text);
    expect(added).toContain('TWO');
    expect(added).toContain('four');
    expect(removed).toContain('two');
    expect(result.lines[0]).toEqual({ type: 'same', text: 'one' });
  });

  it('相同文本没有差异', () => {
    const result = diffLines('a\nb', 'a\nb');
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.lines.every((line) => line.type === 'same')).toBe(true);
  });

  it('空文本对比不报错', () => {
    expect(diffLines('', 'a').added).toBe(1);
    expect(diffLines('a', '').removed).toBe(1);
    expect(diffLines('', '').lines.length).toBe(1);
  });
});
