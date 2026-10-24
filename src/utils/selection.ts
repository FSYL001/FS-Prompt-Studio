/** 在文本框中选中指定字符区间，并滚动到大致可见位置。 */
export function selectTextareaRange(
  textarea: HTMLTextAreaElement | null,
  start: number,
  end: number,
): void {
  if (!textarea) return;
  const length = textarea.value.length;
  const safeStart = Math.max(0, Math.min(start, length));
  const safeEnd = Math.max(safeStart, Math.min(end, length));
  textarea.focus({ preventScroll: true });
  try {
    textarea.setSelectionRange(safeStart, safeEnd);
  } catch {
    return;
  }
  const before = textarea.value.slice(0, safeStart);
  const line = before.split('\n').length - 1;
  const totalLines = Math.max(1, textarea.value.split('\n').length);
  const ratio = totalLines > 1 ? line / (totalLines - 1) : 0;
  const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
  textarea.scrollTop = Math.max(0, Math.min(maxScroll, ratio * maxScroll - textarea.clientHeight / 2));
}

/** 粗略计算某个偏移对应的行号（用于提示）。 */
export function lineNumberAt(text: string, offset: number): number {
  const safe = Math.max(0, Math.min(offset, text.length));
  return text.slice(0, safe).split('\n').length;
}
