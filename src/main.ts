import { App, Component, FileView, MarkdownRenderer, Modal, Notice, Plugin, Setting, SuggestModal, TFile, TFolder, WorkspaceLeaf, normalizePath } from 'obsidian';
import { createBoard, createDemoBoard, createId, exportMarkdown, isBoardMarkdown, parseBoard, safeExternalUrl, serializeBoard } from './model';
import { BoardRepository } from './repository';
import type { Attachment, Board, WallHost } from './types';
import { WallApp } from './wall';

const VIEW_TYPE = 'linb-kanban-view';
const ROOT = 'LinB Kanban';
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml' };
const MAX_FILE = 25 * 1024 * 1024;

function problem(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function leafName(value: string): string { return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 90) || '未命名看板'; }

export default class LinBKanbanPlugin extends Plugin {
  repository!: BoardRepository;
  private routing = new WeakSet<WorkspaceLeaf>();
  private stopped = false;
  private routingQueued = false;
  private routingTimer: ReturnType<typeof setTimeout> | null = null;
  private routingEpoch = 0;
  async onload(): Promise<void> {
    const find = (path: string): TFile => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error('看板文件已移动或删除，请重新打开。');
      return file;
    };
    this.repository = new BoardRepository({
      read: path => this.app.vault.read(find(path)),
      process: (path, update) => this.app.vault.process(find(path), update),
    });
    this.registerView(VIEW_TYPE, leaf => new LinBKanbanView(leaf, this));
    // Keep historical board files visible even when unsupported files are hidden.
    try { this.registerExtensions(['moss'], VIEW_TYPE); }
    catch { new Notice('旧版文件显示兼容未能启用，仍可通过“LinB Kanban: 打开看板”访问旧看板。'); }
    this.register(() => { this.stopped = true; if (this.routingTimer !== null) clearTimeout(this.routingTimer); });
    const requestRouting = () => { this.routingEpoch++; this.queueRouting(); };
    this.registerEvent(this.app.workspace.on('file-open', requestRouting));
    this.registerEvent(this.app.workspace.on('active-leaf-change', requestRouting));
    this.registerEvent(this.app.workspace.on('layout-change', requestRouting));
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file instanceof TFile && file.extension === 'md') requestRouting();
    }));
    this.app.workspace.onLayoutReady(requestRouting);
    this.addRibbonIcon('copy-plus', '新建看板', () => this.createBoardDialog());
    this.addCommand({ id: 'open-board', name: '打开看板', callback: () => this.chooseBoard() });
    this.addCommand({ id: 'create-board', name: '新建看板', callback: () => this.createBoardDialog() });
    this.addCommand({ id: 'create-demo-board', name: '创建示例看板', callback: () => { void this.writeDemo().catch(e => new Notice(problem(e))); } });
    this.addCommand({ id: 'import-legacy-board', name: '导入旧版看板', callback: () => this.importLegacyBoard() });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && (file.extension === 'moss' || this.app.metadataCache.getFileCache(file)?.frontmatter?.['linb-kanban'] === 1)) menu.addItem(item => item.setTitle('用看板打开').setIcon('copy-plus').onClick(() => { void this.openBoard(file); }));
    }));
  }

  async ensureFolder(path: string): Promise<void> {
    let current = '';
    for (const part of normalizePath(path).split('/')) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`“${current}”是文件，无法在此保存附件。`);
      try { await this.app.vault.createFolder(current); }
      catch (error) { if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error; }
    }
  }

  async writeNewBoard(board: Board): Promise<void> {
    await this.ensureFolder(ROOT);
    const file = await this.app.vault.create(this.uniquePath(`${ROOT}/${leafName(board.title)}`, 'md'), serializeBoard(board, ROOT));
    await this.openBoard(file);
  }

  private async writeDemo(): Promise<void> {
    await this.writeNewBoard(createDemoBoard());
  }

  uniquePath(stem: string, extension: string): string {
    let path = `${stem}.${extension}`;
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = `${stem} ${i}.${extension}`;
    return path;
  }

  createBoardDialog(): void { new CreateBoardModal(this.app, async title => this.writeNewBoard(createBoard(title))).open(); }
  async chooseBoard(): Promise<void> {
    const files: TFile[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (file.extension === 'moss') { files.push(file); continue; }
      if (file.extension !== 'md') continue;
      try { if (isBoardMarkdown(await this.app.vault.cachedRead(file))) files.push(file); }
      catch { /* A note may be removed while the picker is opening. */ }
    }
    if (this.stopped) return;
    if (!files.length) { this.createBoardDialog(); return; }
    files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    new BoardPicker(this.app, files, file => { void this.openBoard(file).catch(e => new Notice(problem(e))); }).open();
  }
  private importLegacyBoard(): void {
    // Explicit conversion creates a separate Markdown copy; the original stays intact.
    const files = this.app.vault.getFiles().filter(file => ['moss', 'json'].includes(file.extension));
    if (!files.length) { new Notice('请先把旧版看板文件放入当前笔记库，再运行此命令。'); return; }
    new BoardPicker(this.app, files, file => {
      void this.app.vault.read(file).then(text => this.writeNewBoard(parseBoard(text)))
        .then(() => new Notice('已创建 Markdown 看板，旧文件和附件保持不变。'))
        .catch(error => new Notice(problem(error)));
    }).open();
  }
  private queueRouting(): void {
    if (this.stopped || this.routingQueued) return;
    this.routingQueued = true;
    // Workspace events can fire before the host releases its view-loading lock.
    this.routingTimer = setTimeout(() => {
      this.routingTimer = null;
      this.routingQueued = false;
      if (!this.stopped) void this.routeOpenNotes();
    }, 0);
  }
  private async routeOpenNotes(): Promise<void> {
    if (this.stopped) return;
    await Promise.all(this.app.workspace.getLeavesOfType('markdown').map(async leaf => {
      if (this.routing.has(leaf)) return;
      const path = leaf.getViewState().state?.file;
      if (typeof path !== 'string') return;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      this.routing.add(leaf);
      const epoch = this.routingEpoch;
      try {
        const text = await this.app.vault.read(file);
        if (this.stopped || leaf.getViewState().type !== 'markdown' || leaf.getViewState().state?.file !== path) return;
        if (isBoardMarkdown(text)) await leaf.setViewState({ type: VIEW_TYPE, state: { file: path } });
      } catch (error) { if (!this.stopped) new Notice(problem(error)); }
      finally {
        this.routing.delete(leaf);
        if (!this.stopped && leaf.getViewState().type === 'markdown' &&
          (leaf.getViewState().state?.file !== path || epoch !== this.routingEpoch)) this.queueRouting();
      }
    }));
  }
  async openBoard(file: TFile): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE).find(leaf => (leaf.view as LinBKanbanView).file?.path === file.path);
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path } });
    await this.app.workspace.revealLeaf(leaf);
  }
}

class LinBKanbanView extends FileView {
  private wall: WallApp | null = null;
  private loadToken = 0;
  private boardId = '';
  private renders = new Set<{ component: Component; nodes: Node[] }>();
  private lifecycle = 0;
  private errorEl: HTMLElement | null = null;
  private imagePicker: VaultImagePicker | null = null;
  private redirectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LinBKanbanPlugin) {
    super(leaf);
    this.register(() => this.disposeUI());
    this.registerEvent(this.app.vault.on('modify', file => { if (file instanceof TFile && file === this.file) void this.refresh(file); }));
  }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return this.file?.basename ?? '看板'; }
  getIcon(): string { return 'copy-plus'; }
  // An extension alone cannot distinguish board Markdown from an ordinary note.
  // Marked Markdown is opened explicitly by the plugin's content-aware routing.
  canAcceptExtension(extension: string): boolean { return extension === 'moss'; }

  async onLoadFile(file: TFile): Promise<void> {
    this.disposeUI();
    const lifecycle = this.lifecycle;
    this.contentEl.empty();
    this.contentEl.addClass('linb-view');
    let text: string;
    try { text = await this.app.vault.read(file); }
    catch { await this.refresh(file); return; }
    if (this.file !== file || lifecycle !== this.lifecycle) return;
    if (file.extension !== 'moss' && !isBoardMarkdown(text)) {
      // Restored workspace state may still assign an ordinary note to this view.
      // Switching inside onLoadFile is ignored by Obsidian while the leaf is busy.
      this.contentEl.createEl('p', { text: '正在打开普通笔记…' });
      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = null;
        if (lifecycle !== this.lifecycle || this.file !== file || this.leaf.view !== this) return;
        void this.leaf.setViewState({ type: 'markdown', state: { file: file.path } })
          .catch(error => new Notice(problem(error)));
      }, 0);
      return;
    }
    await this.refresh(file);
  }
  async onUnloadFile(): Promise<void> { this.loadToken++; this.disposeUI(); }
  async onClose(): Promise<void> { this.loadToken++; this.disposeUI(); }
  private disposeUI(): void {
    this.lifecycle++;
    if (this.redirectTimer !== null) clearTimeout(this.redirectTimer);
    this.redirectTimer = null;
    this.imagePicker?.close(); this.imagePicker = null;
    this.wall?.destroy(); this.wall = null;
    for (const { component } of this.renders) component.unload();
    this.renders.clear();
    this.errorEl?.remove(); this.errorEl = null;
  }
  private async refresh(file: TFile): Promise<void> {
    const token = ++this.loadToken;
    try {
      const board = await this.plugin.repository.read(file.path);
      if (token !== this.loadToken || this.file !== file) return;
      this.errorEl?.remove(); this.errorEl = null;
      this.boardId = board.id;
      if (this.wall) this.wall.setBoard(board);
      else this.wall = new WallApp(this.contentEl, board, this.host(file));
    } catch (error) {
      if (token !== this.loadToken) return;
      this.errorEl?.remove();
      this.errorEl = this.contentEl.createDiv({ cls: 'linb-load-error' });
      this.errorEl.setAttribute('role', 'alert');
      this.errorEl.createEl('strong', { text: '看板暂时无法读取' });
      this.errorEl.createEl('p', { text: `${problem(error)} 原文件未被修改。` });
      const button = this.errorEl.createEl('button', { text: '重新读取' });
      button.onclick = () => { void this.refresh(file); };
      this.contentEl.prepend(this.errorEl);
    }
  }

  private host(file: TFile): WallHost {
    return {
      save: async operation => {
        if (this.file !== file) throw new Error('已切换看板，请重新打开后再保存。');
        return this.plugin.repository.save(file.path, operation);
      },
      importFiles: files => this.importFiles(files),
      chooseVaultImages: () => this.chooseVaultImages(),
      resolveAsset: path => {
        const asset = this.app.vault.getAbstractFileByPath(path);
        return asset instanceof TFile ? this.app.vault.getResourcePath(asset) : '';
      },
      renderMarkdown: async (text, container) => {
        const lifecycle = this.lifecycle;
        const component = new Component(); component.load();
        try { await MarkdownRenderer.render(this.app, text, container, file.path, component); }
        catch (error) { component.unload(); throw error; }
        if (lifecycle !== this.lifecycle) { component.unload(); return; }
        this.renders.add({ component, nodes: Array.from(container.childNodes) });
        // The shared UI stages Markdown, then moves its nodes into the live card.
        setTimeout(() => {
          for (const item of this.renders) if (!item.nodes.some(node => node.isConnected)) { item.component.unload(); this.renders.delete(item); }
        }, 0);
      },
      openAttachment: attachment => {
        const asset = this.app.vault.getAbstractFileByPath(attachment.path);
        if (asset instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(asset);
        else new Notice('附件已移动或不存在。');
      },
      openLink: value => { const url = safeExternalUrl(value); if (url) window.open(url, '_blank', 'noopener,noreferrer'); },
      exportMarkdown: async () => {
        const current = await this.plugin.repository.read(file.path);
        const folder = file.parent && !file.parent.isRoot() ? file.parent.path : '';
        const target = this.plugin.uniquePath(`${folder ? `${folder}/` : ''}${leafName(current.title)} - 导出`, 'md');
        const exported = await this.app.vault.create(target, exportMarkdown(current, folder));
        await this.plugin.openBoard(exported);
        new Notice('已导出为 Markdown，原看板保持不变。');
      },
      createBoard: () => this.plugin.createBoardDialog(),
      chooseBoard: () => this.plugin.chooseBoard(),
    };
  }

  private async chooseVaultImages(): Promise<Attachment[]> {
    const sourceFile = this.file;
    const files = this.app.vault.getFiles().filter(file => IMAGE_TYPES[file.extension.toLowerCase()]).sort((a, b) => b.stat.mtime - a.stat.mtime);
    if (!files.length) { new Notice('笔记库中还没有图片，可以先添加附件。'); return []; }
    let picker!: VaultImagePicker;
    const selected = await new Promise<TFile | null>(resolve => {
      picker = new VaultImagePicker(this.app, files, resolve); this.imagePicker = picker; picker.open();
    });
    if (this.imagePicker === picker) this.imagePicker = null;
    if (!selected || this.file !== sourceFile) return [];
    if (this.app.vault.getAbstractFileByPath(selected.path) !== selected) throw new Error('这张图片已被删除，请重新选择。');
    return [{ path: selected.path, name: selected.name, mime: IMAGE_TYPES[selected.extension.toLowerCase()] }];
  }

  private async importFiles(files: File[]): Promise<Attachment[]> {
    if (!this.file) throw new Error('请先打开看板。');
    if (files.length > 20) throw new Error('一次最多添加 20 个附件，请分批添加。');
    for (const file of files) {
      if (file.size > MAX_FILE) throw new Error(`“${file.name}”超过 25 MB，请压缩后再添加。`);
      if (!file.size) throw new Error(`“${file.name}”是空文件。`);
    }
    const folder = `${ROOT}/附件/${this.boardId}`;
    await this.plugin.ensureFolder(folder);
    const attachments: Attachment[] = [];
    for (const file of files) {
      const originalName = file.name || '粘贴的图片.png';
      const extension = /\.([a-zA-Z0-9]{1,12})$/.exec(originalName)?.[1].toLowerCase() ?? '';
      const stem = extension ? originalName.slice(0, -(extension.length + 1)) : originalName;
      const name = `${leafName(stem)}${extension ? `.${extension}` : ''}`;
      const path = `${folder}/${createId()}${extension ? `.${extension}` : ''}`;
      await this.app.vault.createBinary(path, await file.arrayBuffer());
      attachments.push({ path, name, mime: IMAGE_TYPES[extension] ?? 'application/octet-stream' });
    }
    return attachments;
  }
}

class BoardPicker extends SuggestModal<TFile> {
  constructor(app: App, private files: TFile[], private select: (file: TFile) => void) { super(app); this.setPlaceholder('搜索看板…'); }
  getSuggestions(query: string): TFile[] { return this.files.filter(file => file.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())); }
  renderSuggestion(file: TFile, el: HTMLElement): void { el.createDiv({ text: file.basename }); el.createEl('small', { text: file.path }); }
  onChooseSuggestion(file: TFile): void { this.select(file); }
}

class VaultImagePicker extends SuggestModal<TFile> {
  constructor(app: App, private files: TFile[], private finish: (file: TFile | null) => void) {
    super(app); this.setPlaceholder('搜索库内图片（文件名或路径）');
  }
  getSuggestions(query: string): TFile[] {
    const search = query.trim().toLocaleLowerCase();
    return this.files.filter(file => file.path.toLocaleLowerCase().includes(search));
  }
  renderSuggestion(file: TFile, container: HTMLElement): void {
    const row = container.createDiv({ cls: 'linb-vault-image-option' });
    const image = row.createEl('img'); image.src = this.app.vault.getResourcePath(file); image.alt = ''; image.loading = 'lazy';
    image.addEventListener('error', () => { image.hidden = true; });
    const label = row.createDiv(); label.createDiv({ text: file.name }); label.createEl('small', { text: file.path });
  }
  onChooseSuggestion(file: TFile): void { this.finish(file); }
  onClose(): void {
    super.onClose();
    // SuggestModal may close before calling onChooseSuggestion; defer cancellation.
    queueMicrotask(() => this.finish(null));
  }
}

class CreateBoardModal extends Modal {
  constructor(app: App, private create: (title: string) => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText('新建看板');
    let title = '我的看板';
    let busy = false;
    const error = this.contentEl.createDiv({ cls: 'linb-create-error' }); error.setAttribute('role', 'alert');
    new Setting(this.contentEl).setName('名称').addText(input => { input.setValue(title).onChange(value => { title = value; }); input.inputEl.setAttribute('aria-label', '看板名称'); setTimeout(() => input.inputEl.select(), 0); });
    new Setting(this.contentEl).addButton(button => button.setButtonText('创建').setCta().onClick(async () => {
      if (busy) return;
      if (!title.trim()) { error.setText('给这面看板起一个名字。'); return; }
      busy = true; button.setDisabled(true); error.empty();
      try { await this.create(title.trim()); this.close(); }
      catch (e) { error.setText(problem(e)); busy = false; button.setDisabled(false); }
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}
