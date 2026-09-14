import { applyOperation, parseBoard, serializeBoard } from './model';
import type { Board, BoardOperation } from './types';

export interface BoardIO {
  read(path: string): Promise<string>;
  process(path: string, update: (current: string) => string): Promise<string>;
}

/** Queue local changes, then apply each to the current on-disk board atomically. */
export class BoardRepository {
  private pending = new Map<string, Promise<unknown>>();
  constructor(private readonly io: BoardIO) {}
  async read(path: string): Promise<Board> { return parseBoard(await this.io.read(path)); }
  save(path: string, operation: BoardOperation): Promise<Board> {
    const previous = this.pending.get(path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const saved = await this.io.process(path, current => {
        const board = applyOperation(parseBoard(current), operation);
        // Opening a historical file never changes its format or path.
        return path.endsWith('.moss') ? `${JSON.stringify(board, null, 2)}\n`
          : serializeBoard(board, path.split('/').slice(0, -1).join('/'));
      });
      return parseBoard(saved);
    });
    this.pending.set(path, next);
    void next.finally(() => { if (this.pending.get(path) === next) this.pending.delete(path); }).catch(() => undefined);
    return next;
  }
}
