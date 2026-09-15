import { t } from './i18n';
import type { Attachment, Board, BoardOperation, CardPatch, WallCard } from './types';

const COLORS = new Set(['white', 'gray', 'sage', 'sand', 'rose', 'sky', 'lavender']);
const BACKGROUNDS = new Set(['paper', 'sage', 'rose', 'slate']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(t("{0}格式不正确。", label));
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, maxLength: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0') || (required && !value.trim())) {
    fail(t("{0}必须是{1}文本，且不超过 {2} 个字符。", label, required ? t('非空') : '', maxLength));
  }
}

function id(value: unknown, label: string): asserts value is string {
  string(value, label, 128, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) fail(t("{0}只能包含字母、数字、下划线和连字符。", label));
}

function timestamp(value: unknown, label: string): asserts value is string {
  string(value, label, 40, true);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value || parsed >= 8.64e15) {
    fail(t("{0}不是有效的 ISO 时间。", label));
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
  const attachment = record(value, t("附件"));
  string(attachment.path, t("附件路径"), 2_048, true);
  const path = attachment.path;
  if (CONTROL_CHARACTERS.test(path) || /[\\<>]/.test(path) || path.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    fail(t("附件必须使用仓库内的相对路径。"));
  }
  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(t("附件路径不能包含空目录或上级目录。"));
  }
  // Encoded traversal and separators must not become paths when rendered as URLs.
  if (/%(?:2e|2f|5c|00)/i.test(path)) fail(t("附件路径含有不安全的转义字符。"));
  string(attachment.name, t("附件名称"), 512, true);
  string(attachment.mime, t("附件类型"), 128);
}

function validateCard(value: unknown): asserts value is WallCard {
  const card = record(value, t("卡片"));
  id(card.id, t("卡片 ID"));
  id(card.columnId, t("卡片分栏 ID"));
  string(card.title, t("卡片标题"), 1_000);
  string(card.body, t("卡片正文"), 200_000);
  if (!COLORS.has(card.color as string)) fail(t("卡片颜色不受支持。"));
  if (!Array.isArray(card.attachments) || card.attachments.length > 100) fail(t("卡片附件列表不正确或超过 100 个。"));
  card.attachments.forEach(validateAttachment);
  string(card.link, t("卡片链接"), 8_192);
  if (card.link !== '' && !safeExternalUrl(card.link)) fail(t("卡片链接仅支持完整的 http:// 或 https:// 地址。"));
  timestamp(card.createdAt, t("创建时间"));
  timestamp(card.updatedAt, t("修改时间"));
  if (Date.parse(card.updatedAt) < Date.parse(card.createdAt)) fail(t("卡片修改时间不能早于创建时间。"));
}

function validateBoard(value: unknown): asserts value is Board {
  const board = record(value, t("看板"));
  if (board.version !== 1) fail(t("不支持此看板版本（{0}）。请保留原文件并更新插件。", String(board.version)));
  if (!Number.isSafeInteger(board.revision) || (board.revision as number) < 0) fail(t("看板修订号无效。"));
  id(board.id, t("看板 ID"));
  string(board.title, t("看板标题"), 1_000, true);
  string(board.description, t("看板描述"), 10_000);
  if (board.layout !== 'wall' && board.layout !== 'columns') fail(t("看板布局不受支持。"));
  if (!BACKGROUNDS.has(board.background as string)) fail(t("看板背景不受支持。"));
  if (!Array.isArray(board.columns) || board.columns.length < 1 || board.columns.length > 1_000) {
    fail(t("看板需要 1 至 1000 个分栏。"));
  }
  const columnIds = new Set<string>();
  for (const value of board.columns) {
    const column = record(value, t("分栏"));
    id(column.id, t("分栏 ID"));
    string(column.title, t("分栏标题"), 200, true);
    if (!COLORS.has(column.color as string)) fail(t("分栏颜色不受支持。"));
    if (columnIds.has(column.id)) fail(t("看板含有重复的分栏 ID。"));
    columnIds.add(column.id);
  }
  if (!Array.isArray(board.cards) || board.cards.length > 20_000) fail(t("看板卡片列表不正确或超过 20000 张。"));
  const cardIds = new Set<string>();
  for (const card of board.cards) {
    validateCard(card);
    if (cardIds.has(card.id)) fail(t("看板含有重复的卡片 ID。"));
    if (!columnIds.has(card.columnId)) fail(t("卡片指向不存在的分栏。请保留原文件。"));
    cardIds.add(card.id);
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `linb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createBoard(title = t("未命名看板")): Board {
  const board: Board = {
    version: 1,
    revision: 0,
    id: createId(),
    title,
    description: '',
    layout: 'columns',
    background: 'paper',
    columns: [
      { id: createId(), title: t("第1栏"), color: 'white' },
      { id: createId(), title: t("第2栏"), color: 'white' },
      { id: createId(), title: t("第3栏"), color: 'white' },
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

/** Only marked Markdown notes belong to this plugin; ordinary notes are untouched. */
export function isBoardMarkdown(text: string): boolean {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return !!frontmatter && /^linb-kanban: *1 *$/m.test(frontmatter[1].replace(/\r/g, ''));
}

export function parseBoard(text: string): Board {
  // Earlier JSON boards remain readable; repository saves preserve their format.
  if (text.trimStart().startsWith('{')) {
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { fail(t("无法读取旧版看板：文件不是有效 JSON。原文件未被修改。")); }
    validateBoard(value);
    return value;
  }
  if (!isBoardMarkdown(text)) fail(t("这不是 LinB Kanban 看板，或文件格式版本不受支持。原文件未被修改。"));
  const metadata = /\n<!-- linb-kanban:data ([^\r\n]+) -->\s*$/.exec(text);
  if (!metadata) fail(t("看板信息缺失，请保留文件末尾的 LinB Kanban 信息。"));
  let data: Record<string, unknown>;
  try { data = record(JSON.parse(metadata[1]), t("看板信息")); }
  catch { fail(t("看板信息损坏。原文件未被修改。")); }
  if (data.format !== 1) fail(t("此 Markdown 看板版本不受支持，请更新插件。"));
  string(data.fromFolder, t("看板文件夹"), 2_048);
  const candidate = record(data.board, t("看板"));
  if (!Array.isArray(candidate.cards)) fail(t("卡片列表不正确。"));
  const board = { ...candidate, cards: candidate.cards.map(value => ({ ...record(value, t("卡片")), body: '' })) };
  validateBoard(board);
  const bodies = new Map<string, string>();
  const pattern = /<!-- linb-kanban:body ([a-zA-Z0-9_-]+) -->\r?\n([\s\S]*?)\r?\n<!-- linb-kanban:end-body \1 -->/g;
  for (const match of text.slice(0, metadata.index).matchAll(pattern)) {
    if (bodies.has(match[1])) fail(t("卡片正文标记重复，请保留原文件。"));
    bodies.set(match[1], match[2]);
  }
  if (bodies.size !== board.cards.length) fail(t("卡片正文标记缺失或重复，请保留原文件。"));
  for (const card of board.cards) {
    if (!bodies.has(card.id)) fail(t("卡片正文标记缺失，请保留原文件。"));
    card.body = bodies.get(card.id)!;
  }
  validateBoard(board);
  // Body text is authoritative. Reject unsupported source edits instead of silently discarding them.
  const normalized = (value: string) => value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd();
  if (normalized(text) !== normalized(exportMarkdown(board, data.fromFolder))) {
    fail(t("看板标题、分栏或附件结构在源码中有改动。请保留原文件，在看板界面修改这些内容；正文可在卡片正文标记之间编辑。"));
  }
  return board;
}

export function serializeBoard(board: Board, fromFolder = ''): string {
  return exportMarkdown(board, fromFolder);
}

function validatePatch(value: unknown, allowed: string[]): void {
  const patch = record(value, t("修改内容"));
  if (Object.keys(patch).some((key) => !allowed.includes(key) || patch[key] === undefined)) {
    fail(t("修改内容含有不支持的字段。"));
  }
}

function nextTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

function findCard(board: Board, cardId: string): WallCard {
  return board.cards.find((card) => card.id === cardId) ?? fail(t("卡片已不存在，请刷新后重试。"));
}

function checkConflict(card: WallCard, expectedUpdatedAt?: string, expectedBody?: string): void {
  if ((expectedUpdatedAt !== undefined && expectedUpdatedAt !== card.updatedAt) || (expectedBody !== undefined && expectedBody !== card.body)) {
    fail(t("这张卡片已在其他窗口修改。请重新打开卡片后再保存，避免覆盖新内容。"));
  }
}

function insertCard(board: Board, card: WallCard, beforeId?: string): void {
  if (beforeId === undefined) {
    board.cards.push(card);
    return;
  }
  const beforeIndex = board.cards.findIndex((existing) => existing.id === beforeId);
  if (beforeIndex === -1) fail(t("目标卡片已不存在，请刷新后重试。"));
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
      if (next.cards.some((card) => card.id === operation.card.id)) fail(t("卡片 ID 已存在。"));
      insertCard(next, copy(operation.card), operation.beforeId);
      break;
    case 'card:update': {
      const card = findCard(next, operation.id);
      checkConflict(card, operation.expectedUpdatedAt, operation.expectedBody);
      validatePatch(operation.patch, ['title', 'body', 'color', 'columnId', 'attachments', 'link']);
      Object.assign(card, copy(operation.patch), { updatedAt: nextTimestamp(card.updatedAt) });
      break;
    }
    case 'card:delete': {
      const card = findCard(next, operation.id);
      checkConflict(card, operation.expectedUpdatedAt, operation.expectedBody);
      next.cards = next.cards.filter((existing) => existing.id !== card.id);
      break;
    }
    case 'card:move': {
      const card = findCard(next, operation.id);
      if (operation.beforeId === operation.id) {
        if (operation.columnId !== card.columnId) fail(t("卡片不能以自身作为其他分栏的目标。"));
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
      const column = next.columns.find((existing) => existing.id === operation.id) ?? fail(t("分栏已不存在。"));
      validatePatch(operation.patch, ['title', 'color']);
      Object.assign(column, copy(operation.patch));
      break;
    }
    case 'column:delete': {
      if (!next.columns.some((column) => column.id === operation.id)) fail(t("分栏已不存在。"));
      if (operation.id === operation.moveToId || !next.columns.some((column) => column.id === operation.moveToId)) {
        fail(t("删除分栏前，请指定另一个分栏接收卡片。"));
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
      fail(t("不支持的看板操作。"));
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
  const lines = ['---', 'linb-kanban: 1', '---', '', `# ${heading(board.title)}`, ''];
  if (board.description.includes('<!-- linb-kanban:')) fail(t("看板描述不能包含 LinB Kanban 内部标记。"));
  if (board.description) lines.push(board.description, '');
  for (const column of board.columns) {
    lines.push(`## ${heading(column.title)}`, '');
    for (const card of board.cards.filter((entry) => entry.columnId === column.id)) {
      lines.push(`### ${heading(card.title || '未命名卡片')}`, '');
      if (card.body.includes('<!-- linb-kanban:')) fail(t("正文不能包含 LinB Kanban 内部标记，请移除该标记后保存。"));
      lines.push(`<!-- linb-kanban:body ${card.id} -->`, card.body, `<!-- linb-kanban:end-body ${card.id} -->`, '');
      if (card.link) lines.push(`[打开链接](<${safeExternalUrl(card.link)}>)`, '');
      for (const attachment of card.attachments) {
        const image = attachment.mime.startsWith('image/') ? '!' : '';
        lines.push(`${image}[${heading(attachment.name)}](<${markdownPath(relativeAttachmentPath(attachment.path, fromFolder))}>)`, '');
      }
    }
  }
  const metadata = { format: 1, fromFolder, board: { ...board, cards: board.cards.map(({ body: _body, ...card }) => card) } };
  const json = JSON.stringify(metadata).replace(/[<>&-]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  lines.push(`<!-- linb-kanban:data ${json} -->`);
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Samples are created only when the user explicitly requests a demonstration. */
export function createDemoBoard(): Board {
  const board = createBoard(t("示例看板"));
  const [ideas, doing, done] = board.columns;
  board.cards = [
    createCard(ideas.id, { title: t("文字卡片"), body: t("可以写文字、列表和 Markdown。\n\n示例：**需要强调的内容**。") }),
    createCard(ideas.id, { title: t("重命名栏"), body: t("点击栏标题，输入自己的分类名称。\n\n示例卡片，可编辑或删除。") }),
    createCard(doing.id, { title: t("图片与文件"), body: t("添加卡片时选择附件，或把文件直接拖进这一栏。\n\n示例卡片，可编辑或删除。") }),
    createCard(ideas.id, { title: t("移动卡片"), body: t("使用拖动手柄调整顺序，也可从卡片菜单选择移动。\n\n示例卡片，可编辑或删除。") }),
    createCard(done.id, { title: t("墙视图"), body: t("顶部切换到“墙”，同一批卡片会自动排列。\n\n示例卡片，可编辑或删除。") }),
    createCard(doing.id, { title: t("触屏操作"), body: t("小屏下横向滑动查看其他栏，点卡片标题可编辑。\n\n示例卡片，可编辑或删除。") }),
  ];
  return board;
}
