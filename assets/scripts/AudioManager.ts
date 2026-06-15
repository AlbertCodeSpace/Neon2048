import { _decorator, AudioClip, AudioSource, Component, Node, resources, sys } from 'cc';
const { ccclass } = _decorator;

/** 所有音效名 —— 与 resources/audio/sfx 下的文件名一一对应 */
const SFX_NAMES = [
    'swipe', 'merge', 'merge_big', 'invalid',
    'click', 'undo', 'save_ok', 'game_over', 'win',
] as const;
export type SfxName = typeof SFX_NAMES[number];

/** 单音效音量（0~1），平衡不同素材的响度；未列出按 1 处理 */
const SFX_VOLUME: Partial<Record<SfxName, number>> = {
    swipe: 1.0, merge: 0.7, merge_big: 0.85, invalid: 0.5,
    click: 0.4, undo: 0.6, save_ok: 0.7, game_over: 0.8, win: 0.10,
};

const BGM_VOLUME = 0.25;
const MUTE_KEY = 'neon2048_muted';

/**
 * 全局音频单例。挂在场景里一个空节点上即可，运行时自建两个独立的 AudioSource
 * （bgm 循环 / sfx playOneShot），从 resources 动态加载全部 clip，无需编辑器拖引用。
 * 业务侧统一用 `sfx('xxx')` 这个便捷函数触发，节点缺失时自动静默。
 */
@ccclass('AudioManager')
export class AudioManager extends Component {
    static inst: AudioManager | null = null;

    private bgmSource: AudioSource = null!;
    private sfxSource: AudioSource = null!;
    private clips: Partial<Record<SfxName, AudioClip>> = {};
    private bgmClip: AudioClip | null = null;
    private bgmReady = false;
    private _muted = false;

    onLoad() {
        AudioManager.inst = this;
        this._muted = sys.localStorage.getItem(MUTE_KEY) === '1';

        // bgm 与 sfx 各用一个 AudioSource，互不干扰、音量独立
        const bgmNode = new Node('Bgm');
        bgmNode.parent = this.node;
        this.bgmSource = bgmNode.addComponent(AudioSource);
        this.bgmSource.loop = true;
        this.bgmSource.playOnAwake = false;

        const sfxNode = new Node('Sfx');
        sfxNode.parent = this.node;
        this.sfxSource = sfxNode.addComponent(AudioSource);
        this.sfxSource.playOnAwake = false;

        this.loadAll();
    }

    onDestroy() {
        if (AudioManager.inst === this) AudioManager.inst = null;
    }

    private loadAll() {
        for (const name of SFX_NAMES) {
            resources.load(`audio/sfx/${name}`, AudioClip, (err, clip) => {
                if (err || !clip) { console.error(`[AudioManager] 音效加载失败: ${name}`, err); return; }
                this.clips[name] = clip;
            });
        }
        resources.load('audio/bgm/bgm_main', AudioClip, (err, clip) => {
            if (err || !clip) { console.error('[AudioManager] BGM 加载失败', err); return; }
            this.bgmClip = clip;
            this.bgmReady = true;
            this.playBgm();
        });
    }

    /** 播放一次性音效；clip 尚未加载完成时静默跳过 */
    sfx(name: SfxName) {
        if (this._muted) return;
        const clip = this.clips[name];
        if (!clip) return;
        this.sfxSource.playOneShot(clip, SFX_VOLUME[name] ?? 1);
    }

    private playBgm() {
        if (!this.bgmReady || !this.bgmSource) return;
        this.bgmSource.clip = this.bgmClip;
        this.bgmSource.loop = true;
        // 用音量做静音，避免触碰 stop()/playing 这些在 Web 自动播放被拦时
        // 内部 player 为 null 会抛错的状态调用；静音时静默播放即可
        this.bgmSource.volume = this._muted ? 0 : BGM_VOLUME;
        this.bgmSource.play();
    }

    // ---------- 静音开关（API 就绪，后续接 UI 按钮即可）----------

    get muted() { return this._muted; }

    setMuted(m: boolean) {
        this._muted = m;
        sys.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
        // bgm 持续播放，仅靠音量切换静音；sfx 由 _muted 标志在 sfx() 里拦截
        if (this.bgmSource) this.bgmSource.volume = m ? 0 : BGM_VOLUME;
    }

    toggleMute() { this.setMuted(!this._muted); }
}

/** 便捷触发：节点未就绪/未挂载时自动静默，调用方无需判空 */
export function sfx(name: SfxName) {
    AudioManager.inst?.sfx(name);
}
