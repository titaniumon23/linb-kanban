import test from 'node:test';
import assert from 'node:assert/strict';
import { taskifySelection, taskMarkers } from '../src/markdown';

test('selected numbered lines become tasks without altering surrounding content', () => {
  const text = '标题\n1.完成色彩\n2.检查错误\n3.导出\n备注';
  const converted = taskifySelection(text, text.indexOf('完成'), text.indexOf('3.导出'))!;
  assert.equal(converted.text, '标题\n- [ ] 完成色彩\n- [ ] 检查错误\n3.导出\n备注');
  assert.equal(converted.text.slice(converted.start, converted.end), '- [ ] 完成色彩\n- [ ] 检查错误');
});

test('task conversion preserves completed tasks, indentation, blank lines and CRLF', () => {
  const text = '  - [x] 已完成\r\n\r\n  - 下一步\r\n末尾';
  const converted = taskifySelection(text, 0, text.length)!;
  assert.equal(converted.text, '  - [x] 已完成\r\n\r\n  - [ ] 下一步\r\n- [ ] 末尾');
  assert.equal(taskifySelection(converted.text, 0, converted.text.length)!.text, converted.text);
  assert.equal(taskifySelection(text, 0, 0), null);
  assert.equal(taskifySelection('   ', 0, 3), null);
});

test('task source offsets exclude fenced examples and preserve repeated task text', () => {
  const text = '- [ ] 重复\n```md\n- [ ] 代码\n```\n> - [X] 重复\n~~~\n- [ ] 示例\n~~~\n  - [ ] 第三项';
  const tasks = taskMarkers(text);
  assert.deepEqual(tasks.map(task => task.checked), [false, true, false]);
  assert.deepEqual(tasks.map(task => text[task.offset]), [' ', 'X', ' ']);
  assert.equal(tasks[1].offset, text.indexOf('[X]') + 1);
});

test('toolbar inserts tasks at a caret and converts current numbered lines without selecting', async () => {
  const { formatText } = await import('../src/markdown');
  assert.deepEqual(formatText('', 0, 0, 'task'), { text: '- [ ] ', start: 6, end: 6 });
  const text = '1.制作PPT\n2.梳理参考';
  const edit = formatText(text, 4, 4, 'task');
  assert.equal(edit.text, '- [ ] 制作PPT\n2.梳理参考');
  assert.equal(edit.start, 8);
  assert.equal(formatText('- [x] 完成', 8, 8, 'task').text, '- [x] 完成');
  assert.equal(formatText('\n后文', 0, 0, 'task').text, '- [ ] \n后文');
});

test('toolbar formats only selected lines and selects link placeholders', async () => {
  const { formatText } = await import('../src/markdown');
  assert.equal(formatText('开头\na\nb\n末尾', 3, 6, 'number').text, '开头\n1. a\n2. b\n末尾');
  const link = formatText('前文本后', 1, 3, 'link');
  assert.equal(link.text, '前[文本](https://)后');
  assert.equal(link.text.slice(link.start, link.end), 'https://');
  const bold = formatText('文本', 0, 2, 'bold'); assert.equal(bold.text, '**文本**');
});

test('Enter continues unfinished tasks and numbered lists, and exits empty items', async () => {
  const { continueList } = await import('../src/markdown');
  assert.equal(continueList('- [x] 已完成', 9, 9)?.text, '- [x] 已完成\n- [ ] ');
  assert.equal(continueList('9. nine', 7, 7)?.text, '9. nine\n10. ');
  assert.deepEqual(continueList('- [ ] ', 6, 6), { text: '', start: 0, end: 0 });
  assert.equal(continueList('正文', 2, 2), null);
});
