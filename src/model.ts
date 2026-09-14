import type { Attachment, Board, BoardOperation, CardPatch, WallCard } from './types';

const COLORS = new Set(['white', 'sage', 'sand', 'rose', 'sky', 'lavender']);
const BACKGROUNDS = new Set(['paper', 'sage', 'rose', 'slate']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, maxLength: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0') || (required && !value.trim())) {
    fail(`${label}必须是${required ? '非空' : ''}文本，且不超过 ${maxLength} 个字符。`);
  }
}

function id(value: unknown, label: string): asserts value is string {
  string(value, label, 128, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) fail(`${label}只能包含字母、数字、下划线和连字符。`);
}

function timestamp(value: unknown, label: string): asserts value is string {
  string(value, label, 40, true);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value || parsed >= 8.64e15) {
    fail(`${label}不是有效的 ISO 时间。`);
  }
}

/** Returns an absolute web URL, or null for unsupported or malformed schemes. */
export function safeExternalUrl(value: string): string | null {
  if (typeof value !== 'string' || value.length > 8_192 || CONTROL_CHARACTERS.test(value)) return null;
  const input = value.trim();
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    const url = new URL(input);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

function validateAttachment(value: unknown): asserts value is Attachment {
  const attachment = record(value, '附件');
  string(attachment.path, '附件路径', 2_048, true);
  const path = attachment.path;
  if (CONTROL_CHARACTERS.test(path) || /[\\<>]/.test(path) || path.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    fail('附件必须使用仓库内的相对路径。');
  }
  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('附件路径不能包含空目录或上级目录。');
  }
  // Encoded traversal and separators must not become paths when rendered as URLs.
  if (/%(?:2e|2f|5c|00)/i.test(path)) fail('附件路径含有不安全的转义字符。');
  string(attachment.name, '附件名称', 512, true);
  string(attachment.mime, '附件类型', 128);
}

function validateCard(value: unknown): asserts value is WallCard {
  const card = record(value, '卡片');
  id(card.id, '卡片 ID');
  id(card.columnId, '卡片分栏 ID');
  string(card.title, '卡片标题', 1_000);
  string(card.body, '卡片正文', 200_000);
  if (!COLORS.has(card.color as string)) fail('卡片颜色不受支持。');
  if (!Array.isArray(card.attachments) || card.attachments.length > 100) fail('卡片附件列表不正确或超过 100 个。');
  card.attachments.forEach(validateAttachment);
  string(card.link, '卡片链接', 8_192);
  if (card.link !== '' && !safeExternalUrl(card.link)) fail('卡片链接仅支持完整的 http:// 或 https:// 地址。');
  timestamp(card.createdAt, '创建时间');
  timestamp(card.updatedAt, '修改时间');
  if (Date.parse(card.updatedAt) < Date.parse(card.createdAt)) fail('卡片修改时间不能早于创建时间。');
}

function validateBoard(value: unknown): asserts value is Board {
  const board = record(value, '看板');
  if (board.version !== 1) fail(`不支持此看板版本（${String(board.version)}）。请保留原文件并更新插件。`);
  if (!Number.isSafeInteger(board.revision) || (board.revision as number) < 0) fail('看板修订号无效。');
  id(board.id, '看板 ID');
  string(board.title, '看板标题', 1_000, true);
  string(board.description, '看板描述', 10_000);
  if (board.layout !== 'wall' && board.layout !== 'columns') fail('看板布局不受支持。');
  if (!BACKGROUNDS.has(board.background as string)) fail('看板背景不受支持。');
  if (!Array.isArray(board.columns) || board.columns.length < 1 || board.columns.length > 1_000) {
    fail('看板需要 1 至 1000 个分栏。');
  }
  const columnIds = new Set<string>();
  for (const value of board.columns) {
    const column = record(value, '分栏');
    id(column.id, '分栏 ID');
    string(column.title, '分栏标题', 200, true);
    if (!COLORS.has(column.color as string)) fail('分栏颜色不受支持。');
    if (columnIds.has(column.id)) fail('看板含有重复的分栏 ID。');
    columnIds.add(column.id);
  }
  if (!Array.isArray(board.cards) || board.cards.length > 20_000) fail('看板卡片列表不正确或超过 20000 张。');
  const cardIds = new Set<string>();
  for (const card of board.cards) {
    validateCard(card);
    if (cardIds.has(card.id)) fail('看板含有重复的卡片 ID。');
    if (!columnIds.has(card.columnId)) fail('卡片指向不存在的分栏。请保留原文件。');
    cardIds.add(card.id);
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `moss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createBoard(title = '未命名看板'): Board {
  const board: Board = {
    version: 1,
    revision: 0,
    id: createId(),
    title,
    description: '',
    layout: 'columns',
    background: 'paper',
    columns: [
      { id: createId(), title: '第1栏', color: 'white' },
      { id: createId(), title: '第2栏', color: 'white' },
      { id: createId(), title: '第3栏', color: 'white' },
    ],
    cards: [],
  };
  validateBoard(board);
  return board;
}

export function createCard(columnId: string, patch: CardPatch = {}): WallCard {
  validatePatch(patch, ['title', 'body', 'color', 'columnId', 'attachments', 'link']);
  const now = new Date().toISOString();
  const card: WallCard = {
    id: createId(), title: '', body: '', color: 'white', columnId,
    attachments: [], link: '', createdAt: now, updatedAt: now, ...copy(patch),
  };
  validateCard(card);
  return card;
}

export function parseBoard(text: string): Board {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail('无法读取看板：文件不是有效 JSON。原文件未被修改。');
  }
  validateBoard(value);
  return value;
}

export function serializeBoard(board: Board): string {
  validateBoard(board);
  return `${JSON.stringify(board, null, 2)}\n`;
}

function validatePatch(value: unknown, allowed: string[]): void {
  const patch = record(value, '修改内容');
  if (Object.keys(patch).some((key) => !allowed.includes(key) || patch[key] === undefined)) {
    fail('修改内容含有不支持的字段。');
  }
}

function nextTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

function findCard(board: Board, cardId: string): WallCard {
  return board.cards.find((card) => card.id === cardId) ?? fail('卡片已不存在，请刷新后重试。');
}

function checkConflict(card: WallCard, expectedUpdatedAt?: string): void {
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== card.updatedAt) {
    fail('这张卡片已在其他窗口修改。请重新打开卡片后再保存，避免覆盖新内容。');
  }
}

function insertCard(board: Board, card: WallCard, beforeId?: string): void {
  if (beforeId === undefined) {
    board.cards.push(card);
    return;
  }
  const beforeIndex = board.cards.findIndex((existing) => existing.id === beforeId);
  if (beforeIndex === -1) fail('目标卡片已不存在，请刷新后重试。');
  board.cards.splice(beforeIndex, 0, card);
}

/** Apply a single operation without mutating the board or the supplied operation. */
export function applyOperation(board: Board, operation: BoardOperation): Board {
  validateBoard(board);
  const next = copy(board);
  switch (operation.type) {
    case 'board:update':
      validatePatch(operation.patch, ['title', 'description', 'layout', 'background']);
      Object.assign(next, copy(operation.patch));
      break;
    case 'card:add':
      validateCard(operation.card);
      if (next.cards.some((card) => card.id === operation.card.id)) fail('卡片 ID 已存在。');
      insertCard(next, copy(operation.card), operation.beforeId);
      break;
    case 'card:update': {
      const card = findCard(next, operation.id);
      checkConflict(card, operation.expectedUpdatedAt);
      validatePatch(operation.patch, ['title', 'body', 'color', 'columnId', 'attachments', 'link']);
      Object.assign(card, copy(operation.patch), { updatedAt: nextTimestamp(card.updatedAt) });
      break;
    }
    case 'card:delete': {
      const card = findCard(next, operation.id);
      checkConflict(card, operation.expectedUpdatedAt);
      next.cards = next.cards.filter((existing) => existing.id !== card.id);
      break;
    }
    case 'card:move': {
      const card = findCard(next, operation.id);
      if (operation.beforeId === operation.id) {
        if (operation.columnId !== card.columnId) fail('卡片不能以自身作为其他分栏的目标。');
        break;
      }
      next.cards = next.cards.filter((existing) => existing.id !== card.id);
      card.columnId = operation.columnId;
      card.updatedAt = nextTimestamp(card.updatedAt);
      insertCard(next, card, operation.beforeId);
      break;
    }
    case 'column:add':
      next.columns.push(copy(operation.column));
      break;
    case 'column:update': {
      const column = next.columns.find((existing) => existing.id === operation.id) ?? fail('分栏已不存在。');
      validatePatch(operation.patch, ['title', 'color']);
      Object.assign(column, copy(operation.patch));
      break;
    }
    case 'column:delete': {
      if (!next.columns.some((column) => column.id === operation.id)) fail('分栏已不存在。');
      if (operation.id === operation.moveToId || !next.columns.some((column) => column.id === operation.moveToId)) {
        fail('删除分栏前，请指定另一个分栏接收卡片。');
      }
      next.columns = next.columns.filter((column) => column.id !== operation.id);
      next.cards.forEach((card) => {
        if (card.columnId === operation.id) {
          card.columnId = operation.moveToId;
          card.updatedAt = nextTimestamp(card.updatedAt);
        }
      });
      break;
    }
    default:
      fail('不支持的看板操作。');
  }
  next.revision += 1;
  validateBoard(next);
  return next;
}

function heading(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]<>#!|]/g, '\\$&');
}

function markdownPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)
    .replace(/[()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

function relativeAttachmentPath(path: string, fromFolder: string): string {
  const source = fromFolder ? fromFolder.split('/') : [];
  const destination = path.split('/');
  let common = 0;
  while (common < source.length && common < destination.length && source[common] === destination[common]) common += 1;
  return [...source.slice(common).map(() => '..'), ...destination.slice(common)].join('/');
}

export function exportMarkdown(board: Board, fromFolder = ''): string {
  validateBoard(board);
  if (fromFolder) validateAttachment({ path: fromFolder, name: '导出文件夹', mime: '' });
  const lines = [`# ${heading(board.title)}`, ''];
  if (board.description) lines.push(board.description, '');
  for (const column of board.columns) {
    lines.push(`## ${heading(column.title)}`, '');
    for (const card of board.cards.filter((entry) => entry.columnId === column.id)) {
      lines.push(`### ${heading(card.title || '未命名卡片')}`, '');
      if (card.body) lines.push(card.body, '');
      if (card.link) lines.push(`[打开链接](<${safeExternalUrl(card.link)}>)`, '');
      for (const attachment of card.attachments) {
        const image = attachment.mime.startsWith('image/') ? '!' : '';
        lines.push(`${image}[${heading(attachment.name)}](<${markdownPath(relativeAttachmentPath(attachment.path, fromFolder))}>)`, '');
      }
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Samples are created only when the user explicitly requests a demonstration. */
export function createDemoBoard(): Board {
  const board = createBoard('示例看板');
  const [ideas, doing, done] = board.columns;
  board.cards = [
    createCard(ideas.id, { title: '文字卡片', body: '可以写文字、列表和 Markdown。\n\n示例：**需要强调的内容**。' }),
    createCard(ideas.id, { title: '重命名栏', body: '点击栏标题，输入自己的分类名称。\n\n示例卡片，可编辑或删除。' }),
    createCard(doing.id, { title: '图片与文件', body: '添加卡片时选择附件，或把文件直接拖进这一栏。\n\n示例卡片，可编辑或删除。' }),
    createCard(ideas.id, { title: '移动卡片', body: '使用拖动手柄调整顺序，也可从卡片菜单选择移动。\n\n示例卡片，可编辑或删除。' }),
    createCard(done.id, { title: '墙视图', body: '顶部切换到“墙”，同一批卡片会自动排列。\n\n示例卡片，可编辑或删除。' }),
    createCard(doing.id, { title: '触屏操作', body: '小屏下横向滑动查看其他栏，点卡片标题可编辑。\n\n示例卡片，可编辑或删除。' }),
  ];
  return board;
}
