import { safeExternalUrl } from '../src/model';
import { taskMarkers } from '../src/markdown';

/** Small local-preview renderer. The installed plugin uses Obsidian's renderer. */
export function renderPreviewMarkdown(text: string, container: HTMLElement): void {
  const document = container.ownerDocument;
  const tasks = taskMarkers(text);
  let offset = 0;
  let list: HTMLUListElement | undefined;
  for (const line of text.split('\n')) {
    const task = tasks.find(task => task.offset >= offset && task.offset < offset + line.length);
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const element = document.createElement(task ? 'li' : heading ? `h${Math.min(heading[1].length + 2, 6)}` : 'p');
    const value = task ? line.slice(task.offset - offset + 2).trimStart() : heading ? heading[2] : line.replace(/^[-*]\s+/, '• ');
    if (task) {
      if (!list) { list = document.createElement('ul'); list.className = 'contains-task-list'; container.append(list); }
      element.className = `task-list-item${task.checked ? ' is-checked' : ''}`;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.checked; checkbox.className = 'task-list-item-checkbox'; element.append(checkbox);
    } else list = undefined;
    for (const token of value.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g)) {
      const match = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
      if (token.startsWith('**') && token.endsWith('**')) { const strong = document.createElement('strong'); strong.textContent = token.slice(2, -2); element.append(strong); }
      else if (match && safeExternalUrl(match[2])) { const link = document.createElement('a'); link.textContent = match[1]; link.href = safeExternalUrl(match[2])!; link.target = '_blank'; link.rel = 'noopener noreferrer'; element.append(link); }
      else element.append(document.createTextNode(token));
    }
    if (!line) element.append(document.createElement('br'));
    (list || container).append(element);
    offset += line.length + 1;
  }
}
