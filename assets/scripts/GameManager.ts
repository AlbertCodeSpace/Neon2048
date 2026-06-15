import {
    _decorator, Button, Component, EventKeyboard, EventTouch, Input, KeyCode, Label,
    Node, Prefab, SpriteFrame, Tween, UITransform, Vec2, Vec3, input, instantiate, sys, tween,
} from 'cc';
import { sfx } from './AudioManager';
import { Block } from './Block';
import {
    BEST_KEY, GRID, MOVE_TIME, SAVE_KEY, SWIPE_THRESHOLD, UNDO_LIMIT,
    randomNeon, tileColor,
} from './GameConfig';
import { Cell, Dir, GameLogic, GameState, MoveResult } from './GameLogic';
import { PopupCtrl } from './PopupCtrl';
import { burstStars } from './StarBurst';
const { ccclass, property } = _decorator;

/**
 * 总控，挂在 Canvas 上。
 * 场景节点全部按名字解析，不改动任何现有布局；
 * 仅需在编辑器里把 Block / Popup 预制体和 star 精灵帧拖到属性槽。
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property(Prefab) blockPrefab: Prefab = null!;
    @property(Prefab) popupPrefab: Prefab = null!;
    @property(SpriteFrame) starFrame: SpriteFrame = null!;

    private logic = new GameLogic();
    private blocks: (Node | null)[][] = [];
    private cellPos: Vec3[][] = [];
    private boardBox: Node = null!;
    private scoreLabel: Label = null!;
    private bestBox: Node = null!;
    private bestLabel: Label = null!;
    private popup: PopupCtrl = null!;

    private locked = false;
    private won = false;
    private best = 0;
    /** 本局开局时的历史最高分（要超越的纪录）+ 是否已播过破纪录音效（每局一次） */
    private bestAtStart = 0;
    private recordBroken = false;
    /** 撤销栈：除快照外还存当步轨迹，撤回时反演动画 */
    private undoStack: { state: GameState; result: MoveResult }[] = [];
    private startTouch = new Vec2();

    start() {
        this.resolveSceneNodes();
        this.setupPopup();
        this.setupButtons();
        this.bindInput();

        this.best = Number(sys.localStorage.getItem(BEST_KEY) ?? '0') || 0;
        this.loadOrNewGame();
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    // ---------- 初始化 ----------

    private resolveSceneNodes() {
        this.boardBox = this.node.getChildByName('BoardBox')!;
        this.scoreLabel = this.node.getChildByName('ScoreBox')!.getChildByName('Score')!.getComponent(Label)!;
        this.bestBox = this.node.getChildByName('BestScoreBox')!;
        this.bestLabel = this.bestBox.getChildByName('Best')!.getComponent(Label)!;

        // 落点直接取 00-33 格子节点的实际坐标，保证与布局完全对齐
        this.cellPos = [];
        for (let r = 0; r < GRID; r++) {
            const row: Vec3[] = [];
            for (let c = 0; c < GRID; c++) {
                row.push(this.boardBox.getChildByName(`${r}${c}`)!.position.clone());
            }
            this.cellPos.push(row);
        }
    }

    private setupPopup() {
        const node = instantiate(this.popupPrefab);
        this.normalizeLayer(node);
        node.parent = this.node; // Canvas 最后一个子节点，自然盖在最上层
        node.active = false;
        this.popup = node.addComponent(PopupCtrl);
    }

    private setupButtons() {
        this.bindButton('RestButton', () => this.onRestartClick());
        this.bindButton('SaveButton', () => this.onSaveClick());
        this.bindButton('UndoButton', () => this.onUndoClick());
    }

    private bindButton(name: string, handler: () => void) {
        const node = this.node.getChildByName(name)!;
        const btn = node.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.92;
        btn.target = node;
        node.on(Button.EventType.CLICK, () => { sfx('click'); handler(); }, this);
    }

    /** 预制体 layer 是 DEFAULT，UI 相机看不见，统一归一到 Canvas 的 UI_2D */
    private normalizeLayer(node: Node) {
        node.layer = this.node.layer;
        node.children.forEach(child => this.normalizeLayer(child));
    }

    // ---------- 局面 ----------

    private loadOrNewGame() {
        const raw = sys.localStorage.getItem(SAVE_KEY);
        if (raw) {
            try {
                const state = JSON.parse(raw);
                if (GameLogic.isValidState(state)) {
                    this.logic.restoreState(state);
                    this.won = this.logic.hasValue(2048);
                    this.recordBroken = false;
                    this.bestAtStart = this.best;
                    this.rebuildBoard();
                    this.updateScore();
                    return;
                }
            } catch { /* 存档损坏则直接开新局 */ }
        }
        this.newGame();
    }

    private newGame() {
        this.clearBlocks();
        this.undoStack.length = 0;
        this.locked = false;
        this.won = false;
        this.recordBroken = false;
        this.bestAtStart = this.best;
        const spawns = this.logic.reset();
        for (const s of spawns) this.createBlock(s.row, s.col, s.value, true);
        this.updateScore();
    }

    private emptyGrid(): (Node | null)[][] {
        return Array.from({ length: GRID }, () => new Array(GRID).fill(null));
    }

    private clearBlocks() {
        for (const row of this.blocks) {
            for (const node of row) node?.destroy();
        }
        this.blocks = this.emptyGrid();
    }

    /** 按当前逻辑网格整体重建（读档 / 撤销） */
    private rebuildBoard() {
        this.clearBlocks();
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++)
                if (this.logic.grid[r][c] !== 0)
                    this.createBlock(r, c, this.logic.grid[r][c], false);
        this.locked = false;
    }

    private createBlock(row: number, col: number, value: number, spawn: boolean) {
        const node = instantiate(this.blockPrefab);
        this.normalizeLayer(node);
        node.parent = this.boardBox; // 排在 16 个格子之后，渲染在格子上层
        node.setPosition(this.cellPos[row][col]);
        const block = node.addComponent(Block);
        block.setValue(value);
        if (spawn) block.playSpawn();
        this.blocks[row][col] = node;
    }

    // ---------- 输入 ----------

    private bindInput() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    private onTouchStart(e: EventTouch) {
        e.getLocation(this.startTouch);
    }

    private onTouchEnd(e: EventTouch) {
        const end = e.getLocation();
        const dx = end.x - this.startTouch.x;
        const dy = end.y - this.startTouch.y;
        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? 'right' : 'left');
        else this.tryMove(dy > 0 ? 'up' : 'down'); // 屏幕坐标 y 向上为正
    }

    private onKey(e: EventKeyboard) {
        switch (e.keyCode) {
            case KeyCode.ARROW_LEFT: case KeyCode.KEY_A: this.tryMove('left'); break;
            case KeyCode.ARROW_RIGHT: case KeyCode.KEY_D: this.tryMove('right'); break;
            case KeyCode.ARROW_UP: case KeyCode.KEY_W: this.tryMove('up'); break;
            case KeyCode.ARROW_DOWN: case KeyCode.KEY_S: this.tryMove('down'); break;
        }
    }

    // ---------- 移动 + 动画 ----------

    /** 滑动方向单位向量 */
    private static readonly DIR_VEC: Record<Dir, [number, number]> = {
        left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1],
    };
    /** 撞击晃动：沿滑动方向的衰减振荡（位移增量，总和为 0） */
    private static readonly WOBBLE_DELTAS = [9, -14, 8, -3];
    private static readonly WOBBLE_DURS = [0.045, 0.06, 0.05, 0.045];

    private tryMove(dir: Dir) {
        if (this.locked || this.popup.visible) return;
        const snapshot = this.logic.getState();
        const result = this.logic.move(dir);
        if (!result.moved) { sfx('invalid'); return; }
        // 有合并交给合并音（在结算瞬间播放，与视觉同步）；没合并才用滑动音做反馈
        if (result.merges.length === 0) sfx('swipe');

        this.undoStack.push({ state: snapshot, result });
        if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();

        this.locked = true;
        this.animate(result, dir);
    }

    private animate(result: MoveResult, dir: Dir) {
        const next = this.emptyGrid();
        const mergeSet = new Set(result.merges.map(c => `${c.row}${c.col}`));
        const [ux, uy] = GameManager.DIR_VEC[dir];

        // 1) 所有方块滑向目标；被合并者到位后销毁
        for (const m of result.moves) {
            const node = this.blocks[m.from.row][m.from.col];
            if (!node) continue;

            // 撞击晃动会拖到输入解锁之后；连续快滑时先停掉残留 tween 并吸附回格点，防止漂移
            Tween.stopAllByTarget(node);
            node.setScale(1, 1, 1);
            node.setPosition(this.cellPos[m.from.row][m.from.col]);

            if (m.mergedInto) node.setSiblingIndex(this.boardBox.children.length - 1);

            const slid = m.from.row !== m.to.row || m.from.col !== m.to.col;
            let t = tween(node)
                .to(MOVE_TIME, { position: this.cellPos[m.to.row][m.to.col] }, { easing: 'quadOut' });
            if (m.mergedInto) {
                t = t.call(() => node.destroy());
            } else if (slid && !mergeSet.has(`${m.to.row}${m.to.col}`)) {
                // 没合成的滑动方块：撞上边界/其他方块后沿运动方向衰减振荡，晃出撞击感
                GameManager.WOBBLE_DELTAS.forEach((d, i) => {
                    t = t.by(GameManager.WOBBLE_DURS[i],
                        { position: new Vec3(ux * d, uy * d, 0) },
                        { easing: i === 0 ? 'quadOut' : 'quadInOut' });
                });
            }
            t.start();
            if (!m.mergedInto) next[m.to.row][m.to.col] = node;
        }

        // 2) 碰撞瞬间收尾：翻倍回弹 + star 粒子迸发
        this.scheduleOnce(() => {
            let maxMerged = 0;
            for (const cell of result.merges) {
                const node = next[cell.row][cell.col];
                if (!node) continue;
                const value = this.logic.grid[cell.row][cell.col];
                maxMerged = Math.max(maxMerged, value);
                const block = node.getComponent(Block)!;
                node.setSiblingIndex(this.boardBox.children.length - 1); // 置顶，放大时压住邻块
                block.setValue(value);
                block.playMerge();
                burstStars(this.boardBox, this.cellPos[cell.row][cell.col], tileColor(value), this.starFrame);
            }
            // 整步只放一声合并音，避免多块同时合并时叠成噪音；大数字用更亮的变体
            if (maxMerged > 0) sfx(maxMerged >= 512 ? 'merge_big' : 'merge');
            this.blocks = next;
            if (result.spawn) {
                this.createBlock(result.spawn.row, result.spawn.col, result.spawn.value, true);
            }
            this.updateScore();
            this.checkState();
            this.locked = false;
        }, MOVE_TIME);
    }

    // ---------- 分数与状态 ----------

    private updateScore() {
        this.scoreLabel.string = this.logic.score.toString();
        if (this.logic.score > this.best) {
            // 首次越过开局时的历史最高 → 破纪录音效，整局只响一次
            // （bestAtStart>0 才算「破纪录」，避免首次游玩从 0 分起步就触发）
            if (!this.recordBroken && this.bestAtStart > 0 && this.logic.score > this.bestAtStart) {
                this.recordBroken = true;
                // 同一步若首次达成 2048，让随后更隆重的 2048 庆祝接管，避免双重胜利音/特效
                if (!(this.logic.hasValue(2048) && !this.won)) {
                    this.celebrateRecord();
                }
            }
            this.best = this.logic.score;
            sys.localStorage.setItem(BEST_KEY, String(this.best));
        }
        this.bestLabel.string = this.best.toString();
    }

    private checkState() {
        if (!this.won && this.logic.hasValue(2048)) {
            this.won = true;
            this.celebrate();
        }
        if (!this.logic.canMove()) {
            // Confirm 重开；Close 仅关闭，留给玩家用 Undo 自救
            this.popup.show('gameover', () => this.newGame());
        }
    }

    /** 首次合成 2048：全屏星星庆祝，不打断游戏 */
    private celebrate() {
        sfx('win');
        const ui = this.node.getComponent(UITransform)!;
        for (let i = 0; i < 30; i++) {
            this.scheduleOnce(() => {
                const pos = new Vec3(
                    (Math.random() - 0.5) * ui.width * 0.9,
                    (Math.random() - 0.5) * ui.height * 0.9,
                    0,
                );
                burstStars(this.node, pos, randomNeon(), this.starFrame, 10, 190);
            }, Math.random() * 1.4);
        }
    }

    /** 破纪录：聚焦 Best 分数的小庆祝（数字脉动 + 霓虹闪色 + 多波星星），约 2.5s，比 2048 克制 */
    private celebrateRecord() {
        sfx('win');

        // Best 数字脉动 3 次（每次 ~0.4s，共 ~1.2s）
        const labelNode = this.bestLabel.node;
        Tween.stopAllByTarget(labelNode);
        labelNode.setScale(1, 1, 1);
        tween(labelNode)
            .to(0.18, { scale: new Vec3(1.28, 1.28, 1) }, { easing: 'quadOut' })
            .to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .union()
            .repeat(3)
            .start();

        // 霓虹闪色：染亮 → 渐回 → 再染 → 渐回（~1.2s）
        const orig = this.bestLabel.color.clone();
        Tween.stopAllByTarget(this.bestLabel);
        this.bestLabel.color = randomNeon();
        tween(this.bestLabel)
            .to(0.6, { color: orig })
            .call(() => { this.bestLabel.color = randomNeon(); })
            .to(0.6, { color: orig })
            .start();

        // 星星分 4 波从 Best 框迸发，铺满 ~2s
        for (let i = 0; i < 4; i++) {
            this.scheduleOnce(() => {
                burstStars(this.node, this.bestBox.position, randomNeon(), this.starFrame, 12, 110);
            }, i * 0.55);
        }
    }

    // ---------- 按钮 ----------

    private onRestartClick() {
        if (this.locked || this.popup.visible) return;
        this.popup.show('restart', () => this.newGame());
    }

    private onSaveClick() {
        if (this.locked || this.popup.visible) return;
        // 素材文案是「保存成功!」——先存档，弹窗只作结果提示
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.logic.getState()));
        this.popup.show('save');
    }

    private onUndoClick() {
        if (this.locked || this.popup.visible) return;
        const entry = this.undoStack.pop();
        if (!entry) return;
        sfx('undo');
        this.locked = true;
        this.animateUndo(entry.state, entry.result);
    }

    /** 撤回动画：沿原轨迹反向滑回，合并块分离成两块，新生成块缩小消失 */
    private animateUndo(state: GameState, result: MoveResult) {
        const mergeKey = (c: Cell) => `${c.row}${c.col}`;
        const mergeSet = new Set(result.merges.map(mergeKey));
        const twins: Node[] = [];

        // 1) 新生成的方块缩小消失
        if (result.spawn) {
            const spawnNode = this.blocks[result.spawn.row][result.spawn.col];
            if (spawnNode) {
                Tween.stopAllByTarget(spawnNode);
                tween(spawnNode)
                    .to(0.08, { scale: new Vec3(0, 0, 1) }, { easing: 'quadIn' })
                    .call(() => spawnNode.destroy())
                    .start();
                this.blocks[result.spawn.row][result.spawn.col] = null;
            }
        }

        // 2) 各方块沿原路滑回；合并目标先变回合并前数值，并分裂出 twin 滑回另一来源
        for (const m of result.moves) {
            if (m.mergedInto) continue; // twin 在 merge 分支统一生成
            const node = this.blocks[m.to.row][m.to.col];
            if (!node) continue;

            Tween.stopAllByTarget(node);
            node.setScale(1, 1, 1);
            node.setPosition(this.cellPos[m.to.row][m.to.col]);

            if (mergeSet.has(mergeKey(m.to))) {
                node.getComponent(Block)!.setValue(m.value);
                const twinMove = result.moves.find(x =>
                    x.mergedInto && x.to.row === m.to.row && x.to.col === m.to.col)!;
                const twin = instantiate(this.blockPrefab);
                this.normalizeLayer(twin);
                twin.parent = this.boardBox;
                twin.setPosition(this.cellPos[m.to.row][m.to.col]);
                twin.addComponent(Block).setValue(twinMove.value);
                twins.push(twin);
                tween(twin)
                    .to(MOVE_TIME, { position: this.cellPos[twinMove.from.row][twinMove.from.col] }, { easing: 'quadOut' })
                    .start();
            }
            tween(node)
                .to(MOVE_TIME, { position: this.cellPos[m.from.row][m.from.col] }, { easing: 'quadOut' })
                .start();
        }

        // 3) 动画结束后以快照为准整体重建（twin 是临时演员，先撤场）
        this.scheduleOnce(() => {
            twins.forEach(t => t.destroy());
            this.logic.restoreState(state);
            this.rebuildBoard();
            this.updateScore();
        }, MOVE_TIME + 0.02);
    }
}
