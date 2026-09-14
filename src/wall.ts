import type { Board, BoardOperation, CardPatch, WallCard, WallHost } from './types';
import { createId, createCard, safeExternalUrl } from './model';

const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14', close: 'M6 6l12 12M18 6 6 18', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  wall: 'M3 3h7v8H3zM14 3h7v5h-7zM3 15h7v6H3zM14 12h7v9h-7z', columns: 'M3 4h5v16H3zM10 4h4v16h-4zM16 4h5v16h-5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01', edit: 'm16 3 5 5-12 12-6 1 1-6ZM13 6l5 5',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', image: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M15 7h.01',
  arrow: 'm7 17 10-10M7 7h10v10', down: 'm6 9 6 6 6-6', check: 'm5 12 4 4L19 6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  link: 'm10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  export: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', leaf: 'M20 3C9 2 3 6 4 14c1 8 13 9 16-11ZM5 19l9-10',
  folder: 'M3 6h7l2 3h9v11H3zM3 6V4h7l2 2', up: 'm6 14 6-6 6 6', grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6',
};
let sequence = 0;
function id(prefix = 'moss'): string { return `${prefix}-${++sequence}-${createId()}`; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = cls; if (text) node.textContent = text; return node;
}
function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'more' || name === 'grip' ? '3.5' : '1.65'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', PATHS[name] || PATHS.plus); svg.append(path); return svg;
}
function button(label: string, iconName?: string, cls = 'moss-button', action?: () => void): HTMLButtonElement {
  const node = el('button', cls); node.type = 'button'; node.setAttribute('aria-label', label); if (iconName) node.append(icon(iconName));
  if (!cls.includes('moss-icon-button')) node.append(el('span', '', label)); else node.title = label;
  if (action) node.addEventListener('click', action); return node;
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function cardDraft(card?: WallCard, columnId = ''): CardPatch {
  return { title: card?.title || '', body: card?.body || '', color: card?.color || 'white', columnId: card?.columnId || columnId, attachments: clone(card?.attachments || []), link: card?.link || '' };
}
interface SheetState {
  overlay: HTMLElement; panel: HTMLElement; close: () => void; dirty: () => boolean; busy: boolean; guard: HTMLElement;
  onFiles?: (files: File[]) => Promise<void>;
}

/** A dependency-free interface shared by the Obsidian view and local preview. */
export class WallApp {
  private board: Board;
  private readonly host: WallHost;
  private readonly root: HTMLElement;
  private readonly heading = el('span', 'moss-title');
  private readonly saved = el('span', 'moss-save-status', '已保存');
  private readonly content = el('main', 'moss-content');
  private readonly wallButton: HTMLButtonElement;
  private readonly columnsButton: HTMLButtonElement;
  private readonly toast = el('div', 'moss-toast');
  private renderVersion = 0;
  private pending = 0;
  private sheet: SheetState | null = null;
  private menu: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private draggedId: string | null = null;
  private destroyed = false;
  private lastFocus: HTMLElement | null = null;
  private lastFocusCardId: string | undefined;
  private menuAnchor: HTMLElement | null = null;
  private pointerDrag: { id: string; pointerId: number; handle: HTMLElement; article: HTMLElement; startX: number; startY: number; active: boolean; target: Element | null; clientY: number } | null = null;

  constructor(container: HTMLElement, board: Board, host: WallHost) {
    this.board = clone(board); this.host = host;
    this.root = el('div', 'moss-wall');
    const titleButton = button('重命名', undefined, 'moss-title-button', () => this.openSettings()); titleButton.replaceChildren(this.heading);
    const toolbar = el('div', 'moss-toolbar'); const modes = el('div', 'moss-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '布局方式');
    this.wallButton = button('墙', 'wall', 'moss-mode', () => this.changeLayout('wall'));
    this.columnsButton = button('栏', 'columns', 'moss-mode', () => this.changeLayout('columns')); modes.append(this.columnsButton, this.wallButton);
    const more = button('更多操作', 'more', 'moss-icon-button moss-board-more', () => this.openBoardMenu(more)); more.setAttribute('aria-haspopup', 'menu');
    const tools = el('div', 'moss-toolbar-actions'); tools.append(button('添加卡片', 'plus', 'moss-button moss-primary', () => this.openEditor()), more);
    toolbar.append(titleButton, modes, tools);
    this.content.setAttribute('aria-label', '卡片');
    const body = el('div', 'moss-body'); body.append(toolbar, this.content);
    this.saved.dataset.state = 'saved'; this.saved.setAttribute('role', 'status'); this.saved.setAttribute('aria-live', 'polite');
    this.toast.setAttribute('role', 'status'); this.toast.setAttribute('aria-live', 'polite'); this.toast.hidden = true;
    this.root.append(body, this.saved, this.toast); container.append(this.root);
    this.root.addEventListener('dragover', this.onBoardDragOver); this.root.addEventListener('drop', this.onBoardDrop);
    this.root.addEventListener('dragleave', event => { if (!this.root.contains(event.relatedTarget as Node)) this.root.classList.remove('moss-file-over'); });
    this.root.addEventListener('paste', event => { if (this.sheet) return; const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); this.openEditor(undefined, undefined, files); } });
    this.root.addEventListener('keydown', this.onKeyDown); document.addEventListener('pointerdown', this.onOutsidePointer);
    this.updateHeader(); this.renderContent();
  }

  setBoard(board: Board): void {
    if (this.destroyed) return;
    const changed = board.id !== this.board.id;
    this.board = clone(board);
    if (changed) this.closeSheet();
    this.cancelPointerDrag();
    this.closeMenu(); this.updateHeader(); this.renderContent();
  }

  destroy(): void {
    this.destroyed = true; this.renderVersion++; clearTimeout(this.toastTimer);
    this.cancelPointerDrag();
    document.removeEventListener('pointerdown', this.onOutsidePointer); this.root.remove(); this.sheet = null;
  }

  private updateHeader(): void {
    this.heading.textContent = this.board.title || '未命名看板';
    this.heading.parentElement?.setAttribute('title', this.board.description || this.heading.textContent);
    this.wallButton.setAttribute('aria-pressed', String(this.board.layout === 'wall')); this.columnsButton.setAttribute('aria-pressed', String(this.board.layout === 'columns'));
  }
  private async operate(operation: BoardOperation): Promise<Board> {
    this.pending++; this.saved.textContent = '正在保存…'; this.saved.dataset.state = 'saving';
    try {
      const board = await this.host.save(operation);
      if (!this.destroyed && board.id === this.board.id && board.revision >= this.board.revision) { this.board = clone(board); this.updateHeader(); this.renderContent(); }
      return board;
    } catch (error) { this.saved.textContent = '保存失败'; this.saved.dataset.state = 'error'; throw error; }
    finally { this.pending--; if (!this.destroyed && this.pending === 0 && this.saved.dataset.state !== 'error') { this.saved.textContent = '已保存'; this.saved.dataset.state = 'saved'; } }
  }
  private async simpleOperation(operation: BoardOperation): Promise<void> {
    try { await this.operate(operation); } catch (error) { this.showToast(this.errorMessage(error)); }
  }
  private errorMessage(error: unknown): string { return error instanceof Error ? error.message : '暂时没有保存成功，请重试。'; }
  private changeLayout(layout: 'wall' | 'columns'): void { if (layout !== this.board.layout) void this.simpleOperation({ type: 'board:update', patch: { layout } }); }
  private async exportBoard(): Promise<void> { try { await this.host.exportMarkdown(); this.showToast('Markdown 已导出'); } catch (error) { this.showToast(this.errorMessage(error)); } }

  private renderContent(): void {
    const version = ++this.renderVersion; this.closeMenu(true);
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedCardId = focused?.closest<HTMLElement>('.moss-card')?.dataset.cardId;
    const focusClass = focused?.className;
    const contentScrollTop = this.content.scrollTop;
    const columnsScrollLeft = this.content.querySelector<HTMLElement>('.moss-columns')?.scrollLeft || 0;
    const columnScroll = new Map(Array.from(this.content.querySelectorAll<HTMLElement>('.moss-column')).map(column => [column.dataset.columnId, column.querySelector<HTMLElement>('.moss-column-list')?.scrollTop || 0]));
    const restoreFocus = () => {
      if (!focusedCardId || this.sheet) return;
      const card = Array.from(this.content.querySelectorAll<HTMLElement>('.moss-card')).find(node => node.dataset.cardId === focusedCardId);
      const control = card && Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find(node => node.className === focusClass);
      (control || card?.querySelector<HTMLButtonElement>('.moss-card-title') || this.root.querySelector<HTMLButtonElement>('.moss-toolbar-actions .moss-primary'))?.focus();
    };
    this.content.replaceChildren();
    const cards = this.board.cards;
    if (!this.board.cards.length && this.board.layout === 'wall') {
      const empty = el('div', 'moss-empty');
      empty.append(el('p', '', '还没有卡片'), el('small', '', '添加卡片，或拖入图片和文件。')); this.content.append(empty); restoreFocus(); return;
    }
    if (this.board.layout === 'wall') {
      const wall = el('div', 'moss-grid'); wall.dataset.layout = 'wall'; cards.forEach(card => wall.append(this.renderCard(card, version)));
      wall.addEventListener('dragover', event => { if (this.draggedId && !this.hasFiles(event)) event.preventDefault(); });
      wall.addEventListener('drop', event => { if (!this.draggedId || this.hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); this.commitDrop(this.draggedId, wall, event.clientY); this.clearDragState(); });
      this.content.append(wall);
    } else {
      const columns = el('div', 'moss-columns');
      this.board.columns.forEach(column => {
        const section = el('section', 'moss-column'); section.dataset.columnId = column.id;
        const header = el('div', 'moss-column-header'); const matching = cards.filter(card => card.columnId === column.id);
        const title = button(column.title, undefined, 'moss-column-title', () => this.openColumnEditor(column.id)); title.setAttribute('aria-label', `编辑栏：${column.title}`);
        header.append(title, el('span', 'moss-column-count', String(matching.length)));
        const list = el('div', 'moss-column-list'); matching.forEach(card => list.append(this.renderCard(card, version)));
        const add = button('添加卡片', 'plus', 'moss-column-add', () => this.openEditor(undefined, column.id)); add.setAttribute('aria-label', `向${column.title}添加卡片`);
        section.append(header, list, add);
        section.addEventListener('dragover', event => { if (this.draggedId || this.hasFiles(event)) { event.preventDefault(); section.classList.add('is-drop-target'); } });
        section.addEventListener('dragleave', event => { if (!section.contains(event.relatedTarget as Node)) section.classList.remove('is-drop-target'); });
        section.addEventListener('drop', event => { section.classList.remove('is-drop-target'); if (!this.draggedId || this.hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); this.commitDrop(this.draggedId, section, event.clientY); this.clearDragState(); });
        columns.append(section);
      });
      columns.append(button('添加栏', 'plus', 'moss-add-column', () => this.openColumnEditor())); this.content.append(columns);
    }
    this.content.scrollTop = contentScrollTop;
    const columns = this.content.querySelector<HTMLElement>('.moss-columns');
    if (columns) columns.scrollLeft = columnsScrollLeft;
    this.content.querySelectorAll<HTMLElement>('.moss-column').forEach(column => {
      const list = column.querySelector<HTMLElement>('.moss-column-list');
      if (list) list.scrollTop = columnScroll.get(column.dataset.columnId) || 0;
    });
    restoreFocus();
  }

  private renderCard(card: WallCard, version: number): HTMLElement {
    const article = el('article', 'moss-card'); article.dataset.cardId = card.id;
    const imageAttachment = card.attachments.find(attachment => attachment.mime.startsWith('image/'));
    if (imageAttachment) {
      const cover = button(`打开图片：${imageAttachment.name}`, undefined, 'moss-card-cover', () => this.host.openAttachment(imageAttachment)); cover.replaceChildren();
      const img = el('img'); img.src = this.host.resolveAsset(imageAttachment.path); img.alt = imageAttachment.name; img.loading = 'lazy'; img.draggable = false;
      img.addEventListener('error', () => { cover.replaceChildren(icon('image'), el('span', '', '图片暂时无法显示')); cover.classList.add('moss-image-error'); }); cover.append(img); article.append(cover);
    }
    const inner = el('div', 'moss-card-inner'); const head = el('div', 'moss-card-head');
    const title = button(card.title || '未命名卡片', undefined, 'moss-card-title', () => this.openEditor(card));
    const more = button(`卡片操作：${card.title || '未命名卡片'}`, 'more', 'moss-icon-button moss-card-more', () => this.openCardMenu(card, more)); more.setAttribute('aria-haspopup', 'menu');
    const grip = button(`移动卡片：${card.title || '未命名卡片'}`, 'grip', 'moss-icon-button moss-card-grip', () => this.openCardMenu(card, grip)); grip.draggable = true;
    grip.setAttribute('aria-haspopup', 'menu'); grip.title = '拖动排序，或点按选择移动位置';
    this.bindPointerDrag(grip, article, card);
    head.append(grip, title, more); inner.append(head);
    if (card.body.trim()) {
      const body = el('div', 'moss-card-body'); body.addEventListener('dblclick', () => this.openEditor(card));
      const staging = el('div');
      try {
        Promise.resolve(this.host.renderMarkdown(card.body, staging)).then(() => {
          if (!this.destroyed && version === this.renderVersion && body.isConnected) body.replaceChildren(...Array.from(staging.childNodes));
        }).catch(() => { if (!this.destroyed && version === this.renderVersion && body.isConnected) body.textContent = card.body; });
      } catch { body.textContent = card.body; }
      inner.append(body);
    }
    const safeUrl = safeExternalUrl(card.link);
    if (safeUrl) {
      const link = button(new URL(safeUrl).hostname.replace(/^www\./, ''), 'link', 'moss-link-pill', () => this.host.openLink(safeUrl)); link.append(icon('arrow')); link.title = safeUrl; inner.append(link);
    }
    const otherAttachments = card.attachments.filter(attachment => attachment !== imageAttachment);
    if (otherAttachments.length) { const attachments = el('div', 'moss-card-attachments'); otherAttachments.forEach(attachment => attachments.append(button(attachment.name, attachment.mime.startsWith('image/') ? 'image' : 'file', 'moss-attachment-link', () => this.host.openAttachment(attachment)))); inner.append(attachments); }
    const footer = el('div', 'moss-card-footer'); const column = this.board.columns.find(item => item.id === card.columnId);
    if (column && this.board.layout === 'wall') { footer.append(el('span', 'moss-card-column', column.title)); inner.append(footer); }
    article.append(inner);
    grip.addEventListener('dragstart', event => { if (this.pointerDrag) { event.preventDefault(); return; } this.closeMenu(); this.draggedId = card.id; event.dataTransfer?.setData('text/plain', card.id); if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setDragImage(article, 16, 16); } article.classList.add('is-dragging'); });
    grip.addEventListener('dragend', () => this.clearDragState());
    article.addEventListener('dragover', event => { if (this.draggedId && this.draggedId !== card.id) { event.preventDefault(); event.stopPropagation(); article.classList.add('is-drop-target'); } });
    article.addEventListener('dragleave', event => { if (!article.contains(event.relatedTarget as Node)) article.classList.remove('is-drop-target'); });
    article.addEventListener('drop', event => {
      if (!this.draggedId || this.hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation(); article.classList.remove('is-drop-target');
      this.commitDrop(this.draggedId, article, event.clientY); this.clearDragState();
    });
    return article;
  }

  private commitDrop(cardId: string, target: Element, clientY: number): void {
    const moving = this.board.cards.find(card => card.id === cardId);
    if (!moving || !this.root.contains(target)) return;
    const targetCardEl = target.closest<HTMLElement>('.moss-card');
    const targetCard = this.board.cards.find(card => card.id === targetCardEl?.dataset.cardId);
    if (targetCard?.id === moving.id) return;
    const columnId = this.board.layout === 'columns'
      ? targetCard?.columnId || target.closest<HTMLElement>('.moss-column')?.dataset.columnId
      : moving.columnId;
    if (!columnId) return;
    let beforeId = targetCard?.id;
    if (targetCard && targetCardEl) {
      const rect = targetCardEl.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) {
        const order = this.board.cards.filter(card => card.id !== moving.id && (this.board.layout === 'wall' || card.columnId === columnId));
        beforeId = order[order.findIndex(card => card.id === targetCard.id) + 1]?.id;
      }
    }
    void this.simpleOperation({ type: 'card:move', id: moving.id, columnId, beforeId });
  }

  /** Touch dragging is restricted to the handle; the rest of a card scrolls normally. */
  private bindPointerDrag(handle: HTMLElement, article: HTMLElement, card: WallCard): void {
    let suppressClickUntil = 0;
    handle.addEventListener('click', event => { if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    handle.addEventListener('pointerdown', event => {
      if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || event.button !== 0 || this.sheet) return;
      this.cancelPointerDrag(); this.closeMenu();
      this.pointerDrag = { id: card.id, pointerId: event.pointerId, handle, article, startX: event.clientX, startY: event.clientY, active: false, target: null, clientY: event.clientY };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      const drag = this.pointerDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      event.preventDefault(); drag.active = true; this.draggedId = drag.id; article.classList.add('is-dragging');
      const hit = this.root.ownerDocument.elementFromPoint?.(event.clientX, event.clientY);
      const list = hit?.closest('.moss-column')?.querySelector<HTMLElement>('.moss-column-list');
      if (list) {
        const listRect = list.getBoundingClientRect();
        if (event.clientY < listRect.top + 40) list.scrollTop -= 12;
        else if (event.clientY > listRect.bottom - 40) list.scrollTop += 12;
      }
      const contentRect = this.content.getBoundingClientRect();
      if (event.clientY < contentRect.top + 40) this.content.scrollTop -= 12;
      else if (event.clientY > contentRect.bottom - 40) this.content.scrollTop += 12;
      const columns = this.content.querySelector<HTMLElement>('.moss-columns');
      if (columns) {
        const rect = columns.getBoundingClientRect();
        if (event.clientX < rect.left + 40) columns.scrollLeft -= 12;
        else if (event.clientX > rect.right - 40) columns.scrollLeft += 12;
      }
      const target = hit?.closest('.moss-card, .moss-column, .moss-grid') || null;
      this.root.querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target'));
      drag.target = target && this.root.contains(target) && target !== article ? target : null; drag.clientY = event.clientY;
      drag.target?.classList.add('is-drop-target');
    });
    handle.addEventListener('pointerup', event => {
      const drag = this.pointerDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.active) { event.preventDefault(); suppressClickUntil = Date.now() + 400; if (drag.target) this.commitDrop(drag.id, drag.target, drag.clientY); }
      this.cancelPointerDrag();
    });
    handle.addEventListener('pointercancel', () => this.cancelPointerDrag());
    handle.addEventListener('lostpointercapture', () => this.cancelPointerDrag());
  }
  private clearDragState(): void {
    this.draggedId = null;
    this.root.querySelectorAll('.is-dragging, .is-drop-target').forEach(node => node.classList.remove('is-dragging', 'is-drop-target'));
  }
  private cancelPointerDrag(): void {
    const drag = this.pointerDrag; this.pointerDrag = null;
    if (drag?.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    this.clearDragState();
  }

  private openBoardMenu(anchor: HTMLElement): void {
    this.closeMenu(); const menu = el('div', 'moss-menu'); menu.setAttribute('role', 'menu');
    const action = (label: string, symbol: string, run: () => void) => {
      const item = button(label, symbol, 'moss-menu-item', () => { this.closeMenu(true); this.requestCloseSheet(run); }); item.setAttribute('role', 'menuitem'); menu.append(item);
    };
    action('重命名', 'edit', () => this.openSettings());
    action('切换看板', 'folder', () => this.host.chooseBoard());
    action('新建看板', 'plus', () => this.host.createBoard());
    action('导出为 Markdown', 'export', () => void this.exportBoard());
    this.showMenu(menu, anchor);
  }

  private openCardMenu(card: WallCard, anchor: HTMLElement): void {
    this.closeMenu(); const menu = el('div', 'moss-menu'); menu.setAttribute('role', 'menu');
    const action = (label: string, symbol: string, run: () => void, destructive = false) => { const b = button(label, symbol, `moss-menu-item${destructive ? ' moss-danger' : ''}`, () => { this.closeMenu(true); run(); }); b.setAttribute('role', 'menuitem'); menu.append(b); };
    action('编辑卡片', 'edit', () => this.openEditor(card));
    const order = this.board.layout === 'wall' ? this.board.cards : this.board.cards.filter(item => item.columnId === card.columnId); const index = order.findIndex(item => item.id === card.id);
    if (index > 0) action('向前移动', 'up', () => void this.simpleOperation({ type: 'card:move', id: card.id, columnId: card.columnId, beforeId: order[index - 1].id }));
    if (index < order.length - 1) action('向后移动', 'down', () => void this.simpleOperation({ type: 'card:move', id: card.id, columnId: card.columnId, beforeId: order[index + 2]?.id }));
    if (this.board.columns.length > 1) {
      menu.append(el('div', 'moss-menu-label', '移动到栏'));
      this.board.columns.filter(column => column.id !== card.columnId).forEach(column => action(column.title, 'columns', () => void this.simpleOperation({ type: 'card:move', id: card.id, columnId: column.id })));
    }
    menu.append(el('div', 'moss-menu-divider')); action('删除卡片', 'trash', () => void this.deleteCard(card), true);
    this.showMenu(menu, anchor);
  }
  private showMenu(menu: HTMLElement, anchor: HTMLElement): void {
    this.root.append(menu); this.menu = menu; this.menuAnchor = anchor; const rootRect = this.root.getBoundingClientRect(); const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right - rootRect.left - menu.offsetWidth, rootRect.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom - rootRect.top + 5, rootRect.height - menu.offsetHeight - 12))}px`;
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }
  private closeMenu(restoreFocus = false): void { this.menu?.remove(); this.menu = null; if (restoreFocus && this.menuAnchor?.isConnected) this.menuAnchor.focus(); this.menuAnchor = null; }
  private async deleteCard(card: WallCard): Promise<void> {
    const original = clone(card); const beforeId = this.board.cards[this.board.cards.findIndex(item => item.id === card.id) + 1]?.id;
    try { await this.operate({ type: 'card:delete', id: card.id, expectedUpdatedAt: card.updatedAt }); this.showToast('卡片已删除', '撤销', async () => { await this.operate({ type: 'card:add', card: original, beforeId: this.board.cards.some(item => item.id === beforeId) ? beforeId : undefined }); this.showToast('卡片已恢复'); }); }
    catch (error) { this.showToast(this.errorMessage(error)); }
  }

  private createSheet(title: string, subtitle: string, dirty: () => boolean): { state: SheetState; content: HTMLElement; footer: HTMLElement; error: HTMLElement } {
    this.closeMenu(); this.closeSheet(); this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.lastFocusCardId = this.lastFocus?.closest<HTMLElement>('.moss-card')?.dataset.cardId;
    const overlay = el('div', 'moss-editor-overlay'); const panel = el('section', 'moss-editor'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.tabIndex = -1;
    const header = el('div', 'moss-editor-header'); const heading = el('div'); const titleNode = el('h2', '', title); titleNode.id = id('moss-sheet-title'); panel.setAttribute('aria-labelledby', titleNode.id); heading.append(titleNode); if (subtitle) heading.append(el('p', '', subtitle));
    header.append(heading, button('关闭编辑面板', 'close', 'moss-icon-button', () => this.requestCloseSheet()));
    const guard = el('div', 'moss-unsaved'); guard.hidden = true; guard.append(el('p', '', '还有未保存的修改'), button('继续编辑', undefined, 'moss-button', () => { guard.hidden = true; panel.querySelector<HTMLElement>('input:not([type=file]), textarea, select')?.focus(); }), button('放弃修改', undefined, 'moss-button moss-danger', () => { const close = this.sheet?.close; this.closeSheet(); close?.(); }));
    const content = el('div', 'moss-editor-content'); const error = el('div', 'moss-form-error'); error.hidden = true; error.setAttribute('role', 'alert'); const footer = el('div', 'moss-editor-footer');
    panel.append(header, guard, content, error, footer); overlay.append(panel); this.root.append(overlay);
    const state: SheetState = { overlay, panel, guard, dirty, busy: false, close: () => {} }; this.sheet = state;
    overlay.addEventListener('click', event => { if (event.target === overlay) this.requestCloseSheet(); });
    queueMicrotask(() => { if (this.sheet === state) panel.querySelector<HTMLElement>('input, textarea, select, button')?.focus(); });
    return { state, content, footer, error };
  }
  private setSheetBusy(state: SheetState, busy: boolean): void {
    state.busy = busy;
    state.panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button').forEach(control => { control.disabled = busy; });
  }
  private requestCloseSheet(after?: () => void): void {
    if (!this.sheet) { after?.(); return; }
    if (this.sheet.busy) { this.showToast('正在保存或导入附件，请稍候'); return; }
    if (this.sheet.dirty()) { this.sheet.close = after || (() => {}); this.sheet.guard.hidden = false; this.sheet.guard.querySelector<HTMLButtonElement>('button')?.focus(); return; }
    this.closeSheet(); after?.();
  }
  private closeSheet(): void {
    if (!this.sheet) return; this.sheet.overlay.remove(); this.sheet = null;
    if (this.lastFocus?.isConnected) this.lastFocus.focus();
    else if (this.lastFocusCardId) {
      const card = Array.from(this.content.querySelectorAll<HTMLElement>('.moss-card')).find(node => node.dataset.cardId === this.lastFocusCardId);
      (card?.querySelector<HTMLButtonElement>('.moss-card-title') || this.root.querySelector<HTMLButtonElement>('.moss-toolbar-actions .moss-primary'))?.focus();
    }
    this.lastFocus = null; this.lastFocusCardId = undefined;
  }
  private field(label: string, control: HTMLElement, hint = ''): HTMLElement {
    const group = el('div', 'moss-field'); const key = id('moss-field'); control.id = key;
    const labelNode = el('label', 'moss-field-label', label); labelNode.htmlFor = key; if (control instanceof HTMLDivElement) { labelNode.id = `${key}-label`; control.setAttribute('aria-labelledby', labelNode.id); } group.append(labelNode, control); if (hint) group.append(el('small', 'moss-field-hint', hint)); return group;
  }
  private input(value = '', placeholder = ''): HTMLInputElement { const input = el('input', 'moss-input'); input.type = 'text'; input.value = value; input.placeholder = placeholder; return input; }
  private openEditor(card?: WallCard, columnId?: string, initialFiles?: File[]): void {
    if (this.sheet) { this.requestCloseSheet(() => this.openEditor(card, columnId, initialFiles)); return; }
    const original = card ? clone(card) : undefined; const draft = cardDraft(original, columnId || this.board.columns[0]?.id || ''); const initial = JSON.stringify(draft);
    const { state, content, footer, error } = this.createSheet(original ? '编辑卡片' : '添加卡片', '', () => JSON.stringify(draft) !== initial);
    const title = this.input(draft.title, '标题（可选）'); title.maxLength = 240; title.addEventListener('input', () => { draft.title = title.value; });
    const body = el('textarea', 'moss-input moss-body-input'); body.value = draft.body || ''; body.placeholder = '写点内容…'; body.rows = 8; body.addEventListener('input', () => { draft.body = body.value; });
    const column = el('select', 'moss-input'); this.board.columns.forEach(item => { const option = el('option', '', item.title); option.value = item.id; column.append(option); }); column.value = draft.columnId || ''; column.addEventListener('change', () => { draft.columnId = column.value; });
    const url = this.input(draft.link, 'https://'); url.type = 'url'; url.addEventListener('input', () => { draft.link = url.value; url.removeAttribute('aria-invalid'); });
    content.append(this.field('标题', title), this.field('内容', body, '支持 Markdown'), this.field('所属分栏', column), this.field('链接（可选）', url));
    const attachments = el('div', 'moss-editor-attachments');
    const picker = el('input', 'moss-file-input'); picker.type = 'file'; picker.multiple = true; picker.tabIndex = -1; picker.setAttribute('aria-label', '选择图片或附件');
    const addImage = button('添加附件', 'file', 'moss-upload-button', () => picker.click());
    const uploadHint = el('span', 'moss-upload-hint', '支持图片、文件，也可拖入或粘贴'); const upload = el('div', 'moss-upload'); upload.append(addImage, uploadHint, picker);
    content.append(this.field('图片与附件', attachments), upload);
    const renderAttachments = () => {
      attachments.replaceChildren(); (draft.attachments || []).forEach((attachment, index) => {
        const figure = el('div', 'moss-editor-attachment');
        if (attachment.mime.startsWith('image/')) { const img = el('img'); img.src = this.host.resolveAsset(attachment.path); img.alt = attachment.name; figure.append(img); }
        else figure.append(icon('file'));
        const name = el('span', '', attachment.name); name.title = attachment.name;
        figure.append(name, button(`移除附件：${attachment.name}`, 'close', 'moss-icon-button', () => { draft.attachments?.splice(index, 1); renderAttachments(); })); attachments.append(figure);
      });
    };
    renderAttachments();
    const cancel = button('取消', undefined, 'moss-button', () => this.requestCloseSheet());
    const save = button(original ? '保存修改' : '添加卡片', 'check', 'moss-button moss-primary', () => void submit());
    footer.append(cancel, save);
    const setBusy = (busy: boolean, text = '') => { this.setSheetBusy(state, busy); save.disabled = busy; cancel.disabled = busy; addImage.disabled = busy; save.querySelector('span')!.textContent = busy ? text : original ? '保存修改' : '添加卡片'; };
    const importFiles = async (files: File[]) => {
      if (state.busy || !files.length) return;
      setBusy(true, '正在导入…'); error.hidden = true;
      try { const imported = await this.host.importFiles(files); if (this.sheet !== state || this.destroyed) return; draft.attachments = [...(draft.attachments || []), ...imported]; renderAttachments(); }
      catch (failure) { if (this.sheet === state) { error.hidden = false; error.textContent = this.errorMessage(failure); } }
      finally { if (this.sheet === state) { setBusy(false); picker.value = ''; } }
    };
    state.onFiles = importFiles; picker.addEventListener('change', () => void importFiles(Array.from(picker.files || [])));
    state.panel.addEventListener('paste', event => { const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); void importFiles(files); } });
    const submit = async () => {
      if (state.busy) return;
      error.hidden = true; draft.title = title.value.trim(); draft.body = body.value; draft.link = url.value.trim();
      if (!draft.title && !draft.body?.trim() && !draft.attachments?.length && !draft.link) { error.textContent = '请写入内容或添加附件。'; error.hidden = false; title.focus(); return; }
      if (draft.link && !safeExternalUrl(draft.link)) { error.textContent = '链接请以 https:// 或 http:// 开头。'; error.hidden = false; url.setAttribute('aria-invalid', 'true'); url.focus(); return; }
      if (!this.board.columns.some(item => item.id === draft.columnId)) { error.textContent = '这个分栏已经不存在，请选择其他分栏后保存。'; error.hidden = false; return; }
      setBusy(true, '正在保存…');
      try {
        if (original) await this.operate({ type: 'card:update', id: original.id, patch: clone(draft), expectedUpdatedAt: original.updatedAt });
        else { const created = createCard(draft.columnId || '', clone(draft)); await this.operate({ type: 'card:add', card: created }); }
        if (this.sheet === state) this.closeSheet(); this.showToast(original ? '卡片已更新' : '卡片已添加');
      } catch (failure) { if (this.sheet === state) { error.hidden = false; error.textContent = `${this.errorMessage(failure)} 你的内容仍保留在这里，可以复制后重试。`; } }
      finally { if (this.sheet === state) setBusy(false); }
    };
    state.panel.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } });
    queueMicrotask(() => { if (this.sheet === state) title.focus(); });
    if (initialFiles?.length) void importFiles(initialFiles);
  }

  private openSettings(): void {
    if (this.sheet) { this.requestCloseSheet(() => this.openSettings()); return; }
    const draft = { title: this.board.title, description: this.board.description }; const initial = JSON.stringify(draft);
    const { state, content, footer, error } = this.createSheet('重命名', '', () => JSON.stringify(draft) !== initial);
    const title = this.input(draft.title, '看板名称'); title.maxLength = 120; title.addEventListener('input', () => { draft.title = title.value; });
    const description = el('textarea', 'moss-input'); description.rows = 3; description.value = draft.description; description.placeholder = '说明（可选）'; description.addEventListener('input', () => { draft.description = description.value; });
    content.append(this.field('名称', title), this.field('说明（可选）', description));
    const cancel = button('取消', undefined, 'moss-button', () => this.requestCloseSheet()); const save = button('保存', 'check', 'moss-button moss-primary', async () => {
      if (state.busy) return; if (!draft.title.trim()) { error.textContent = '请填写看板名称。'; error.hidden = false; title.focus(); return; }
      this.setSheetBusy(state, true); save.disabled = true; error.hidden = true;
      try { await this.operate({ type: 'board:update', patch: { ...draft, title: draft.title.trim() } }); if (this.sheet === state) this.closeSheet(); this.showToast('已保存'); }
      catch (failure) { if (this.sheet === state) { error.textContent = this.errorMessage(failure); error.hidden = false; } }
      finally { this.setSheetBusy(state, false); save.disabled = false; }
    }); footer.append(cancel, save); queueMicrotask(() => { if (this.sheet === state) title.focus(); });
  }

  private openColumnEditor(columnId?: string): void {
    if (this.sheet) { this.requestCloseSheet(() => this.openColumnEditor(columnId)); return; }
    const column = this.board.columns.find(item => item.id === columnId); const draft = { title: column?.title || '' }; const initial = JSON.stringify(draft);
    const { state, content, footer, error } = this.createSheet(column ? '编辑栏' : '添加栏', '', () => JSON.stringify(draft) !== initial);
    const title = this.input(draft.title, '栏名称'); title.maxLength = 80; title.addEventListener('input', () => { draft.title = title.value; });
    content.append(this.field('栏名称', title));
    if (column && this.board.columns.length > 1) {
      const transfer = el('select', 'moss-input'); this.board.columns.filter(item => item.id !== column.id).forEach(item => { const option = el('option', '', item.title); option.value = item.id; transfer.append(option); });
      const removal = el('div', 'moss-column-removal'); removal.append(el('p', '', '删除栏时，将卡片移动到：'), transfer, button('删除此栏', 'trash', 'moss-button moss-danger', async () => {
        if (state.busy) return; this.setSheetBusy(state, true);
        try { await this.operate({ type: 'column:delete', id: column.id, moveToId: transfer.value }); if (this.sheet === state) this.closeSheet(); this.showToast('栏已删除，卡片已转移'); }
        catch (failure) { error.textContent = this.errorMessage(failure); error.hidden = false; } finally { this.setSheetBusy(state, false); }
      })); content.append(removal);
    }
    const cancel = button('取消', undefined, 'moss-button', () => this.requestCloseSheet()); const save = button(column ? '保存栏' : '添加栏', 'check', 'moss-button moss-primary', async () => {
      if (state.busy) return; if (!draft.title.trim()) { error.textContent = '请填写栏名称。'; error.hidden = false; title.focus(); return; }
      this.setSheetBusy(state, true); save.disabled = true; error.hidden = true;
      try { await this.operate(column ? { type: 'column:update', id: column.id, patch: { title: draft.title.trim() } } : { type: 'column:add', column: { id: id('column'), title: draft.title.trim(), color: 'white' } }); if (this.sheet === state) this.closeSheet(); this.showToast(column ? '栏已更新' : '栏已添加'); }
      catch (failure) { error.textContent = this.errorMessage(failure); error.hidden = false; }
      finally { this.setSheetBusy(state, false); save.disabled = false; }
    }); footer.append(cancel, save); queueMicrotask(() => { if (this.sheet === state) title.focus(); });
  }

  private showToast(message: string, actionLabel?: string, action?: () => Promise<void>): void {
    if (this.destroyed) return; clearTimeout(this.toastTimer); this.toast.replaceChildren(el('span', '', message));
    if (actionLabel && action) { const actionButton = button(actionLabel, undefined, 'moss-toast-action', async () => { clearTimeout(this.toastTimer); actionButton.disabled = true; try { await action(); } catch (failure) { this.showToast(this.errorMessage(failure)); } }); this.toast.append(actionButton); }
    this.toast.append(button('关闭提示', 'close', 'moss-icon-button', () => { this.toast.hidden = true; })); this.toast.hidden = false;
    this.toastTimer = setTimeout(() => { this.toast.hidden = true; }, action ? 15000 : 6500);
  }
  private hasFiles(event: DragEvent): boolean { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
  private onBoardDragOver = (event: DragEvent): void => { if (this.hasFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; this.root.classList.add('moss-file-over'); } };
  private onBoardDrop = (event: DragEvent): void => {
    this.root.classList.remove('moss-file-over'); this.root.querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target')); if (!this.hasFiles(event)) return; event.preventDefault(); event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files || []); if (!files.length) return;
    const columnId = (event.target instanceof Element ? event.target.closest<HTMLElement>('.moss-column')?.dataset.columnId : undefined);
    if (this.sheet?.onFiles) void this.sheet.onFiles(files); else if (this.sheet) this.showToast('请先保存或关闭当前面板，再添加附件'); else this.openEditor(undefined, columnId, files);
  };
  private onOutsidePointer = (event: PointerEvent): void => { if (this.menu && !this.menu.contains(event.target as Node) && !this.menuAnchor?.contains(event.target as Node)) this.closeMenu(); };
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { if (this.menu) { this.closeMenu(true); event.preventDefault(); } else if (this.sheet) { this.requestCloseSheet(); event.preventDefault(); } }
    if (this.menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button')); const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus(); event.preventDefault();
    }
    if (event.key === 'Tab' && this.sheet) {
      const focusables = Array.from(this.sheet.panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type=file]), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(node => !node.closest('[hidden]'));
      const first = focusables[0]; const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
}
