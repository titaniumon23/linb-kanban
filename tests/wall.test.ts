import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyOperation, createBoard, createCard, parseBoard, serializeBoard } from '../src/model';
import { WallApp } from '../src/wall';
import { renderPreviewMarkdown } from '../preview/markdown';
import type { Attachment, Board, BoardOperation, WallHost } from '../src/types';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function sampleBoard(): Board {
  const board = createBoard('测试看板');
  board.layout = 'wall';
  board.cards = [
    createCard(board.columns[0].id, { title: '文字卡片', body: '**内容一**' }),
    createCard(board.columns[0].id, { title: '待移动卡片', body: '保留文字与顺序。' }),
    createCard(board.columns[1].id, { title: '另一栏的卡片', body: '内容二' }),
    createCard(board.columns[0].id, { title: '栏内末尾卡片', body: '内容三' }),
    createCard(board.columns[2].id, { title: '最后一栏的卡片', body: '内容四' }),
  ];
  return board;
}

function fixture(t: TestContext, initial: Board = sampleBoard(), renderer?: WallHost['renderMarkdown']) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://linb.test/' });
  const globals = ['window', 'document', 'Element', 'HTMLElement', 'HTMLDivElement', 'Node', 'File', 'Event', 'KeyboardEvent'] as const;
  const descriptors = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] });
  const root = dom.window.document.getElementById('app')!;
  let stored = serializeBoard(initial);
  let nextSaveResponse: Promise<void> | undefined;
  let nextImportResponse: Promise<void> | undefined;
  const imports: File[][] = [];
  const opened: Attachment[] = [];
  const operations: BoardOperation[] = [];
  const host: WallHost = {
    async save(operation) {
      operations.push(structuredClone(operation));
      const next = applyOperation(parseBoard(stored), operation);
      stored = serializeBoard(next);
      const response = stored;
      const deferred = nextSaveResponse;
      nextSaveResponse = undefined;
      if (deferred) await deferred;
      return parseBoard(response);
    },
    async importFiles(files) {
      imports.push(files);
      const deferred = nextImportResponse;
      nextImportResponse = undefined;
      if (deferred) await deferred;
      return files.map(file => ({ path: `附件/${file.name}`, name: file.name, mime: file.type }));
    },
    resolveAsset(path) { return `https://linb.test/${encodeURI(path)}`; },
    renderMarkdown: renderer || ((text, container) => { container.textContent = text; }),
    openAttachment(attachment) { opened.push(attachment); }, openLink() {}, async exportMarkdown() {}, createBoard() {}, chooseBoard() {},
  };
  let app = new WallApp(root, parseBoard(stored), host);
  t.after(() => {
    app.destroy(); dom.window.close();
    for (const name of globals) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  return {
    root, dom, operations, imports, opened, host,
    board: () => parseBoard(stored),
    deferImportResponse() {
      let release!: () => void;
      nextImportResponse = new Promise<void>(resolve => { release = resolve; });
      return release;
    },
    deferSaveResponse() {
      let release!: () => void;
      nextSaveResponse = new Promise<void>(resolve => { release = resolve; });
      return release;
    },
    externalChange(operation: BoardOperation) {
      stored = serializeBoard(applyOperation(parseBoard(stored), operation));
      app.setBoard(parseBoard(stored));
    },
    reopen() { app.destroy(); app = new WallApp(root, parseBoard(stored), host); },
  };
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  const matches = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(node => node.getAttribute('aria-label') === label);
  assert.equal(matches.length, 1, `Expected one button named "${label}"`);
  return matches[0];
}

function dialog(root: ParentNode): HTMLElement {
  const panel = root.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(panel, 'Expected an open editor');
  return panel;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(root: ParentNode, label: string): T {
  const element = Array.from(root.querySelectorAll<HTMLLabelElement>('label')).find(node => node.textContent === label);
  assert.ok(element?.htmlFor, `Expected a labeled field "${label}"`);
  const control = element.ownerDocument.getElementById(element.htmlFor);
  assert.ok(control, `Expected the control for "${label}"`);
  return control as T;
}

function fill(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  control.value = value;
  control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function card(root: ParentNode, id: string): HTMLElement {
  const element = Array.from(root.querySelectorAll<HTMLElement>('article')).find(node => node.dataset.cardId === id);
  assert.ok(element, `Expected card ${id} to be visible`);
  return element;
}

function cardIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('article')).map(node => node.dataset.cardId!);
}

function menuAction(root: ParentNode, title: string, action: string) {
  button(root, `卡片操作：${title}`).click();
  const menu = root.querySelector('[role="menu"]');
  assert.ok(menu, 'Expected the card menu');
  button(menu, action).click();
}

test('create and edit a card with text and column, then reopen persisted content', async t => {
  const h = fixture(t, createBoard());
  button(h.root.querySelector('.linb-toolbar')!, '添加卡片').click();
  await settle();
  let editor = dialog(h.root);
  fill(field(editor, '标题'), '周末去看展');
  fill(field(editor, '卡片颜色'), 'gray');
  fill(field(editor, '内容'), '## 计划\n\n- [ ] 带相机\n- [ ] 写下喜欢的作品');
  fill(field(editor, '所属分栏'), h.board().columns[1].id);
  button(editor, '添加卡片').click();
  await settle();
  assert.equal(h.root.querySelector('[role="dialog"]'), null);
  const added = h.board().cards[0];
  assert.equal(added.color, 'gray');
  assert.equal(card(h.root, added.id).dataset.cardColor, 'gray');
  assert.equal(added.title, '周末去看展');
  assert.equal(added.columnId, h.board().columns[1].id);
  assert.match(card(h.root, added.id).textContent!, /带相机/);

  const cardTitle = button(h.root, added.title);
  cardTitle.focus();
  cardTitle.click();
  editor = dialog(h.root);
  assert.equal(field<HTMLInputElement>(editor, '标题').value, added.title);
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').value, added.body);
  fill(field(editor, '标题'), '周末看展 · 已预约');
  fill(field(editor, '内容'), '**下午三点**，美术馆门口见。');
  button(editor, '保存修改').click();
  await settle();
  assert.equal(h.board().cards.length, 1);
  assert.equal(h.board().cards[0].id, added.id);
  assert.equal(h.dom.window.document.activeElement, button(h.root, '周末看展 · 已预约'));
  assert.equal(h.dom.window.document.activeElement?.isConnected, true);
  h.reopen();
  await settle();
  button(h.root, '周末看展 · 已预约').click();
  editor = dialog(h.root);
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').value, '**下午三点**，美术馆门口见。');
  assert.equal(field<HTMLSelectElement>(editor, '所属分栏').value, added.columnId);
});

test('layout switches persist, preserve card content and order, and reopen in the chosen mode', async t => {
  const h = fixture(t);
  const initialCards = h.board().cards;
  button(h.root, '栏').click();
  await settle();
  assert.equal(h.board().layout, 'columns');
  assert.deepEqual(h.board().cards, initialCards);
  assert.equal(button(h.root, '栏').getAttribute('aria-pressed'), 'true');
  h.reopen();
  assert.equal(button(h.root, '栏').getAttribute('aria-pressed'), 'true');
  for (const column of h.board().columns) {
    const section = Array.from(h.root.querySelectorAll<HTMLElement>('section')).find(node => node.dataset.columnId === column.id);
    assert.ok(section);
    assert.deepEqual(cardIds(section), initialCards.filter(item => item.columnId === column.id).map(item => item.id));
  }
  button(h.root, '墙').click();
  await settle();
  h.reopen();
  assert.equal(button(h.root, '墙').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(cardIds(h.root), initialCards.map(item => item.id));
});

test('a delayed older save response cannot replace a newer external board refresh', async t => {
  const h = fixture(t);
  const initialCount = h.board().cards.length;
  const release = h.deferSaveResponse();
  button(h.root, '栏').click();
  assert.equal(h.board().revision, 1, 'The host has saved the layout, but its response is pending');
  const added = createCard(h.board().columns[0].id, { title: '其他窗口刚加入的灵感', body: '更新的内容必须一直可见。' });
  h.externalChange({ type: 'card:add', card: added });
  assert.equal(h.board().revision, 2);
  assert.equal(cardIds(h.root).length, initialCount + 1);
  assert.ok(card(h.root, added.id));
  release();
  await settle();
  assert.equal(h.board().revision, 2);
  assert.equal(cardIds(h.root).length, initialCount + 1, 'The old response must not hide the newly added card');
  assert.match(card(h.root, added.id).textContent!, /更新的内容必须一直可见/);
  assert.equal(button(h.root, '栏').getAttribute('aria-pressed'), 'true');
});

test('deleting a card and undoing restores its exact content and position after reopening', async t => {
  const h = fixture(t);
  const before = h.board().cards;
  const removed = before[1];
  menuAction(h.root, removed.title, '删除卡片');
  await settle();
  assert.equal(h.board().cards.some(item => item.id === removed.id), false);
  assert.equal(cardIds(h.root).includes(removed.id), false);
  button(h.root, '撤销').click();
  await settle();
  assert.deepEqual(h.board().cards, before);
  h.reopen();
  await settle();
  assert.deepEqual(cardIds(h.root), before.map(item => item.id));
  assert.ok(card(h.root, removed.id).textContent!.includes(removed.title));
});

test('a stale save leaves the draft editable, shows the conflict, and preserves the other window content', async t => {
  const h = fixture(t);
  const original = h.board().cards[0];
  button(h.root, original.title).click();
  const editor = dialog(h.root);
  fill(field(editor, '标题'), '我尚未保存的标题');
  fill(field(editor, '内容'), '这些草稿内容必须保留下来。');
  h.externalChange({ type: 'card:update', id: original.id, patch: { title: '其他窗口的新标题', body: '已保存的新内容' } });
  assert.equal(dialog(h.root), editor);
  button(editor, '保存修改').click();
  await settle();
  assert.equal(dialog(h.root), editor);
  const error = editor.querySelector<HTMLElement>('[role="alert"]')!;
  assert.equal(error.hidden, false);
  assert.match(error.textContent!, /其他窗口修改/);
  assert.equal(field<HTMLInputElement>(editor, '标题').value, '我尚未保存的标题');
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').value, '这些草稿内容必须保留下来。');
  assert.equal(button(editor, '保存修改').disabled, false);
  assert.equal(h.board().cards[0].title, '其他窗口的新标题');
  assert.equal(h.board().cards[0].body, '已保存的新内容');
  button(editor, '取消').click();
  assert.equal(dialog(h.root), editor, 'Unsaved text requires an explicit discard');
  button(editor, '继续编辑').click();
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').value, '这些草稿内容必须保留下来。');
});

test('card menu moves forward/backward in wall order and moves between columns persistently', async t => {
  const h = fixture(t);
  const before = h.board().cards;
  const moving = before[1];
  menuAction(h.root, moving.title, '向前移动');
  await settle();
  assert.deepEqual(cardIds(h.root), [moving.id, before[0].id, ...before.slice(2).map(item => item.id)]);
  assert.equal(h.board().cards[0].columnId, moving.columnId);
  menuAction(h.root, moving.title, '向后移动');
  await settle();
  assert.deepEqual(cardIds(h.root), before.map(item => item.id));
  const target = h.board().columns[2];
  menuAction(h.root, moving.title, target.title);
  await settle();
  assert.equal(h.board().cards.find(item => item.id === moving.id)?.columnId, target.id);
  button(h.root, '栏').click();
  await settle();
  h.reopen();
  const movedCard = card(h.root, moving.id);
  assert.equal(movedCard.closest<HTMLElement>('[data-column-id]')?.dataset.columnId, target.id);
  assert.equal(h.board().cards.find(item => item.id === moving.id)?.body, moving.body);
});

test('column-mode menu ordering only reorders cards within their current column', async t => {
  const initial = sampleBoard();
  initial.layout = 'columns';
  const h = fixture(t, initial);
  const ownColumn = initial.cards.filter(item => item.columnId === initial.columns[0].id);
  const moving = ownColumn[1];
  const otherColumnsBefore = initial.cards.filter(item => item.columnId !== moving.columnId);
  menuAction(h.root, moving.title, '向后移动');
  await settle();
  assert.deepEqual(h.board().cards.filter(item => item.columnId === moving.columnId).map(item => item.id), [ownColumn[0].id, ownColumn[2].id, moving.id, ...ownColumn.slice(3).map(item => item.id)]);
  assert.deepEqual(h.board().cards.filter(item => item.columnId !== moving.columnId), otherColumnsBefore);
  menuAction(h.root, moving.title, '向前移动');
  await settle();
  assert.deepEqual(h.board().cards.filter(item => item.columnId === moving.columnId).map(item => item.id), ownColumn.map(item => item.id));
});

function sendFiles(target: HTMLElement, dom: JSDOM, kind: 'paste' | 'drop', files: File[]): Event {
  const event = new dom.window.Event(kind, { bubbles: true, cancelable: true });
  Object.defineProperty(event, kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { files, types: ['Files'] } });
  target.dispatchEvent(event);
  return event;
}

function pickerFiles(editor: HTMLElement, files: File[]) {
  const picker = editor.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(picker, 'The editor must provide a native file picker on every device');
  assert.equal(picker.multiple, true);
  Object.defineProperty(picker, 'files', { configurable: true, value: files });
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  return picker;
}

test('native file picker saves multiple images and a document, and attachment removal persists after reload', async t => {
  const h = fixture(t, createBoard());
  button(h.root.querySelector('.linb-toolbar')!, '添加卡片').click();
  await settle();
  let editor = dialog(h.root);
  const files = [
    new File(['first picture'], '现场图片.png', { type: 'image/png' }),
    new File(['second picture'], '另一张.jpg', { type: 'image/jpeg' }),
    new File(['document'], '参考资料.pdf', { type: 'application/pdf' }),
  ];
  const picker = editor.querySelector<HTMLInputElement>('input[type="file"]')!;
  let pickerOpened = false;
  picker.addEventListener('click', () => { pickerOpened = true; });
  button(editor, '添加附件').click();
  assert.equal(pickerOpened, true, 'The attachment control must open the native picker used by mobile devices');
  pickerFiles(editor, files);
  await settle();
  assert.deepEqual(h.imports.map(batch => batch.map(file => file.name)), [files.map(file => file.name)]);
  assert.equal(editor.querySelectorAll('img').length, 2);
  assert.equal(h.board().cards.length, 0, 'Importing files must not submit the draft');
  fill(field(editor, '标题'), '多附件卡片');
  fill(field(editor, '内容'), '说明文字与附件一起保存。');
  button(editor, '添加卡片').click();
  await settle();
  const saved = h.board().cards[0];
  assert.deepEqual(saved.attachments.map(item => item.name), files.map(file => file.name));
  h.reopen();
  await settle();
  const rendered = card(h.root, saved.id);
  assert.equal(rendered.querySelector('img')?.getAttribute('alt'), '现场图片.png');
  for (const attachment of saved.attachments) {
    const open = Array.from(rendered.querySelectorAll<HTMLButtonElement>('button')).find(item => item.getAttribute('aria-label')?.endsWith(attachment.name));
    assert.ok(open, `Saved attachment ${attachment.name} must remain openable`);
    open.click();
  }
  assert.deepEqual(h.opened, saved.attachments);
  button(rendered, saved.title).click();
  editor = dialog(h.root);
  button(editor, '移除附件：另一张.jpg').click();
  button(editor, '保存修改').click();
  await settle();
  h.reopen();
  button(h.root, saved.title).click();
  editor = dialog(h.root);
  assert.equal(editor.querySelectorAll('img').length, 1);
  assert.deepEqual(h.board().cards[0].attachments.map(item => item.name), ['现场图片.png', '参考资料.pdf']);
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').value, '说明文字与附件一起保存。');
});

test('pasting an image starts a draft and later pastes append to the same editor without creating duplicate cards', async t => {
  const h = fixture(t, createBoard());
  const file = new File(['clipboard'], '粘贴图片.png', { type: 'image/png' });
  const boardEvent = sendFiles(h.root.querySelector('.linb-kanban')!, h.dom, 'paste', [file]);
  await settle();
  assert.equal(boardEvent.defaultPrevented, true);
  const editor = dialog(h.root);
  assert.equal(h.board().cards.length, 0);
  const body = field<HTMLTextAreaElement>(editor, '内容');
  fill(body, '手机或平板粘贴的图片。');
  const secondFile = new File(['clipboard 2'], '粘贴图片2.png', { type: 'image/png' });
  const editorEvent = sendFiles(body, h.dom, 'paste', [secondFile]);
  await settle();
  assert.equal(editorEvent.defaultPrevented, true);
  assert.equal(dialog(h.root), editor);
  assert.deepEqual(h.imports.map(batch => batch.map(item => item.name)), [[file.name], [secondFile.name]]);
  button(editor, '添加卡片').click();
  await settle();
  assert.equal(h.board().cards.length, 1);
  assert.equal(h.board().cards[0].attachments.length, 2);
  assert.equal(h.board().cards[0].body, body.value);
});

test('dropping files on a column selects that column and protects the editor while import is in progress', async t => {
  const board = createBoard();
  board.layout = 'columns';
  const h = fixture(t, board);
  const target = h.root.querySelector<HTMLElement>(`[data-column-id="${board.columns[1].id}"]`)!;
  const release = h.deferImportResponse();
  sendFiles(target, h.dom, 'drop', [new File(['file'], '资料.pdf', { type: 'application/pdf' })]);
  const editor = dialog(h.root);
  assert.equal(field<HTMLSelectElement>(editor, '所属分栏').value, board.columns[1].id);
  assert.equal(button(editor, '添加卡片').disabled, true);
  assert.equal(button(editor, '取消').disabled, true);
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').disabled, true);
  editor.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(dialog(h.root), editor);
  assert.equal(h.board().cards.length, 0);
  release();
  await settle();
  assert.equal(button(editor, '添加卡片').disabled, false);
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').disabled, false);
  button(editor, '添加卡片').click();
  await settle();
  assert.equal(h.board().cards.length, 1, 'A file-only card is valid');
  assert.equal(h.board().cards[0].columnId, board.columns[1].id);
  assert.equal(h.board().cards[0].attachments[0].name, '资料.pdf');
});

test('editor keeps keyboard focus visible, guards unsaved text and blocks double submission while saving', async t => {
  const h = fixture(t, createBoard());
  const add = button(h.root.querySelector('.linb-toolbar')!, '添加卡片');
  add.focus();
  add.click();
  await settle();
  let editor = dialog(h.root);
  assert.equal(h.dom.window.document.activeElement, field(editor, '标题'));
  fill(field(editor, '内容'), '尚未保存的文字');
  button(editor, '取消').click();
  assert.equal(dialog(h.root), editor);
  assert.equal(h.dom.window.document.activeElement, button(editor, '继续编辑'));
  button(editor, '继续编辑').click();
  assert.equal(h.dom.window.document.activeElement?.closest('[hidden]'), null, 'Continuing a draft must not leave focus in the hidden discard prompt');
  assert.ok(editor.contains(h.dom.window.document.activeElement));
  assert.equal(field<HTMLTextAreaElement>(editor, '内容').value, '尚未保存的文字');
  editor.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  button(editor, '放弃修改').click();
  assert.equal(h.root.querySelector('[role="dialog"]'), null);
  assert.equal(h.dom.window.document.activeElement, add);
  assert.equal(h.board().cards.length, 0);

  add.click();
  await settle();
  editor = dialog(h.root);
  fill(field(editor, '内容'), '保存一次');
  const release = h.deferSaveResponse();
  const save = button(editor, '添加卡片');
  save.click();
  assert.equal(save.disabled, true);
  save.click();
  editor.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  button(editor, '取消').click();
  assert.equal(dialog(h.root), editor);
  assert.equal(h.operations.filter(operation => operation.type === 'card:add').length, 1);
  release();
  await settle();
  assert.equal(h.root.querySelector('[role="dialog"]'), null);
  assert.equal(h.board().cards.length, 1);
});

test('card menu supports keyboard dismissal and column moves without requiring drag and drop', async t => {
  const board = sampleBoard();
  board.layout = 'columns';
  const h = fixture(t, board);
  const moving = board.cards[0];
  const trigger = button(h.root, `卡片操作：${moving.title}`);
  trigger.focus();
  trigger.click();
  const menu = h.root.querySelector<HTMLElement>('[role="menu"]')!;
  assert.equal(h.dom.window.document.activeElement, button(menu, '编辑卡片'));
  menu.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(h.dom.window.document.activeElement, button(menu, '删除卡片'));
  menu.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(h.root.querySelector('[role="menu"]'), null);
  assert.equal(h.dom.window.document.activeElement, trigger);
  menuAction(h.root, moving.title, board.columns[2].title);
  await settle();
  const movedFocus = h.dom.window.document.activeElement;
  assert.equal(movedFocus?.isConnected, true);
  assert.ok(card(h.root, moving.id).contains(movedFocus), 'A keyboard column move must preserve focus inside the moved card');
  assert.equal(movedFocus, button(h.root, `卡片操作：${moving.title}`));
  h.reopen();
  assert.equal(card(h.root, moving.id).closest<HTMLElement>('[data-column-id]')?.dataset.columnId, board.columns[2].id);
  assert.equal(h.board().cards.find(item => item.id === moving.id)?.body, moving.body);
});

function touchPointer(target: HTMLElement, dom: JSDOM, kind: string, clientX: number, clientY: number, pointerType = 'touch') {
  const event = new dom.window.MouseEvent(kind, { button: 0, clientX, clientY, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: pointerType } });
  target.dispatchEvent(event);
  return event;
}

test('touch handle moves a card to another column and cancelled gestures leave saved order unchanged', async t => {
  const board = sampleBoard();
  board.layout = 'columns';
  const h = fixture(t, board);
  const moving = board.cards[1];
  const destination = board.cards[2];
  let hit: Element = card(h.root, destination.id);
  // jsdom has no layout engine; use a measured card-sized rectangle for hit testing.
  hit.getBoundingClientRect = () => ({ x: 300, y: 100, left: 300, top: 100, right: 560, bottom: 240, width: 260, height: 140, toJSON() {} });
  Object.defineProperty(h.dom.window.document, 'elementFromPoint', { configurable: true, value: () => hit });
  let grip = button(h.root, `移动卡片：${moving.title}`);
  touchPointer(grip, h.dom, 'pointerdown', 30, 120);
  touchPointer(grip, h.dom, 'pointermove', 330, 130);
  touchPointer(grip, h.dom, 'pointerup', 330, 130);
  await settle();
  assert.deepEqual(h.board().cards.filter(item => item.columnId === destination.columnId).map(item => item.id), [moving.id, destination.id]);
  assert.equal(h.board().cards.find(item => item.id === moving.id)?.body, moving.body);
  assert.equal(h.operations.filter(operation => operation.type === 'card:move').length, 1);

  const before = h.board().cards;
  hit = card(h.root, board.cards[4].id);
  grip = button(h.root, `移动卡片：${moving.title}`);
  touchPointer(grip, h.dom, 'pointerdown', 330, 130);
  touchPointer(grip, h.dom, 'pointermove', 620, 130);
  touchPointer(grip, h.dom, 'pointercancel', 620, 130);
  touchPointer(grip, h.dom, 'pointerup', 620, 130);
  await settle();
  assert.deepEqual(h.board().cards, before);
  assert.equal(h.root.querySelector('.is-dragging, .is-drop-target'), null);
  assert.equal(h.operations.filter(operation => operation.type === 'card:move').length, 1);
  h.reopen();
  assert.equal(card(h.root, moving.id).closest<HTMLElement>('[data-column-id]')?.dataset.columnId, destination.columnId);
});


test('editing a scrolled column preserves horizontal and vertical positions after cards are rerendered', async t => {
  const board = sampleBoard();
  board.layout = 'columns';
  const h = fixture(t, board);
  const columns = h.root.querySelector<HTMLElement>('.linb-columns')!;
  const content = h.root.querySelector<HTMLElement>('.linb-content')!;
  const target = board.cards[2];
  const listFor = (id: string) => h.root.querySelector<HTMLElement>(`[data-column-id="${id}"] .linb-column-list`)!;
  columns.scrollLeft = 320;
  content.scrollTop = 64;
  listFor(board.columns[0].id).scrollTop = 140;
  listFor(board.columns[1].id).scrollTop = 92;
  const title = button(h.root, target.title);
  title.focus();
  title.click();
  const editor = dialog(h.root);
  fill(field(editor, '内容'), '编辑后仍停留在原来浏览的位置。');
  button(editor, '保存修改').click();
  await settle();
  const refreshedColumns = h.root.querySelector<HTMLElement>('.linb-columns')!;
  assert.notEqual(refreshedColumns, columns, 'The test must exercise a replaced column container');
  assert.equal(refreshedColumns.scrollLeft, 320);
  assert.equal(content.scrollTop, 64);
  assert.equal(listFor(board.columns[0].id).scrollTop, 140);
  assert.equal(listFor(board.columns[1].id).scrollTop, 92);
  assert.equal(h.board().cards.find(item => item.id === target.id)?.body, '编辑后仍停留在原来浏览的位置。');
  assert.equal(h.dom.window.document.activeElement, button(h.root, target.title));
});

function bounds(node: HTMLElement, left: number, top: number, width = 260, height = 140) {
  node.getBoundingClientRect = () => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON() {} });
}

test('mouse handle moves up, down, across columns and into an empty column without native drag events', async t => {
  const board = sampleBoard(); board.layout = 'columns'; board.cards = board.cards.slice(0, 4);
  const h = fixture(t, board);
  const moving = board.cards[1];
  let hit: HTMLElement;
  Object.defineProperty(h.dom.window.document, 'elementFromPoint', { configurable: true, value: () => hit });
  const dragTo = async (target: HTMLElement, x: number, y: number) => {
    hit = target; const grip = button(h.root, `移动卡片：${moving.title}`);
    assert.equal(grip.draggable, false);
    touchPointer(grip, h.dom, 'pointerdown', 30, 50, 'mouse');
    touchPointer(grip, h.dom, 'pointermove', x, y, 'mouse');
    assert.ok(h.root.querySelector('.linb-drop-before, .linb-drop-after, .is-drop-target'));
    touchPointer(grip, h.dom, 'pointerup', x, y, 'mouse');
    grip.click();
    assert.equal(h.root.querySelector('[role="menu"]'), null, 'Releasing a drag must not also open its menu');
    await settle();
  };
  let target = card(h.root, board.cards[0].id); bounds(target, 0, 100);
  await dragTo(target, 30, 110);
  const order = (id: string) => h.board().cards.filter(item => item.columnId === id).map(item => item.id);
  assert.deepEqual(order(moving.columnId), [moving.id, board.cards[0].id, board.cards[3].id]);
  target = card(h.root, board.cards[3].id); bounds(target, 0, 300);
  await dragTo(target, 30, 420);
  assert.deepEqual(order(moving.columnId), [board.cards[0].id, board.cards[3].id, moving.id]);
  target = card(h.root, board.cards[2].id); bounds(target, 300, 100);
  await dragTo(target, 330, 110);
  assert.deepEqual(order(board.columns[1].id), [moving.id, board.cards[2].id]);
  target = h.root.querySelector<HTMLElement>(`[data-column-id="${board.columns[2].id}"]`)!;
  await dragTo(target, 630, 150);
  assert.deepEqual(order(board.columns[2].id), [moving.id]);
  h.reopen();
  assert.equal(h.board().cards.find(item => item.id === moving.id)?.body, moving.body);
  assert.equal(card(h.root, moving.id).closest<HTMLElement>('.linb-column')?.dataset.columnId, board.columns[2].id);
});

test('dropping in a gap between cards inserts at that position instead of appending', async t => {
  const board = sampleBoard(); board.layout = 'columns';
  const h = fixture(t, board); const moving = board.cards[2];
  const ids = [board.cards[0].id, board.cards[1].id, board.cards[3].id];
  ids.forEach((id, index) => bounds(card(h.root, id), 0, 100 + index * 200));
  const list = h.root.querySelector<HTMLElement>(`[data-column-id="${board.columns[0].id}"] .linb-column-list`)!;
  Object.defineProperty(h.dom.window.document, 'elementFromPoint', { configurable: true, value: () => list });
  const grip = button(h.root, `移动卡片：${moving.title}`);
  touchPointer(grip, h.dom, 'pointerdown', 330, 100, 'mouse');
  touchPointer(grip, h.dom, 'pointermove', 30, 270, 'mouse');
  touchPointer(grip, h.dom, 'pointerup', 30, 270, 'mouse'); await settle();
  assert.deepEqual(h.board().cards.filter(item => item.columnId === board.columns[0].id).map(item => item.id), [ids[0], moving.id, ids[1], ids[2]]);
});

test('mouse wall dragging reorders cards and retains their assigned column', async t => {
  const board = sampleBoard(); const h = fixture(t, board);
  const moving = board.cards[0], destination = board.cards[2];
  const target = card(h.root, destination.id); bounds(target, 300, 100);
  Object.defineProperty(h.dom.window.document, 'elementFromPoint', { configurable: true, value: () => target });
  const grip = button(h.root, `移动卡片：${moving.title}`);
  touchPointer(grip, h.dom, 'pointerdown', 30, 50, 'mouse');
  touchPointer(grip, h.dom, 'pointermove', 330, 230, 'mouse');
  touchPointer(grip, h.dom, 'pointerup', 330, 230, 'mouse'); await settle();
  assert.deepEqual(h.board().cards.map(item => item.id), [board.cards[1].id, destination.id, moving.id, board.cards[3].id, board.cards[4].id]);
  assert.equal(h.board().cards.find(item => item.id === moving.id)?.columnId, moving.columnId);
});

test('holding a dragged handle near a pane edge scrolls continuously and Escape cancels it', async t => {
  const board = sampleBoard(); board.layout = 'columns'; const h = fixture(t, board);
  const target = card(h.root, board.cards[2].id); bounds(target, 200, 50);
  const columns = h.root.querySelector<HTMLElement>('.linb-columns')!; bounds(columns, 0, 0, 400, 600);
  const list = target.closest('.linb-column')!.querySelector<HTMLElement>('.linb-column-list')!; bounds(list, 0, 0, 400, 600);
  bounds(h.root.querySelector<HTMLElement>('.linb-content')!, 0, 0, 400, 600);
  Object.defineProperty(h.dom.window.document, 'elementFromPoint', { configurable: true, value: () => target });
  const grip = button(h.root, `移动卡片：${board.cards[0].title}`);
  touchPointer(grip, h.dom, 'pointerdown', 30, 50, 'mouse');
  touchPointer(grip, h.dom, 'pointermove', 395, 120, 'mouse');
  await new Promise(resolve => setTimeout(resolve, 55));
  assert.ok(columns.scrollLeft >= 20);
  grip.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  touchPointer(grip, h.dom, 'pointerup', 395, 120, 'mouse');
  const stopped = columns.scrollLeft;
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(columns.scrollLeft, stopped);
  assert.equal(h.operations.length, 0);
  assert.equal(h.root.querySelector('.is-dragging, .linb-drop-before, .linb-drop-after'), null);
});

test('selection context menu converts only chosen lines and task checkboxes save into the card body', async t => {
  let nativeHandlerCalls = 0;
  const h = fixture(t, createBoard(), (text, container) => {
    renderPreviewMarkdown(text, container);
    container.querySelectorAll('input').forEach(input => input.addEventListener('click', () => { nativeHandlerCalls++; }));
  });
  button(h.root.querySelector('.linb-toolbar')!, '添加卡片').click(); await settle();
  const editor = dialog(h.root); const body = field<HTMLTextAreaElement>(editor, '内容');
  fill(field(editor, '标题'), '清单'); fill(body, '说明\n1.完成色彩\n2.检查错误\n3.导出');
  body.focus(); body.setSelectionRange(body.value.indexOf('完成'), body.value.indexOf('3.'));
  const context = new h.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
  body.dispatchEvent(context); assert.equal(context.defaultPrevented, true);
  button(h.root.querySelector('[role="menu"]')!, '转为待办复选框').click();
  assert.equal(body.value, '说明\n- [ ] 完成色彩\n- [ ] 检查错误\n3.导出');
  assert.equal(h.dom.window.document.activeElement, body);
  button(editor, '添加卡片').click(); await settle();
  let inputs = h.root.querySelectorAll<HTMLInputElement>('.linb-card-body input[type=checkbox]');
  assert.equal(inputs.length, 2); assert.equal(inputs[1].disabled, false);
  inputs[1].click(); await settle();
  assert.equal(nativeHandlerCalls, 0, 'Native Markdown checkbox handlers must not write raw .md lines');
  assert.equal(h.board().cards[0].body, '说明\n- [ ] 完成色彩\n- [x] 检查错误\n3.导出');
  h.reopen(); await settle();
  inputs = h.root.querySelectorAll<HTMLInputElement>('.linb-card-body input[type=checkbox]');
  assert.deepEqual(Array.from(inputs, input => input.checked), [false, true]);
  inputs[1].click(); await settle();
  assert.equal(h.board().cards[0].body, '说明\n- [ ] 完成色彩\n- [ ] 检查错误\n3.导出');
});

test('a checkbox rendering mismatch cannot update the wrong Markdown source line', async t => {
  const board = sampleBoard(); board.cards = [board.cards[0]]; board.cards[0].body = '普通正文';
  const h = fixture(t, board, (_text, container) => {
    const input = container.ownerDocument.createElement('input'); input.type = 'checkbox'; input.className = 'task-list-item-checkbox'; container.append(input);
  });
  await settle();
  const checkbox = h.root.querySelector<HTMLInputElement>('.task-list-item-checkbox')!;
  assert.equal(checkbox.disabled, true); checkbox.click(); await settle();
  assert.equal(h.operations.length, 0); assert.equal(h.board().cards[0].body, '普通正文');
});


test('touch toolbar inserts tasks at the caret, continues on Enter and saves Markdown', async t => {
  const h = fixture(t); button(h.root, '文字卡片').click(); await settle();
  const panel = dialog(h.root); const body = field<HTMLTextAreaElement>(panel, '内容');
  fill(body, '拍摄方案'); body.setSelectionRange(body.value.length, body.value.length);
  button(panel, '待办').click(); assert.equal(body.value, '- [ ] 拍摄方案');
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(body.value, '- [ ] 拍摄方案\n- [ ] ');
  button(panel, '保存修改').click(); await settle(); assert.equal(h.board().cards[0].body, '- [ ] 拍摄方案\n- [ ] ');
});

test('English UI preserves Chinese user content and exposes all formatting actions', async t => {
  const { setLanguage } = await import('../src/i18n'); setLanguage('en'); t.after(() => setLanguage('zh'));
  const h = fixture(t); button(h.root, '文字卡片').click(); await settle();
  const panel = dialog(h.root); assert.equal(field<HTMLTextAreaElement>(panel, 'Content').value, '**内容一**');
  for (const label of ['Task', 'List', 'Numbered', 'Bold', 'Link', 'Cancel', 'Save changes']) assert.ok(button(panel, label));
  assert.ok(button(h.root, 'Wall')); assert.ok(button(h.root, 'Columns'));
  assert.equal(panel.querySelector('select.linb-color-select option')?.textContent, 'Default');
});

test('link preview renders a cover with video marker and safely drops a failed image', async t => {
  const h = fixture(t); h.host.getLinkPreview = async url => ({ url, title: '视频标题', description: '简介', image: 'https://example.com/cover.jpg', video: true });
  h.externalChange({ type: 'card:update', id: h.board().cards[0].id, patch: { link: 'https://example.com/video' } }); await settle();
  const preview = h.root.querySelector('.linb-link-preview')!;
  assert.ok(preview.querySelector('img')); assert.ok(preview.querySelector('.linb-link-play')); assert.match(preview.textContent!, /视频标题/);
  preview.querySelector('img')!.dispatchEvent(new Event('error')); assert.equal(preview.querySelector('img'), null); assert.ok(preview.querySelector('.linb-link-play'));
});

test('editor follows the visible keyboard area and releases viewport listeners on close', async t => {
  const h = fixture(t); const viewport = new h.dom.window.EventTarget() as EventTarget & { height: number; offsetTop: number };
  viewport.height = 800; viewport.offsetTop = 0;
  Object.defineProperty(h.dom.window, 'visualViewport', { value: viewport, configurable: true });
  const root = h.root.querySelector<HTMLElement>('.linb-kanban')!;
  root.getBoundingClientRect = () => ({ top: 80, bottom: 800, height: 720 } as DOMRect);
  button(h.root, '文字卡片').click(); await settle();
  const overlay = h.root.querySelector<HTMLElement>('.linb-editor-overlay')!; assert.equal(overlay.style.height, '720px');
  viewport.height = 420; viewport.dispatchEvent(new Event('resize')); assert.equal(overlay.style.height, '340px');
  button(dialog(h.root), '取消').click(); viewport.height = 500; viewport.dispatchEvent(new Event('resize')); assert.equal(overlay.style.height, '340px');
});
