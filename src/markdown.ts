import { t } from './i18n';
/** Convert the selected lines without changing surrounding text or completed tasks. */
export function taskifySelection(text: string, start: number, end: number): { text: string; start: number; end: number } | null {
  if (end <= start || !text.slice(start, end).trim()) return null;
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const next = text.indexOf('\n', end - 1);
  const to = next < 0 ? text.length : next;
  const replacement = text.slice(from, to).split('\n').map(line => {
    if (!line.trim() || /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\](?:[ \t]|$)/.test(line)) return line;
    const match = /^([ \t]*)(?:(?:[-*+][ \t]+|\d+[.)、][ \t]*))?([\s\S]*)$/.exec(line)!;
    return `${match[1]}- [ ] ${match[2]}`;
  }).join('\n');
  return { text: text.slice(0, from) + replacement + text.slice(to), start: from, end: from + replacement.length };
}

/** Source offsets for standard Markdown tasks, excluding fenced code examples. */
export function taskMarkers(text: string): { offset: number; checked: boolean }[] {
  const tasks: { offset: number; checked: boolean }[] = [];
  let offset = 0;
  let fence: { character: string; length: number } | undefined;
  for (const line of text.split('\n')) {
    const marker = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = undefined;
    } else if (!fence) {
      const task = /^([ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])\](?=[ \t]|$)/.exec(line);
      if (task) tasks.push({ offset: offset + task[1].length, checked: task[2].toLowerCase() === 'x' });
    }
    offset += line.length + 1;
  }
  return tasks;
}

export type MarkdownTool = 'task' | 'bullet' | 'number' | 'bold' | 'link';
export interface TextEdit { text: string; start: number; end: number }
export function formatText(text: string, start: number, end: number, tool: MarkdownTool): TextEdit {
  if (tool === 'bold' || tool === 'link') {
    const selected = text.slice(start, end);
    const content = selected || (tool === 'bold' ? t("文字") : t("链接文字"));
    const replacement = tool === 'bold' ? `**${content}**` : `[${content}](https://)`;
    const offset = tool === 'bold' ? 2 : selected ? content.length + 3 : 1;
    return { text: text.slice(0, start) + replacement + text.slice(end), start: start + offset, end: start + offset + (tool === 'link' && selected ? 8 : content.length) };
  }
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', end > start ? end - 1 : end);
  const to = newline < 0 ? text.length : newline;
  const lines = text.slice(from, to).split('\n');
  const replaced = lines.map((line, index) => {
    if (tool === 'task' && /^\s*- \[[ xX]\] /.test(line)) return line;
    const [, indent, content] = /^([ \t]*)(?:(?:[-*+] |\d+[.)、]\s*)(?:\[[ xX]\] )?)?(.*)$/.exec(line)!;
    return indent + (tool === 'task' ? '- [ ] ' : tool === 'bullet' ? '- ' : `${index + 1}. `) + content;
  });
  const replacement = replaced.join('\n');
  const delta = replaced[0].length - lines[0].length;
  return { text: text.slice(0, from) + replacement + text.slice(to), start: start === end ? start + delta : from, end: start === end ? start + delta : from + replacement.length };
}
export function continueList(text: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const match = /^([ \t]*)(?:(\d+)[.)] |([-*+]) )(\[[ xX]\] )?(.*)$/.exec(text.slice(from, start));
  if (!match) return null;
  if (!match[5] && (start === text.length || text[start] === '\n')) return { text: text.slice(0, from) + text.slice(start), start: from, end: from };
  const prefix = '\n' + match[1] + (match[2] ? `${Number(match[2]) + 1}. ` : `${match[3]} `) + (match[4] ? '[ ] ' : '');
  return { text: text.slice(0, start) + prefix + text.slice(end), start: start + prefix.length, end: start + prefix.length };
}
