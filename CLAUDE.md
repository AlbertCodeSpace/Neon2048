# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Neon2048** is a neon-styled **2048** game built with **Cocos Creator 3.8.8** (a TypeScript-based 2D/3D game engine). There is no `npm`/build script in `package.json` — the project is opened, edited, run, and built from the **Cocos Creator editor** (the editor reads `package.json` → `creator.version` to pick the matching engine). Target resolution is **750×1334** (portrait mobile), set in `settings/v2/packages/project.json`.

Gameplay is fully implemented under `assets/scripts/`. The game ships to two web build outputs under `build/` (`web-mobile`, `neon2048`).

## Commands

There is no test/lint/build CLI — build and run from the editor (Project → Build, or Preview). The only standalone script:

- `node tools/patch-splash.js` — re-apply the custom splash screen to build outputs (see **Splash screen** below).

## Script architecture (`assets/scripts/`)

The dominant convention: **scripts resolve scene nodes by name (`getChildByName`) and `addComponent` themselves at runtime**, rather than relying on editor-wired references. So the existing `Game.scene` / prefab layouts are not modified, and editor wiring is minimal — only a handful of `@property` slots for assets that can't be looked up (prefabs, sprite frames). When adding a feature, follow this pattern instead of adding properties and dragging references in the editor.

- **`GameLogic.ts`** — pure 2048 rules, **zero engine dependencies** (no `cc` import). Owns the `grid`/`score`, and `move(dir)` returns a `MoveResult` describing every tile's trajectory (`TileMove`), merges, score gained, and the new spawn. `GameState` is the serializable snapshot used for both save and undo. Keep this file engine-free so the logic stays unit-testable and the view layer stays separate.
- **`GameManager.ts`** — the controller, attached to `Canvas`. Resolves all scene nodes (BoardBox, Score, Best, buttons) by name, instantiates `Block.prefab` per occupied cell, drives `GameLogic`, animates moves with `tween`, handles keyboard + swipe input, persistence, and undo (cap `UNDO_LIMIT`). Holds the only meaningful editor properties: `blockPrefab`, `popupPrefab`, `starFrame`.
- **`GameConfig.ts`** — shared constants and the neon color palette. Tile colors/font sizes are derived from value here (`tileColor`, `fontSizeFor`, `randomNeon`); `GRID`, `MOVE_TIME`, `UNDO_LIMIT`, `SWIPE_THRESHOLD`, and the `localStorage` keys (`BEST_KEY`, `SAVE_KEY`) live here too.
- **`Block.ts`** — tile view; `addComponent`-ed onto a `Block.prefab` instance, resolves `BlankGlow`/`Block`/`Label` children by name. `setValue` recolors background + glow and picks the font size.
- **`PopupCtrl.ts`** — modal controller `addComponent`-ed onto `Popup.prefab`; toggles the three message variants (`gameover`/`save`/`restart`) and wires Confirm/Close to callbacks.
- **`AudioManager.ts`** — global singleton (`AudioManager.inst`) on an empty node. Creates two `AudioSource`s (looping BGM + one-shot SFX), loads all clips from `resources/audio` at runtime, persists mute state (`MUTE_KEY`). Business code triggers sound via the exported **`sfx('name')`** helper, which is a no-op if the manager is absent.
- **`MuteButton.ts`** — toggles `AudioManager` mute and swaps its speaker icon (`iconOn`/`iconOff`).
- **`StarBurst.ts`** — `burstStars(...)`, code-driven particle burst (used for merges / the 2048 win celebration), no prefab.

## Splash screen (project-specific gotcha)

Cocos's **custom splash screen depends on an online authorization check** and intermittently reverts the logo to the default Cocos logo at build time (build console warns "自定义插屏启用失败，将使用默认插屏进行构建" — this warning is expected and harmless here). The workaround forces the custom splash into the build output, which for web builds lives in `build/<target>/src/settings(.<hash>).json` under `splashScreen` (logo inlined as base64), **not** a top-level `setting.json`.

- **`extensions/splash-fix/`** — a build plugin whose `onAfterBuild` hook rewrites `splashScreen` in every build output after each editor build (verified working). Source logo is `settings/logo.png`; background color comes from `builder.json`'s `splash-setting`. Editing the hook requires restarting the editor so the build worker reloads it.
- **`tools/patch-splash.js`** — the same patch as a standalone CLI fallback. Run after a build if you don't use the plugin.

Do not re-add a `splashScreen` block to `settings/v2/packages/project.json` — the real config lives in `builder.json`'s `splash-setting`; a hand-written block there conflicts with it.

## Cocos Creator specifics

- Scene/prefab files (`.scene`, `.prefab`) are **JSON arrays of serialized objects** that cross-reference each other by integer index (`{"__id__": N}`) and reference assets by UUID (`{"__uuid__": "..."}`). **Prefer editing these through the editor** — manual JSON edits corrupt back-references easily. `Game.scene` hierarchy: `Canvas` > `Title`, `ScoreBox`/`Score`, `BestScoreBox`/`Best`, `BoardBox` (4×4 cells named `00`–`33`, row-major), plus `RestButton`/`SaveButton`/`UndoButton`.
- Every asset has a sibling `.meta` holding a stable **UUID**; never hand-edit or delete a `.meta` without its asset (or vice versa).
- New scripts use the decorator API (`@ccclass`, `@property`, lifecycle `onLoad`/`start`/`update`). `.creator/asset-template/typescript/` is the editor's new-script template source.
- `tsconfig.json` extends the editor-generated `./temp/tsconfig.cocos.json` and sets `strict: false`. Only edit `compilerOptions` in the top-level file; the `extends` base is editor-managed.
- UI uses `cc.Widget` for anchoring/alignment (expected for a single fixed-resolution mobile layout).

## Generated / ignored directories

`library/`, `temp/`, `local/`, `build/`, `profiles/`, `native/`, and `node_modules/` are editor-generated caches/outputs and git-ignored — treat as disposable. `extensions/cocos-mcp-server/` is a third-party editor extension (also git-ignored, has its own repo); `extensions/splash-fix/` is project code and is tracked.
