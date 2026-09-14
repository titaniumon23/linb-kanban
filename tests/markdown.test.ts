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
