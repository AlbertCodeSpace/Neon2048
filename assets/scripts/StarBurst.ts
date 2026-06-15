import { Color, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, tween } from 'cc';

/**
 * 在 parent 节点 pos 处迸发一圈 star 粒子。
 * 纯代码驱动：每颗星星向随机方向飞散、旋转、缩小、淡出后自毁。
 */
export function burstStars(
    parent: Node,
    pos: Vec3,
    color: Color,
    frame: SpriteFrame,
    count = 12,
    radius = 150,
) {
    for (let i = 0; i < count; i++) {
        const star = new Node('Star');
        star.layer = parent.layer;

        const ut = star.addComponent(UITransform);
        const sp = star.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM; // 必须先设 CUSTOM 再赋帧，否则赋帧会把尺寸重置为贴图原始大小
        sp.spriteFrame = frame;
        sp.color = color;
        ut.setContentSize(60, 60);
        const op = star.addComponent(UIOpacity);

        parent.addChild(star);
        star.setPosition(pos);
        const scale = 0.7 + Math.random() * 0.6;
        star.setScale(scale, scale, 1);
        star.angle = Math.random() * 360;

        // 均匀分摊角度再加抖动，保证四面八方都有
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.8;
        const dist = radius * (0.45 + Math.random() * 0.55);
        const dest = new Vec3(pos.x + Math.cos(ang) * dist, pos.y + Math.sin(ang) * dist, 0);
        const dur = 0.45 + Math.random() * 0.3;
        const spin = star.angle + (Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 160);

        tween(star)
            .to(dur, { position: dest, scale: new Vec3(0.18, 0.18, 1), angle: spin }, { easing: 'quadOut' })
            .call(() => star.destroy())
            .start();
        tween(op)
            .delay(dur * 0.5)
            .to(dur * 0.5, { opacity: 0 })
            .start();
    }
}
