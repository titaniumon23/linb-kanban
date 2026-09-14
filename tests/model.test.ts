import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, createBoard, createCard, createDemoBoard, exportMarkdown, parseBoard, safeExternalUrl, serializeBoard } from '../src/model';
import type { Attachment, BoardOperation } from '../src/types';

function fixture() {
  let board = createBoard('春日灵感 🌿');
  const first = createCard(board.columns[0].id, { title: '第一张', body: '原始内容' });
  const second = createCard(board.columns[0].id, { title: '第二张' });
  const third = createCard(board.columns[1].id, { title: '第三张' });
  for (const card of [first, second, third]) board = applyOperation(board, { type: 'card:add', card });
  return { board, first, second, third };
}

test('new boards are empty, have the selected layout, and default Chinese columns', () => {
  const board = createBoard();
  assert.equal(board.layout, 'columns');
  assert.equal(board.revision, 0);
  assert.deepEqual(board.cards, []);
  assert.deepEqual(board.columns.map((column) => column.title), ['第1栏', '第2栏', '第3栏']);
  assert.equal(new Set(board.columns.map((column) => column.id)).size, 3);
  assert.ok(createDemoBoard().cards.every((card) => card.body.includes('示例')));
});

test('CRUD is immutable, increments revision, and preserves attachments when removing a card', () => {
  const { board, first } = fixture();
  const original = serializeBoard(board);
  const attachment = { path: '附件/森林 图片.png', name: '森林 图片.png', mime: 'image/png' };
  const next = applyOperation(board, { type: 'card:update', id: first.id, patch: { title: '新标题', attachments: [attachment] } });
  attachment.name = 'later mutation';
  assert.equal(serializeBoard(board), original);
  assert.equal(next.revision, board.revision + 1);
  assert.equal(next.cards[0].title, '新标题');
  assert.equal(next.cards[0].attachments[0].name, '森林 图片.png');
  const deleted = applyOperation(next, { type: 'card:delete', id: first.id });
  assert.equal(deleted.cards.length, 2);
  assert.equal(next.cards[0].attachments.length, 1);
  assert.equal(deleted.revision, next.revision + 1);
});

test('card ordering survives wall/columns toggling and persistence, including cross-column moves', () => {
  const { board, first, second, third } = fixture();
  let next = applyOperation(board, { type: 'card:move', id: second.id, columnId: first.columnId, beforeId: first.id });
  assert.deepEqual(next.cards.map((card) => card.id), [second.id, first.id, third.id]);
  next = applyOperation(next, { type: 'card:move', id: first.id, columnId: third.columnId, beforeId: third.id });
  next = applyOperation(next, { type: 'board:update', patch: { layout: 'columns', background: 'sage' } });
  const restored = parseBoard(serializeBoard(next));
  assert.deepEqual(restored.cards.filter((card) => card.columnId === third.columnId).map((card) => card.id), [first.id, third.id]);
  next = applyOperation(restored, { type: 'card:move', id: first.id, columnId: third.columnId });
  assert.deepEqual(next.cards.filter((card) => card.columnId === third.columnId).map((card) => card.id), [third.id, first.id]);
  assert.throws(() => applyOperation(board, { type: 'card:move', id: first.id, columnId: first.columnId, beforeId: 'missing' }));
  assert.throws(() => applyOperation(board, { type: 'card:move', id: first.id, columnId: 'missing' }));
});

test('wall reordering can use a card from another column without changing the moved card column', () => {
  const { board, first, second, third } = fixture();
  const next = applyOperation(board, { type: 'card:move', id: third.id, columnId: third.columnId, beforeId: first.id });
  assert.deepEqual(next.cards.map((card) => card.id), [third.id, first.id, second.id]);
  assert.equal(next.cards[0].columnId, third.columnId);
  const restored = parseBoard(serializeBoard(next));
  assert.deepEqual(restored.cards.map((card) => card.id), [third.id, first.id, second.id]);
});

test('adding before a card inserts it in the destination column', () => {
  const { board, first } = fixture();
  const added = createCard(first.columnId, { title: '插入卡片' });
  const next = applyOperation(board, { type: 'card:add', card: added, beforeId: first.id });
  assert.deepEqual(next.cards.slice(0, 2).map((card) => card.id), [added.id, first.id]);
  assert.throws(() => applyOperation(next, { type: 'card:add', card: added }));
});

test('stale updates and deletes are rejected, timestamps increase even in the same millisecond', () => {
  const { board, first } = fixture();
  const now = Date.now;
  Date.now = () => Date.parse(first.updatedAt);
  try {
    const next = applyOperation(board, { type: 'card:update', id: first.id, patch: { body: '首次更新' }, expectedUpdatedAt: first.updatedAt });
    const nextAgain = applyOperation(next, { type: 'card:update', id: first.id, patch: { body: '再次更新' }, expectedUpdatedAt: next.cards[0].updatedAt });
    assert.equal(Date.parse(nextAgain.cards[0].updatedAt), Date.parse(first.updatedAt) + 2);
    assert.throws(() => applyOperation(nextAgain, { type: 'card:update', id: first.id, patch: { body: '过期版本' }, expectedUpdatedAt: first.updatedAt }), /其他窗口修改/);
    assert.throws(() => applyOperation(nextAgain, { type: 'card:delete', id: first.id, expectedUpdatedAt: first.updatedAt }), /其他窗口修改/);
    assert.equal(nextAgain.cards[0].body, '再次更新');
  } finally { Date.now = now; }
});

test('column deletion moves cards, invalidates stale editors, and never leaves dangling references', () => {
  const { board, first } = fixture();
  const column = { id: 'new-column', title: '待归档', color: 'rose' as const };
  let next = applyOperation(board, { type: 'column:add', column });
  next = applyOperation(next, { type: 'column:update', id: column.id, patch: { title: '归档' } });
  next = applyOperation(next, { type: 'column:delete', id: first.columnId, moveToId: column.id });
  assert.equal(next.columns.at(-1)?.title, '归档');
  assert.ok(next.cards.slice(0, 2).every((card) => card.columnId === column.id));
  assert.throws(() => applyOperation(next, { type: 'card:update', id: first.id, expectedUpdatedAt: first.updatedAt, patch: { title: '旧编辑' } }));
  assert.throws(() => applyOperation(board, { type: 'column:delete', id: first.columnId, moveToId: first.columnId }));
  assert.throws(() => applyOperation(board, { type: 'column:delete', id: first.columnId, moveToId: 'missing' }));
});

test('unknown extension metadata is preserved through parse, edit, and serialize', () => {
  const { board } = fixture();
  const extended = JSON.parse(JSON.stringify(board));
  extended.extension = { nested: ['中文', { custom: true }] };
  extended.cards[0].pluginMetadata = { retained: 42 };
  extended.columns[0].extra = '保留';
  const restored = parseBoard(serializeBoard(applyOperation(parseBoard(JSON.stringify(extended)), { type: 'card:update', id: board.cards[0].id, patch: { title: '编辑后' } })));
  assert.deepEqual((restored as any).extension, extended.extension);
  assert.deepEqual((restored.cards[0] as any).pluginMetadata, extended.cards[0].pluginMetadata);
  assert.equal((restored.columns[0] as any).extra, '保留');
});

test('existing 0.1 board layout, colors, content and attachments survive a 0.2 edit', () => {
  const { board, first } = fixture();
  const old = { ...board, layout: 'wall' as const, background: 'sage' as const };
  old.cards[0] = { ...old.cards[0], color: 'rose', attachments: [{ path: 'LinB Kanban/附件/photo.png', name: 'photo.png', mime: 'image/png' }] };
  const restored = parseBoard(serializeBoard(old));
  const edited = applyOperation(restored, { type: 'card:update', id: first.id, expectedUpdatedAt: first.updatedAt, patch: { title: '改后的标题' } });
  assert.equal(edited.version, 1);
  assert.equal(edited.layout, 'wall');
  assert.equal(edited.background, 'sage');
  assert.equal(edited.cards[0].color, 'rose');
  assert.equal(edited.cards[0].body, first.body);
  assert.deepEqual(edited.cards[0].attachments, old.cards[0].attachments);
});

test('malformed or future files are refused, with no reset or mutation of the original', () => {
  const { board } = fixture();
  const original = serializeBoard(board);
  const invalid: unknown[] = [null, [], {}, { ...board, version: 2 }, { ...board, revision: -1 }, { ...board, revision: 1.5 }, { ...board, columns: [] }, { ...board, cards: [board.cards[0], board.cards[0]] }, { ...board, columns: [board.columns[0], board.columns[0]] }, { ...board, cards: [{ ...board.cards[0], columnId: 'missing' }] }, { ...board, cards: [{ ...board.cards[0], updatedAt: 'yesterday' }] }, { ...board, cards: [{ ...board.cards[0], attachments: null }] }, { ...board, layout: 'unknown' }];
  for (const candidate of invalid) assert.throws(() => parseBoard(JSON.stringify(candidate)));
  assert.throws(() => parseBoard('{ broken json'));
  assert.throws(() => applyOperation(board, { type: 'board:update', patch: { version: 2 } } as unknown as BoardOperation));
  assert.throws(() => applyOperation({ ...board, revision: Number.MAX_SAFE_INTEGER }, { type: 'board:update', patch: { title: 'overflow' } }));
  assert.equal(serializeBoard(board), original);
});

test('only valid web URLs are accepted and unsafe attachment paths are refused', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'obsidian://open', '//example.com', 'https://', 'https:\\example.com', 'https://exa\nmple.com']) assert.equal(safeExternalUrl(url), null, url);
  assert.equal(safeExternalUrl(' https://example.com/中文?q=测试 '), 'https://example.com/%E4%B8%AD%E6%96%87?q=%E6%B5%8B%E8%AF%95');
  for (const path of ['../outside.png', '/tmp/photo.png', 'a/../b.png', 'a/./b.png', 'a//b.png', 'C:\\photo.png', 'file:///tmp/photo.png', 'https://example.com/photo.png', 'a\\..\\b.png', 'a/%2e%2e/b.png', 'a/%2Fb.png']) {
    assert.throws(() => createCard('column', { attachments: [{ path, name: 'photo', mime: 'image/png' }] }), path);
  }
  assert.throws(() => createCard('column', { link: 'javascript:alert(1)' }));
  assert.equal(createCard('column', { attachments: [{ path: '图片/森林 01.png', name: '森林 01.png', mime: 'image/png' }] }).attachments.length, 1);
});

test('board, card, and column IDs cannot inject paths into attachment directories', () => {
  const { board } = fixture();
  for (const unsafeId of ['../outside', 'a/b', 'a\\b', '.', '..', '/absolute', '%2e%2e', 'a:drive', 'bad id']) {
    assert.throws(() => parseBoard(JSON.stringify({ ...board, id: unsafeId })), `board ${unsafeId}`);
    assert.throws(() => parseBoard(JSON.stringify({ ...board, cards: [{ ...board.cards[0], id: unsafeId }] })), `card ${unsafeId}`);
    assert.throws(() => parseBoard(JSON.stringify({ ...board, columns: [{ ...board.columns[0], id: unsafeId }], cards: [] })), `column ${unsafeId}`);
    assert.throws(() => createCard(unsafeId), `column reference ${unsafeId}`);
  }
  assert.equal(createCard('valid_Column-123').columnId, 'valid_Column-123');
});

test('markdown export retains Unicode, markdown body, column order, and portable attachments', () => {
  let board = createBoard('春日 🌿 [灵感]');
  const attachment: Attachment = { path: '附件/森林 (春)#1?.png', name: '森林 [春].png', mime: 'image/png' };
  const card = createCard(board.columns[0].id, { title: '中文标题\n不能注入标题', body: '- [ ] 散步\n\n**你好，世界！**', attachments: [attachment], link: 'https://example.com/hello' });
  board = applyOperation(board, { type: 'card:add', card });
  const markdown = exportMarkdown(board);
  assert.match(markdown, /春日 🌿/);
  assert.ok(markdown.includes('### 中文标题 不能注入标题'));
  assert.ok(markdown.includes('- [ ] 散步\n\n**你好，世界！**'));
  assert.ok(markdown.includes('![森林 \\[春\\].png]'));
  assert.ok(markdown.includes('%20%28'));
  assert.ok(markdown.includes('%231%3F.png'));
  assert.ok(markdown.includes('[打开链接](<https://example.com/hello>)'));
  assert.ok(markdown.indexOf('## 第1栏') < markdown.indexOf('## 第2栏'));
});

test('markdown exports resolve vault attachments relative to the exported note folder', () => {
  let board = createBoard();
  const card = createCard(board.columns[0].id, { attachments: [
    { path: 'LinB Kanban/附件/id/春天.png', name: '春天.png', mime: 'image/png' },
    { path: '其他目录/资料.pdf', name: '资料.pdf', mime: 'application/pdf' },
  ] });
  board = applyOperation(board, { type: 'card:add', card });
  const siblingExport = exportMarkdown(board, 'LinB Kanban');
  assert.ok(siblingExport.includes('](<%E9%99%84%E4%BB%B6/id/%E6%98%A5%E5%A4%A9.png>)'));
  assert.ok(siblingExport.includes('](<../%E5%85%B6%E4%BB%96%E7%9B%AE%E5%BD%95/'));
  const nestedExport = exportMarkdown(board, '笔记/整理');
  assert.ok(nestedExport.includes('](<../../LinB%20Kanban/'));
  const rootExport = exportMarkdown(board);
  assert.ok(rootExport.includes('](<LinB%20Kanban/'));
  assert.throws(() => exportMarkdown(board, '../outside'));
  assert.throws(() => exportMarkdown(board, '/absolute'));
});
