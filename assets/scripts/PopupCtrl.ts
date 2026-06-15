import { _decorator, Button, Component, Node, NodeEventType, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { sfx } from './AudioManager';
const { ccclass } = _decorator;

export type PopupKind = 'gameover' | 'save' | 'restart';

/**
 * 弹窗控制。运行时 addComponent 到 Popup.prefab 实例上。
 * 三种消息变体按 kind 切换可见性；Confirm / Close 走回调。
 */
@ccclass('PopupCtrl')
export class PopupCtrl extends Component {
    private dialog: Node = null!;
    private messages: Record<PopupKind, Node> = null!;
    private onConfirm: (() => void) | null = null;
    private onClose: (() => void) | null = null;
    private inited = false;
    private closing = false;

    get visible() { return this.node.active; }

    private init() {
        if (this.inited) return;
        this.inited = true;

        this.dialog = this.node.getChildByName('Dialog')!;
        const msg = this.dialog.getChildByName('Message')!;
        this.messages = {
            gameover: msg.getChildByName('GameOverMessage')!,
            save: msg.getChildByName('SaveMessage')!,
            restart: msg.getChildByName('RestartMessage')!,
        };

        // Mask 吞掉触摸，挡住弹窗后面的按钮
        const mask = this.node.getChildByName('Mask')!;
        mask.on(NodeEventType.TOUCH_START, (e: any) => { e.propagationStopped = true; }, this);

        this.bindButton(this.dialog.getChildByName('CloseButton')!, () => this.dismiss(this.onClose));
        this.bindButton(this.dialog.getChildByName('ConfirmButton')!, () => this.dismiss(this.onConfirm));
    }

    private bindButton(node: Node, handler: () => void) {
        const btn = node.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.92;
        btn.target = node;
        node.on(Button.EventType.CLICK, () => { sfx('click'); handler(); }, this);
    }

    show(kind: PopupKind, onConfirm?: () => void, onClose?: () => void) {
        this.init();
        this.closing = false;

        // 预制体里 Mask 是固定 750×1334，高屏（Fit Width 可视高度更大）下盖不满，弹出时拉伸到画布实际大小
        const canvasUt = this.node.parent?.getComponent(UITransform);
        if (canvasUt) {
            this.node.getComponent(UITransform)?.setContentSize(canvasUt.contentSize);
            this.node.getChildByName('Mask')?.getComponent(UITransform)?.setContentSize(canvasUt.contentSize);
        }
        this.onConfirm = onConfirm ?? null;
        this.onClose = onClose ?? null;

        (Object.keys(this.messages) as PopupKind[])
            .forEach(k => { this.messages[k].active = k === kind; });

        this.node.active = true;
        // 结束 / 保存各有专属提示音；重开弹窗不单独发声（按钮的 click 已是反馈）
        if (kind === 'gameover') sfx('game_over');
        else if (kind === 'save') sfx('save_ok');
        const op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.15, { opacity: 255 }).start();
        this.dialog.setScale(0.8, 0.8, 1);
        tween(this.dialog).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    private dismiss(cb: (() => void) | null) {
        if (this.closing) return;
        this.closing = true;
        const op = this.node.getComponent(UIOpacity)!;
        tween(op)
            .to(0.12, { opacity: 0 })
            .call(() => {
                this.node.active = false;
                this.closing = false;
                cb?.();
            })
            .start();
    }
}
