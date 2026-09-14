import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, createBoard, createCard, parseBoard, serializeBoard } from '../src/model';
import { BoardRepository, type BoardIO } from '../src/repository';
import type { Board } from '../src/types';

function memoryStore(initial: Board) {
  let text = serializeBoard(initial);
  let writes = 0;
  const io: BoardIO = {
    async read() { return text; },
    async process(_path, update) {
      text = update(text);
      writes += 1;
      return text;
    },
  };
  return {
    io,
    read: () => text,
    writeExternal: (value: string) => { text = value; },
    writes: () => writes,
  };
}

test('repository serializes simultaneous saves to one file without losing either change', async () => {
  const initial = createBoard('开始');
  let onDisk = serializeBoard(initial);
  let active = 0;
  let peakActive = 0;
  const entries: string[] = [];
  const io: BoardIO = {
    async read() { return onDisk; },
    async process(_path, update) {
      active += 1;
      peakActive = Math.max(peakActive, active);
      // Yield while this IO call remains active, exposing concurrent operations.
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      onDisk = update(onDisk);
      entries.push(parseBoard(onDisk).title);
      active -= 1;
      return onDisk;
    },
  };
  const repository = new BoardRepository(io);
  const first = repository.save('board.md', { type: 'board:update', patch: { title: '更新标题' } });
  const second = repository.save('board.md', { type: 'board:update', patch: { description: '保留新的描述' } });
  const third = repository.save('board.md', { type: 'card:add', card: createCard(initial.columns[0].id, { title: '第三次保存' }) });
  const saved = await Promise.all([first, second, third]);
  assert.equal(peakActive, 1);
  assert.deepEqual(saved.map((board) => board.revision), [1, 2, 3]);
  assert.deepEqual(entries, ['更新标题', '更新标题', '更新标题']);
  const final = parseBoard(onDisk);
  assert.equal(final.title, '更新标题');
  assert.equal(final.description, '保留新的描述');
  assert.equal(final.cards[0].title, '第三次保存');
});

test('repository applies edits to current disk content and retains unrelated external changes', async () => {
  const initial = createBoard('原始标题');
  const first = createCard(initial.columns[0].id, { title: '我的卡片' });
  const externalCard = createCard(initial.columns[0].id, { title: '其他窗口的卡片' });
  const base = applyOperation(initial, { type: 'card:add', card: first });
  const store = memoryStore(base);
  const repository = new BoardRepository(store.io);
  const cached = await repository.read('board.md');
  let external = applyOperation(base, { type: 'board:update', patch: { title: '其他窗口的新标题' } });
  external = applyOperation(external, { type: 'card:add', card: externalCard });
  store.writeExternal(serializeBoard(external));
  const saved = await repository.save('board.md', { type: 'card:update', id: first.id, patch: { body: '本地更新' }, expectedUpdatedAt: cached.cards[0].updatedAt });
  assert.equal(saved.title, '其他窗口的新标题');
  assert.equal(saved.cards[0].body, '本地更新');
  assert.equal(saved.cards[1].id, externalCard.id);
  assert.equal(saved.revision, external.revision + 1);
});

test('repository rejects stale card edits against external changes and keeps newer disk content', async () => {
  const initial = createBoard();
  const card = createCard(initial.columns[0].id, { title: '原始标题' });
  const base = applyOperation(initial, { type: 'card:add', card });
  const store = memoryStore(base);
  const repository = new BoardRepository(store.io);
  const external = applyOperation(base, { type: 'card:update', id: card.id, patch: { title: '外部修改' } });
  const text = serializeBoard(external);
  store.writeExternal(text);
  await assert.rejects(repository.save('board.md', { type: 'card:update', id: card.id, patch: { title: '过期修改' }, expectedUpdatedAt: card.updatedAt }), /其他窗口修改/);
  assert.equal(store.read(), text);
  assert.equal(store.writes(), 0);
});

test('a failed write rejects its caller but does not poison later queued saves', async () => {
  const initial = createBoard('原始标题');
  const original = serializeBoard(initial);
  let onDisk = original;
  let attempts = 0;
  const io: BoardIO = {
    async read() { return onDisk; },
    async process(_path, update) {
      attempts += 1;
      const updated = update(onDisk);
      if (attempts === 1) throw new Error('模拟磁盘空间不足');
      onDisk = updated;
      return onDisk;
    },
  };
  const repository = new BoardRepository(io);
  const failed = repository.save('board.md', { type: 'board:update', patch: { title: '不能落盘的标题' } });
  const recovered = repository.save('board.md', { type: 'board:update', patch: { description: '后续保存成功' } });
  await assert.rejects(failed, /磁盘空间不足/);
  const saved = await recovered;
  assert.equal(attempts, 2);
  assert.equal(saved.title, '原始标题');
  assert.equal(saved.description, '后续保存成功');
  assert.equal(saved.revision, 1);
  assert.equal(parseBoard(onDisk).description, '后续保存成功');
});

test('corrupt or newer-version board files are never overwritten by a save', async () => {
  const initial = createBoard();
  const store = memoryStore(initial);
  const repository = new BoardRepository(store.io);
  for (const original of ['{ damaged and irreplaceable content', JSON.stringify({ ...initial, version: 99 })]) {
    store.writeExternal(original);
    await assert.rejects(repository.read('board.md'));
    await assert.rejects(repository.save('board.md', { type: 'board:update', patch: { title: '不可覆盖' } }));
    assert.equal(store.read(), original);
    assert.equal(store.writes(), 0);
  }
  store.writeExternal(serializeBoard(initial));
  const recovered = await repository.save('board.md', { type: 'board:update', patch: { title: '修复文件后可再次保存' } });
  assert.equal(recovered.title, '修复文件后可再次保存');
  assert.equal(store.writes(), 1);
});

test('different board files use independent save queues', async () => {
  const disk = new Map([['one.md', serializeBoard(createBoard('一'))], ['two.md', serializeBoard(createBoard('二'))]]);
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const io: BoardIO = {
    async read(path) { return disk.get(path)!; },
    async process(path, update) {
      if (path === 'one.md') await firstGate;
      const text = update(disk.get(path)!);
      disk.set(path, text);
      return text;
    },
  };
  const repository = new BoardRepository(io);
  const first = repository.save('one.md', { type: 'board:update', patch: { title: '一已保存' } });
  const second = await repository.save('two.md', { type: 'board:update', patch: { title: '二已保存' } });
  assert.equal(second.title, '二已保存');
  assert.equal(parseBoard(disk.get('one.md')!).title, '一');
  releaseFirst();
  assert.equal((await first).title, '一已保存');
});
