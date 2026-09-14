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
