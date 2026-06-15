import { _decorator, Button, Component, Sprite, SpriteFrame } from 'cc';
import { AudioManager } from './AudioManager';
const { ccclass, property } = _decorator;

/**
 * 静音开关按钮。点击切换 AudioManager 的全局静音，并用喇叭图标反映状态：
 * iconOn = 有声（喇叭+声波），iconOff = 静音（喇叭+叉）。
 * 两个图标通过编辑器属性槽注入；自管 Button，无需其他接线。
 */
@ccclass('MuteButton')
export class MuteButton extends Component {
    @property(SpriteFrame) iconOn: SpriteFrame = null!;
    @property(SpriteFrame) iconOff: SpriteFrame = null!;

    private sprite: Sprite = null!;

    start() {
        this.sprite = this.getComponent(Sprite)!;

        let btn = this.getComponent(Button);
        if (!btn) {
            btn = this.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
            btn.zoomScale = 0.9;
        }
        btn.target = this.node;
        this.node.on(Button.EventType.CLICK, this.onClick, this);
        this.refresh();
    }

    private onClick() {
        AudioManager.inst?.toggleMute();
        this.refresh();
    }

    /** 同步图标：静音显示 off（喇叭+叉），否则 on（喇叭+声波） */
    private refresh() {
        const muted = AudioManager.inst?.muted ?? false;
        const frame = muted ? this.iconOff : this.iconOn;
        if (frame) this.sprite.spriteFrame = frame;
    }
}
