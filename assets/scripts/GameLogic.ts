import { GRID } from './GameConfig';

export type Dir = 'left' | 'right' | 'up' | 'down';

export interface Cell { row: number; col: number; }
export interface SpawnInfo { row: number; col: number; value: number; }

/** 单个方块的移动轨迹 */
export interface TileMove {
    from: Cell;
    to: Cell;
    value: number;        // 移动方块当前的值
    mergedInto: boolean;  // true 表示它撞进目标后消失
}

export interface MoveResult {
    moved: boolean;        // 本次是否产生了有效移动
    gained: number;        // 本次得分
    moves: TileMove[];     // 所有方块的移动轨迹
    merges: Cell[];        // 发生了翻倍的目标格（用于合并动画/粒子）
    spawn: SpawnInfo | null;
}

/** 可序列化的局面快照（存档 / 撤销共用） */
export interface GameState {
    grid: number[][];
    score: number;
}

/** 纯 2048 逻辑，零引擎依赖 */
export class GameLogic {
    grid: number[][] = this.empty();
    score = 0;

    private empty(): number[][] {
        return Array.from({ length: GRID }, () => new Array(GRID).fill(0));
    }

    /** 重开：清空 + 随机生成两个起始方块 */
    reset(): SpawnInfo[] {
        this.grid = this.empty();
        this.score = 0;
        const a = this.spawnRandom();
        const b = this.spawnRandom();
        return [a, b].filter(Boolean) as SpawnInfo[];
    }

    /** 在随机空格生成一个方块（90% 是 2，10% 是 4） */
    spawnRandom(): SpawnInfo | null {
        const empties: Cell[] = [];
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++)
                if (this.grid[r][c] === 0) empties.push({ row: r, col: c });
        if (empties.length === 0) return null;

        const pick = empties[Math.floor(Math.random() * empties.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        this.grid[pick.row][pick.col] = value;
        return { row: pick.row, col: pick.col, value };
    }

    /** 把每条 line 按滑动前进方向排列 */
    private buildLines(dir: Dir): Cell[][] {
        const lines: Cell[][] = [];
        for (let i = 0; i < GRID; i++) {
            const line: Cell[] = [];
            for (let j = 0; j < GRID; j++) {
                let row = 0, col = 0;
                switch (dir) {
                    case 'left':  row = i; col = j;            break;
                    case 'right': row = i; col = GRID - 1 - j; break;
                    case 'up':    row = j; col = i;            break;
                    case 'down':  row = GRID - 1 - j; col = i; break;
                }
                line.push({ row, col });
            }
            lines.push(line);
        }
        return lines;
    }

    /** 核心：朝某方向移动一步 */
    move(dir: Dir): MoveResult {
        const moves: TileMove[] = [];
        const merges: Cell[] = [];
        let gained = 0;
        const next = this.empty();

        for (const line of this.buildLines(dir)) {
            // 取出这条 line 上的非空方块，保持前进顺序
            const stack: { value: number; from: Cell }[] = [];
            for (const cell of line) {
                const v = this.grid[cell.row][cell.col];
                if (v !== 0) stack.push({ value: v, from: cell });
            }

            let target = 0; // 当前要落到的 line 槽位
            let i = 0;
            while (i < stack.length) {
                const cur = stack[i];
                const nxt = stack[i + 1];
                const dest = line[target];

                if (nxt && nxt.value === cur.value) {
                    // 两块相等 -> 合并到 dest
                    const merged = cur.value * 2;
                    next[dest.row][dest.col] = merged;
                    gained += merged;
                    moves.push({ from: cur.from, to: dest, value: cur.value, mergedInto: false });
                    moves.push({ from: nxt.from, to: dest, value: nxt.value, mergedInto: true });
                    merges.push(dest);
                    i += 2;
                } else {
                    next[dest.row][dest.col] = cur.value;
                    moves.push({ from: cur.from, to: dest, value: cur.value, mergedInto: false });
                    i += 1;
                }
                target += 1;
            }
        }

        // 有位移或有合并即视为有效移动
        const moved = merges.length > 0 ||
            moves.some(m => m.from.row !== m.to.row || m.from.col !== m.to.col);

        if (moved) {
            this.grid = next;
            this.score += gained;
        }
        const spawn = moved ? this.spawnRandom() : null;
        return { moved, gained, moves, merges, spawn };
    }

    /** 是否还能继续（有空格或有相邻可合并） */
    canMove(): boolean {
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++) {
                const v = this.grid[r][c];
                if (v === 0) return true;
                if (c + 1 < GRID && this.grid[r][c + 1] === v) return true;
                if (r + 1 < GRID && this.grid[r + 1][c] === v) return true;
            }
        return false;
    }

    /** 是否已出现达到目标值的方块 */
    hasValue(target: number): boolean {
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++)
                if (this.grid[r][c] >= target) return true;
        return false;
    }

    /** 深拷贝快照 */
    getState(): GameState {
        return { grid: this.grid.map(row => row.slice()), score: this.score };
    }

    restoreState(state: GameState) {
        this.grid = state.grid.map(row => row.slice());
        this.score = state.score;
    }

    /** 校验外部数据（localStorage 读回）是否是合法快照 */
    static isValidState(s: any): s is GameState {
        return !!s && typeof s.score === 'number' && Array.isArray(s.grid) &&
            s.grid.length === GRID &&
            s.grid.every((row: any) => Array.isArray(row) && row.length === GRID &&
                row.every((v: any) => typeof v === 'number' && v >= 0));
    }
}
