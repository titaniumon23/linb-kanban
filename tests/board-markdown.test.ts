import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, createCard, exportMarkdown, isBoardMarkdown, parseBoard, serializeBoard } from '../src/model';
import { BoardRepository } from '../src/repository';

test('shared Markdown restores both layouts, every color, wall order, empty columns and attachments', () => {
  const board = createBoard('共享看板');
  board.description = '没有插件也能阅读。';
  board.cards = ['white', 'gray', 'lavender', 'sky', 'sage', 'sand', 'rose'].map((color, index) => createCard(board.columns[index % 2].id, {
    title: `卡片 ${index}`, color: color as 'white', body: `**正文 ${index}**\n\n- [ ] 未完成\n- [x] 已完成\n`,
    attachments: [{ path: '素材/已有图片.png', name: '已有图片.png', mime: 'image/png' }],
  }));
  for (const layout of ['wall', 'columns'] as const) {
    board.layout = layout;
    const markdown = exportMarkdown(board, 'LinB Kanban');
    assert.ok(isBoardMarkdown(markdown));
    assert.deepEqual(parseBoard(markdown), board);
    assert.deepEqual(parseBoard(serializeBoard(parseBoard(markdown), 'LinB Kanban')), board);
    assert.match(markdown, /# 共享看板/);
    assert.match(markdown, /## 第3栏/);
    assert.equal(markdown.split('**正文 0**').length, 2, 'The body has one authoritative copy');
    assert.match(markdown, /- \[x\] 已完成/);
  }
});

test('ordinary notes and quoted examples never become boards', () => {
  for (const text of ['# 普通笔记', 'linb-kanban: 1', '```yaml\n---\nlinb-kanban: 1\n---\n```', '---\nother: 1\n---', '---\nlinb-kanban: 2\n---', '---\nlinb-kanban: 10\n---']) {
    assert.equal(isBoardMarkdown(text), false);
    assert.throws(() => parseBoard(text));
  }
  assert.ok(isBoardMarkdown('\uFEFF---\r\nlinb-kanban: 1\r\n---\r\n'));
});

test('Markdown source body edits and checkbox changes are read, including Windows line endings', () => {
  const board = createBoard();
  board.cards.push(createCard(board.columns[0].id, { body: '\n- [ ] 写作\n\n```md\n## 正文中的标题\n```\n' }));
  const changed = exportMarkdown(board).replace('- [ ] 写作', '- [x] 写作\n\n新文字');
  const restored = parseBoard(changed);
  assert.equal(restored.cards[0].body, board.cards[0].body.replace('- [ ] 写作', '- [x] 写作\n\n新文字'));
  assert.equal(parseBoard(changed.replace(/\n/g, '\r\n')).cards[0].body.replace(/\r\n/g, '\n'), restored.cards[0].body);
});

test('damaged structure and unsupported outside edits are refused rather than silently discarded', () => {
  const board = createBoard('原有标题');
  board.cards.push(createCard(board.columns[0].id, { body: '重要内容' }));
  const original = exportMarkdown(board);
  for (const damaged of [original.replace('# 原有标题', '# 修改过的标题'), original.replace('end-body', 'missing'), original.replace(/<!-- linb-kanban:data[^\n]+/, ''), original + '\n额外文字', original.replace('重要内容', `重要内容\n<!-- linb-kanban:body other -->\n被插入的内容\n<!-- linb-kanban:end-body other -->`)]) {
    assert.throws(() => parseBoard(damaged));
  }
  board.cards[0].body = '<!-- linb-kanban:body reserved -->';
  assert.throws(() => serializeBoard(board), /内部标记/);
});

test('metadata safely hides comment terminators while retaining Markdown and unknown fields', () => {
  const board = createBoard('注释 --> <!-- 标题');
  board.cards.push(createCard(board.columns[0].id, { title: 'A -- B', body: '<!-- 普通注释 -->\n正文' }));
  (board as any).extension = { text: '--><script>example</script>' };
  const markdown = exportMarkdown(board);
  assert.deepEqual(parseBoard(markdown), board);
  const metadata = markdown.split('<!-- linb-kanban:data ')[1];
  assert.equal(metadata.split('-->').length, 2, 'Only the actual closing comment delimiter remains');
});

test('a source edit made during card editing cannot be overwritten or deleted by the stale editor', async () => {
  const board = createBoard();
  const card = createCard(board.columns[0].id, { body: '原正文' }); board.cards.push(card);
  let disk = serializeBoard(board).replace('原正文', '外部编辑的正文');
  let writes = 0;
  const repository = new BoardRepository({ read: async () => disk, process: async (_path, update) => { const next = update(disk); writes++; return disk = next; } });
  await assert.rejects(repository.save('笔记/看板.md', { type: 'card:update', id: card.id, expectedUpdatedAt: card.updatedAt, expectedBody: card.body, patch: { body: '过期正文' } }), /其他窗口修改/);
  await assert.rejects(repository.save('笔记/看板.md', { type: 'card:delete', id: card.id, expectedUpdatedAt: card.updatedAt, expectedBody: card.body }), /其他窗口修改/);
  assert.equal(writes, 0);
  assert.equal(parseBoard(disk).cards[0].body, '外部编辑的正文');
  await repository.save('笔记/看板.md', { type: 'board:update', patch: { layout: 'wall' } });
  assert.equal(parseBoard(disk).cards[0].body, '外部编辑的正文');
});
