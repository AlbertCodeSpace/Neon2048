import { Color } from 'cc';

/** 棋盘是 4x4 */
export const GRID = 4;
/** 单步滑动动画时长（秒） */
export const MOVE_TIME = 0.12;
/** 撤销栈上限 */
export const UNDO_LIMIT = 5;
/** 滑动触发阈值（屏幕像素） */
export const SWIPE_THRESHOLD = 30;

export const BEST_KEY = 'neon2048_best';
export const SAVE_KEY = 'neon2048_save';

/** 每个数值对应的霓虹色 */
const HEX: Record<number, string> = {
    2: '#00f0ff', 4: '#39a0ff', 8: '#7c5cff', 16: '#b14cff',
    32: '#ff2d9b', 64: '#ff4d4d', 128: '#ff8a00', 256: '#ffd400',
    512: '#a6ff00', 1024: '#00ff9d', 2048: '#ffffff',
};

export function tileColor(value: number): Color {
    return new Color().fromHEX(HEX[value] ?? '#ffffff');
}

/** 数字越大字号越小，避免溢出（方块 140px） */
export function fontSizeFor(value: number): number {
    return value >= 1024 ? 38 : value >= 128 ? 46 : 58;
}

const ALL_NEON = Object.values(HEX);

/** 随机霓虹色（2048 全屏庆祝用） */
export function randomNeon(): Color {
    return new Color().fromHEX(ALL_NEON[Math.floor(Math.random() * ALL_NEON.length)]);
}
