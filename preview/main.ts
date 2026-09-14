import { applyOperation, createBoard, createDemoBoard, createId, exportMarkdown, parseBoard, safeExternalUrl, serializeBoard } from '../src/model';
import type { Attachment, Board, WallHost } from '../src/types';
import { WallApp } from '../src/wall';

const KEY = 'moss-wall-preview-v2';
const appEl = document.querySelector<HTMLElement>('#app')!;
let board: Board;
let wall: WallApp;
const urls = new Map<string, string>();

function assetDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('moss-wall-preview-assets', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function saveAsset(path: string, blob: Blob): Promise<void> {
  const db = await assetDB();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, path); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
async function loadAssets(): Promise<void> {
  const paths = [...new Set(board.cards.flatMap(c => c.attachments.map(a => a.path)))];
  if (!paths.length) return;
  const db = await assetDB();
  await Promise.all(paths.map(path => new Promise<void>((resolve, reject) => {
    const req = db.transaction('files').objectStore('files').get(path);
    req.onsuccess = () => { if (req.result instanceof Blob) urls.set(path, URL.createObjectURL(req.result)); resolve(); };
    req.onerror = () => reject(req.error);
  })));
  db.close();
}
function download(contents: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function persist(next: Board): void { localStorage.setItem(KEY, serializeBoard(next)); board = next; }

function markdown(text: string, container: HTMLElement): void {
  // Preview-only renderer. The installed plugin uses Obsidian's MarkdownRenderer.
  for (const line of text.split('\n')) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const el = document.createElement(heading ? `h${Math.min(heading[1].length + 2, 6)}` : 'p');
    const value = heading ? heading[2] : line.replace(/^[-*]\s+/, '• ');
    const tokens = value.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
    for (const token of tokens) {
      const match = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
      if (token.startsWith('**') && token.endsWith('**')) { const strong = document.createElement('strong'); strong.textContent = token.slice(2, -2); el.append(strong); }
      else if (match && safeExternalUrl(match[2])) { const link = document.createElement('a'); link.textContent = match[1]; link.href = safeExternalUrl(match[2])!; link.target = '_blank'; link.rel = 'noopener noreferrer'; el.append(link); }
      else el.append(document.createTextNode(token));
    }
    if (!line) el.append(document.createElement('br'));
    container.append(el);
  }
}

const host: WallHost = {
  save: async operation => { const latest = localStorage.getItem(KEY); const next = applyOperation(latest ? parseBoard(latest) : board, operation); persist(next); return board; },
  importFiles: async files => {
    const result: Attachment[] = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) throw new Error('单个附件不能超过 25 MB。');
      const extension = /\.([a-zA-Z0-9]{1,12})$/.exec(file.name)?.[1].toLowerCase() ?? '';
      const path = `preview-assets/${createId()}${extension ? `.${extension}` : ''}`;
      await saveAsset(path, file); urls.set(path, URL.createObjectURL(file));
      result.push({ path, name: file.name || '图片.png', mime: /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.type) ? file.type : 'application/octet-stream' });
    }
    return result;
  },
  resolveAsset: path => urls.get(path) ?? '', renderMarkdown: markdown,
  openAttachment: attachment => { const url = urls.get(attachment.path); if (url) { const a = document.createElement('a'); a.href = url; a.download = attachment.name; a.click(); } },
  openLink: value => { const url = safeExternalUrl(value); if (url) window.open(url, '_blank', 'noopener,noreferrer'); },
  exportMarkdown: async () => download(exportMarkdown(board), `${board.title}.md`, 'text/markdown'),
  createBoard: () => { if (!window.confirm('将当前预览导出为 .moss 文件，并开始一面新的空白墙？')) return; download(serializeBoard(board), `${board.title}.moss`, 'application/json'); persist(createBoard('我的新看板')); wall.setBoard(board); },
  chooseBoard: () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.moss,application/json';
    input.onchange = async () => { try { if (input.files?.[0]) {
      const incoming = parseBoard(await input.files[0].text());
      if (!window.confirm('将先导出当前预览的 .moss 文件，再打开所选看板。继续？')) return;
      download(serializeBoard(board), `${board.title}.moss`, 'application/json');
      persist(incoming); await loadAssets(); wall.setBoard(board);
    } } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); } }; input.click();
  },
};

async function start(): Promise<void> {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) board = parseBoard(saved);
    else {
      board = createDemoBoard(); persist(board);
    }
    await loadAssets(); wall = new WallApp(appEl, board, host);
    window.addEventListener('storage', event => { if (event.key === KEY && event.newValue) { try { board = parseBoard(event.newValue); wall.setBoard(board); } catch { /* Invalid external edits never reset saved data. */ } } });
  } catch (error) { const message = document.createElement('p'); message.className = 'preview-failure'; message.textContent = `预览未能打开：${error instanceof Error ? error.message : String(error)}。原有数据保留，可使用“重置示例”重新开始。`; appEl.append(message); }
}
document.querySelector<HTMLButtonElement>('#theme')!.onclick = () => document.body.classList.toggle('theme-dark');
document.querySelector<HTMLSelectElement>('#device')!.onchange = event => {
  const value = (event.target as HTMLSelectElement).value;
  document.querySelector<HTMLElement>('#app')!.style.setProperty('--preview-width', value === 'auto' ? '100%' : `${value}px`);
};
const strip = document.querySelector<HTMLElement>('.preview-strip')!;
new ResizeObserver(() => document.documentElement.style.setProperty('--preview-bar-height', `${strip.getBoundingClientRect().height}px`)).observe(strip);
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => { if (window.confirm('重置会清除本浏览器中的预览卡片。要先通过墙内菜单导出再重置吗？选择“确定”直接重置。')) { localStorage.removeItem(KEY); location.reload(); } };
void start();
