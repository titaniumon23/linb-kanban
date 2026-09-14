import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { File as MemoryFile } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createBoard, createCard, parseBoard, serializeBoard } from '../src/model';
import type { Attachment } from '../src/types';

// Execute the actual bundled entry point, replacing only the host's public API.
const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'cjs', target: 'es2020', external: ['obsidian'] }).outputFiles[0].text;
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
type EventHandler = (...args: any[]) => void;
class Events {
  private handlers = new Map<string, Set<EventHandler>>();
  on(name: string, handler: EventHandler) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler);
    return () => { this.handlers.get(name)?.delete(handler); };
  }
  emit(name: string, ...args: unknown[]) { for (const handler of this.handlers.get(name) ?? []) handler(...args); }
}
class Folder {
  constructor(public path: string) {}
  isRoot() { return this.path === '/'; }
}
class VaultFile {
  extension: string;
  basename: string;
  stat = { mtime: Date.now() };
  constructor(public path: string, public parent: Folder) {
    const name = path.split('/').at(-1)!;
    const dot = name.lastIndexOf('.');
    this.extension = dot < 0 ? '' : name.slice(dot + 1);
    this.basename = dot < 0 ? name : name.slice(0, dot);
  }
}
class MemoryVault extends Events {
  objects = new Map<string, VaultFile | Folder>([['/', new Folder('/')]]);
  text = new Map<string, string>();
  binary = new Map<string, ArrayBuffer>();
  writes: { kind: string; path: string }[] = [];
  getAbstractFileByPath(path: string) { return this.objects.get(path) ?? null; }
  getFiles() { return Array.from(this.objects.values()).filter((item): item is VaultFile => item instanceof VaultFile); }
  getResourcePath(file: VaultFile) { return `https://vault.test/${encodeURI(file.path)}`; }
  seed(path: string, text: string) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      if (!this.objects.has(parent)) this.objects.set(parent, new Folder(parent));
    }
    const parent = this.objects.get(parts.slice(0, -1).join('/') || '/') as Folder;
    const file = new VaultFile(path, parent);
    this.objects.set(path, file); this.text.set(path, text);
    return file;
  }
  private checkNewPath(path: string) {
    assert.ok(path && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..'), `Invalid vault path: ${path}`);
    assert.equal(this.objects.has(path), false, `Path already exists: ${path}`);
    const parent = path.split('/').slice(0, -1).join('/') || '/';
    assert.ok(this.objects.get(parent) instanceof Folder, `Parent folder does not exist: ${parent}`);
  }
  async read(file: VaultFile) {
    const text = this.text.get(file.path); assert.notEqual(text, undefined); return text!;
  }
  async process(file: VaultFile, update: (text: string) => string) {
    const next = update(await this.read(file));
    this.text.set(file.path, next); this.writes.push({ kind: 'process', path: file.path });
    this.emit('modify', file);
    return next;
  }
  async createFolder(path: string) {
    this.checkNewPath(path); this.objects.set(path, new Folder(path)); this.writes.push({ kind: 'folder', path });
  }
  async create(path: string, text: string) {
    this.checkNewPath(path); const file = this.seed(path, text); this.writes.push({ kind: 'create', path }); return file;
  }
  async createBinary(path: string, bytes: ArrayBuffer) {
    this.checkNewPath(path);
    const file = this.seed(path, ''); this.text.delete(path); this.binary.set(path, bytes.slice(0));
    this.writes.push({ kind: 'binary', path }); return file;
  }
}

async function fixture(t: TestContext) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://moss.test/' });
  const globals = ['window', 'document', 'Element', 'HTMLElement', 'HTMLDivElement', 'Node', 'File', 'Event', 'KeyboardEvent'] as const;
  const descriptors = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] });
  function createElement(this: HTMLElement, tag: string, options: { cls?: string; text?: string } = {}) {
    const child = this.ownerDocument.createElement(tag);
    if (options.cls) child.className = options.cls;
    if (options.text) child.textContent = options.text;
    this.append(child); return child;
  }
  Object.assign(dom.window.HTMLElement.prototype, {
    empty(this: HTMLElement) { this.replaceChildren(); },
    addClass(this: HTMLElement, value: string) { this.classList.add(value); },
    setText(this: HTMLElement, value: string) { this.textContent = value; },
    createEl: createElement,
    createDiv(this: HTMLElement, options: { cls?: string; text?: string } = {}) { return createElement.call(this, 'div', options); },
  });
  const vault = new MemoryVault();
  const notices: string[] = [];
  const opened: string[] = [];
  const views: any[] = [];
  const factories = new Map<string, (leaf: any) => any>();
  const extensions: { extensions: string[]; type: string }[] = [];
  const commands: { id: string; name: string; callback: () => unknown }[] = [];
  const ribbons: { icon: string; title: string }[] = [];
  class Component {
    private disposers: (() => void)[] = [];
    load() {}
    registerEvent(dispose: () => void) { this.disposers.push(dispose); }
    unload() { for (const dispose of this.disposers.splice(0)) dispose(); }
  }
  const workspace = Object.assign(new Events(), {
    getLeavesOfType: (type: string) => views.filter(view => view.getViewType() === type).map(view => view.leaf),
    getLeaf: (_mode: string) => ({ openFile: async (file: VaultFile) => { opened.push(file.path); } }),
    revealLeaf: async (_leaf: unknown) => {},
  });
  const app = { vault, workspace };
  class Plugin extends Component {
    app = app;
    registerView(type: string, factory: (leaf: any) => any) { factories.set(type, factory); }
    registerExtensions(list: string[], type: string) { extensions.push({ extensions: list, type }); }
    addCommand(command: typeof commands[number]) { commands.push(command); }
    addRibbonIcon(icon: string, title: string, _callback: () => void) { ribbons.push({ icon, title }); }
  }
  class FileView extends Component {
    app = app;
    file: VaultFile | null = null;
    contentEl = dom.window.document.createElement('div');
    constructor(public leaf: any) { super(); dom.window.document.body.append(this.contentEl); }
  }
  class Modal extends Component {
    contentEl = dom.window.document.createElement('div');
    titleEl = dom.window.document.createElement('h2');
    constructor(public app: unknown) { super(); }
    open() {}
    close() {}
    setPlaceholder(_value: string) {}
  }
  const mockObsidian = {
    Plugin, Component, FileView, Modal, SuggestModal: Modal, Setting: class {}, TFile: VaultFile, TFolder: Folder,
    Notice: class { constructor(text: string) { notices.push(text); } },
    normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''),
    MarkdownRenderer: { async render(_app: unknown, text: string, container: HTMLElement) { container.textContent = text; } },
  };
  const module = { exports: {} as { default: new () => Plugin & { onload(): Promise<void>; repository: any } } };
  new Function('require', 'module', 'exports', bundle)((name: string) => { assert.equal(name, 'obsidian'); return mockObsidian; }, module, module.exports);
  const plugin = new module.exports.default();
  await plugin.onload();
  t.after(async () => {
    for (const view of views) { await view.onClose(); view.unload(); }
    plugin.unload();
    await settle(); dom.window.close();
    for (const name of globals) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  });
  return {
    vault, notices, opened, factories, extensions, commands, ribbons,
    async load(file: VaultFile) {
      const factory = factories.get('moss-wall-view'); assert.ok(factory);
      const leaf: any = { app };
      const view = factory(leaf); leaf.view = view; view.file = file; views.push(view);
      await view.onLoadFile(file); await settle(); return view;
    },
  };
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  const matches = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(node => node.getAttribute('aria-label') === label);
  assert.equal(matches.length, 1, `Expected one button named ${label}`); return matches[0];
}
function fill(root: ParentNode, label: string, value: string) {
  const element = Array.from(root.querySelectorAll<HTMLLabelElement>('label')).find(node => node.textContent === label);
  assert.ok(element?.htmlFor);
  const input = element.ownerDocument.getElementById(element.htmlFor) as HTMLInputElement | HTMLTextAreaElement;
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
}

test('compiled plugin registers its file view, extension, commands and ribbon without creating demo content', async t => {
  const h = await fixture(t);
  assert.deepEqual(Array.from(h.factories.keys()), ['moss-wall-view']);
  assert.deepEqual(h.extensions, [{ extensions: ['moss'], type: 'moss-wall-view' }]);
  assert.deepEqual(h.commands.map(command => command.id), ['open-board', 'create-board', 'create-demo-board']);
  assert.deepEqual(h.ribbons, [{ icon: 'copy-plus', title: '新建看板' }]);
  assert.deepEqual(h.vault.writes, []);
  assert.deepEqual(h.vault.getFiles(), []);
});

test('registered file view loads and saves real UI edits through vault.process, then reloads them', async t => {
  const h = await fixture(t);
  const file = h.vault.seed('Moss Wall/测试.moss', serializeBoard(createBoard('插件集成测试')));
  const view = await h.load(file);
  assert.equal(view.getViewType(), 'moss-wall-view');
  assert.equal(view.canAcceptExtension('moss'), true);
  assert.equal(view.canAcceptExtension('md'), false);
  assert.match(view.contentEl.textContent, /插件集成测试/);
  assert.equal(h.vault.writes.length, 0);
  button(view.contentEl.querySelector('.moss-toolbar')!, '添加卡片').click();
  let editor = view.contentEl.querySelector('[role="dialog"]')!;
  fill(editor, '标题', '真实入口创建的卡片'); fill(editor, '内容', '**保留 Markdown** 与中文');
  button(editor, '添加卡片').click(); await settle();
  assert.equal(h.vault.writes.filter(write => write.kind === 'process').length, 1);
  let saved = parseBoard(h.vault.text.get(file.path)!);
  assert.equal(saved.cards[0].title, '真实入口创建的卡片');
  button(view.contentEl, saved.cards[0].title).click();
  editor = view.contentEl.querySelector('[role="dialog"]')!;
  fill(editor, '内容', '保存后重新打开也存在。'); button(editor, '保存修改').click(); await settle();
  saved = parseBoard(h.vault.text.get(file.path)!);
  assert.equal(saved.revision, 2);
  assert.equal(saved.cards[0].body, '保存后重新打开也存在。');
  await view.onUnloadFile(); await view.onLoadFile(file); await settle();
  assert.match(view.contentEl.textContent, /保存后重新打开也存在/);
  assert.equal(h.vault.writes.filter(write => write.kind === 'process').length, 2);
  assert.deepEqual(h.notices, []);
});

test('malformed board load displays a readable error and retry never rewrites the source', async t => {
  const h = await fixture(t);
  const original = '{ damaged irreplaceable content';
  const file = h.vault.seed('损坏.moss', original);
  const view = await h.load(file);
  const alert = view.contentEl.querySelector('[role="alert"]'); assert.ok(alert);
  assert.match(alert.textContent, /暂时无法读取/);
  assert.match(alert.textContent, /原文件未被修改/);
  assert.equal(view.contentEl.querySelector('.moss-wall'), null);
  alert.querySelector('button').click(); await settle();
  assert.equal(h.vault.text.get(file.path), original);
  assert.deepEqual(h.vault.writes, []);
});

test('root-folder Markdown export uses a relative output path and keeps the original board intact', async t => {
  const h = await fixture(t);
  const board = createBoard('根目录灵感');
  board.cards.push(createCard(board.columns[0].id, { title: '导出卡片', body: '**正文内容**', attachments: [{ path: '素材/图片 one.png', name: '图片 one.png', mime: 'image/png' }] }));
  const original = serializeBoard(board);
  const file = h.vault.seed('根目录.moss', original);
  const view = await h.load(file);
  button(view.contentEl, '更多操作').click();
  button(view.contentEl.querySelector('[role="menu"]')!, '导出为 Markdown').click(); await settle();
  const exported = h.vault.getFiles().find(item => item.extension === 'md'); assert.ok(exported);
  assert.equal(exported.path, '根目录灵感 - 导出.md');
  assert.equal(exported.parent.isRoot(), true);
  const markdown = h.vault.text.get(exported.path)!;
  assert.match(markdown, /\*\*正文内容\*\*/);
  assert.ok(markdown.includes('%E7%B4%A0%E6%9D%90/%E5%9B%BE%E7%89%87%20one.png'));
  assert.deepEqual(h.opened, [exported.path]);
  assert.equal(h.vault.text.get(file.path), original);
  assert.equal(h.vault.writes.filter(write => write.kind === 'process').length, 0);
});

test('real attachment importer gives unusual and long names safe unique vault paths while preserving extensions', async t => {
  const h = await fixture(t);
  const board = createBoard();
  const file = h.vault.seed('灵感.moss', serializeBoard(board));
  const view = await h.load(file);
  const names = ['../坏:名<>?/notes.JPG', `${'很长的名字'.repeat(60)}.WEBP`, '研究资料 #1?.pdf'];
  const files = names.map((name, index) => new MemoryFile([`attachment ${index}`], name));
  const attachments: Attachment[] = await view.importFiles(files);
  assert.equal(attachments.length, 3);
  assert.equal(new Set(attachments.map(item => item.path)).size, 3);
  for (const [index, attachment] of attachments.entries()) {
    const extension = ['jpg', 'webp', 'pdf'][index];
    assert.ok(attachment.path.startsWith(`Moss Wall/附件/${board.id}/`));
    assert.match(attachment.path.split('/').at(-1)!, new RegExp(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.${extension}$`));
    assert.ok(attachment.name.endsWith(`.${extension}`));
    assert.ok(attachment.name.length <= 95);
    assert.doesNotMatch(attachment.name, /[\\/:*?"<>|]/);
    assert.equal(Buffer.from(h.vault.binary.get(attachment.path)!).toString(), `attachment ${index}`);
  }
  assert.deepEqual(attachments.map(item => item.mime), ['image/jpeg', 'image/webp', 'application/octet-stream']);
  const beforeRejected = h.vault.writes.length;
  await assert.rejects(view.importFiles([files[0], new MemoryFile([], 'empty.png')]), /空文件/);
  assert.equal(h.vault.writes.length, beforeRejected, 'Invalid batches are rejected before writing any files');
});

test('file picker uploads a picture and a document through the real vault host and reloads their saved references', async t => {
  const h = await fixture(t);
  const file = h.vault.seed('移动端看板.moss', serializeBoard(createBoard('移动端附件')));
  const view = await h.load(file);
  button(view.contentEl.querySelector('.moss-toolbar')!, '添加卡片').click();
  const editor = view.contentEl.querySelector('[role="dialog"]')!;
  const picker = editor.querySelector('input[type="file"]')! as HTMLInputElement;
  const uploads = [
    new MemoryFile(['image bytes'], '实拍.jpg', { type: 'image/jpeg' }),
    new MemoryFile(['document bytes'], '文档.pdf', { type: 'application/pdf' }),
  ];
  Object.defineProperty(picker, 'files', { configurable: true, value: uploads });
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  assert.equal(h.vault.writes.filter(write => write.kind === 'binary').length, 2);
  assert.equal(parseBoard(h.vault.text.get(file.path)!).cards.length, 0);
  fill(editor, '标题', '手机选文件');
  fill(editor, '内容', '文字、图片与文档一起保存。');
  button(editor, '添加卡片').click();
  await settle();
  const saved = parseBoard(h.vault.text.get(file.path)!);
  assert.equal(saved.cards.length, 1);
  const attachments = saved.cards[0].attachments;
  assert.deepEqual(attachments.map(item => item.name), ['实拍.jpg', '文档.pdf']);
  assert.deepEqual(attachments.map(item => Buffer.from(h.vault.binary.get(item.path)!).toString()), ['image bytes', 'document bytes']);
  await view.onUnloadFile();
  await view.onLoadFile(file);
  await settle();
  const card = view.contentEl.querySelector('article')!;
  assert.equal(card.querySelector('img')?.getAttribute('src'), `https://vault.test/${encodeURI(attachments[0].path)}`);
  for (const attachment of attachments) {
    const open = Array.from(card.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(item => item.getAttribute('aria-label')?.endsWith(attachment.name));
    assert.ok(open);
    open.click();
  }
  await settle();
  assert.deepEqual(h.opened, attachments.map(item => item.path));
  assert.deepEqual(h.notices, []);
});
