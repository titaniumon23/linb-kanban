export type CardColor = 'white' | 'gray' | 'sage' | 'sand' | 'rose' | 'sky' | 'lavender';
export type BoardBackground = 'paper' | 'sage' | 'rose' | 'slate';
export type Layout = 'wall' | 'columns';
export interface Attachment { path: string; name: string; mime: string }
export interface WallCard {
  id: string; title: string; body: string; color: CardColor; columnId: string;
  attachments: Attachment[]; link: string; createdAt: string; updatedAt: string;
}
export interface WallColumn { id: string; title: string; color: CardColor }
export interface Board {
  version: 1; revision: number; id: string; title: string; description: string;
  layout: Layout; background: BoardBackground; columns: WallColumn[]; cards: WallCard[];
}
export type CardPatch = Partial<Pick<WallCard, 'title' | 'body' | 'color' | 'columnId' | 'attachments' | 'link'>>;
export type BoardOperation =
  | { type: 'board:update'; patch: Partial<Pick<Board, 'title' | 'description' | 'layout' | 'background'>> }
  | { type: 'card:add'; card: WallCard; beforeId?: string }
  | { type: 'card:update'; id: string; patch: CardPatch; expectedUpdatedAt?: string }
  | { type: 'card:delete'; id: string; expectedUpdatedAt?: string }
  | { type: 'card:move'; id: string; columnId: string; beforeId?: string }
  | { type: 'column:add'; column: WallColumn }
  | { type: 'column:update'; id: string; patch: Partial<Pick<WallColumn, 'title' | 'color'>> }
  | { type: 'column:delete'; id: string; moveToId: string };

export interface WallHost {
  save(operation: BoardOperation): Promise<Board>;
  importFiles(files: File[]): Promise<Attachment[]>;
  chooseVaultImages?(): Promise<Attachment[]>;
  resolveAsset(path: string): string;
  renderMarkdown(text: string, container: HTMLElement): void | Promise<void>;
  openAttachment(attachment: Attachment): void;
  openLink(url: string): void;
  exportMarkdown(): Promise<void>;
  createBoard(): void;
  chooseBoard(): void;
}
