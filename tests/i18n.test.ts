import test from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage, t } from '../src/i18n';
import { createBoard, createCard, parseBoard, serializeBoard } from '../src/model';

test('Obsidian Chinese locales use Chinese; other locales use English with literal user values', () => {
  setLanguage('zh-TW'); assert.equal(t('添加卡片'), '添加卡片');
  setLanguage('en'); assert.equal(t('添加卡片'), 'Add card');
  assert.equal(t('卡片操作：{0}', '保存 {1}'), 'Card actions: 保存 {1}');
  assert.equal(createBoard().columns[0].title, 'Column 1');
  setLanguage('zh');
});

test('language changes never change Markdown serialization or prevent reopening older boards', () => {
  setLanguage('zh'); const board = createBoard('我的看板');
  board.cards.push(createCard(board.columns[0].id, { body: '中文内容 **keep**', link: 'https://example.com' }));
  const source = serializeBoard(board);
  setLanguage('en'); assert.deepEqual(parseBoard(source), board); assert.equal(serializeBoard(board), source);
  assert.equal(parseBoard(JSON.stringify(board)).cards[0].body, '中文内容 **keep**');
  setLanguage('zh');
});
