import { _decorator, Component, Label, Sprite, Vec3, tween } from 'cc';
import { tileColor, fontSizeFor } from './GameConfig';
const { ccclass } = _decorator;

/**
 * 方块表现组件。运行时 addComponent 到 Block.prefab 实例上，
 * 子节点按名字解析（BlankGlow / Block / Label），无需编辑器拖引用。
 */
@ccclass('Block')
export class Block extends Component {
    private glow: Sprite | null = null;
    private bg: Sprite = null!;
    private label: Label = null!;
    private inited = false;

    private _value = 0;
    get value() { return this._value; }

    private ensureRefs() {
        if (this.inited) return;
        this.inited = true;
        this.glow = this.node.getChildByName('BlankGlow')?.getComponent(Sprite) ?? null;
        this.bg = this.node.getChildByName('Block')!.getComponent(Sprite)!;
        this.label = this.node.getChildByName('Label')!.getComponent(Label)!;
    }

    /** 设置数值：自动更新数字、染色、字号 */
    setValue(value: number) {
        this.ensureRefs();
        this._value = value;

        const color = tileColor(value);
        this.bg.color = color;
        if (this.glow) {
            const glowColor = color.clone();
            glowColor.a = 200; // 辉光略弱于本体，避免糊成一片
            this.glow.color = glowColor;
        }

        this.label.string = value.toString();
        this.label.fontSize = fontSizeFor(value);
        this.label.updateRenderData(true);
    }

    /** 新方块生成：从 0 弹到 1 */
    playSpawn() {
        this.node.setScale(0, 0, 1);
        tween(this.node)
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    /** 合并：轻微放大回弹，强调"变大了"（打击感主要交给星星粒子） */
    playMerge() {
        this.node.setScale(1, 1, 1);
        tween(this.node)
            .to(0.08, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'quadOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
    }
}
