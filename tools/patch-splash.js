'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TOTAL_TIME = 2000;
const DISPLAY_RATIO = 0.8;

function readBackgroundColor(root) {
  let color = { x: 0.047058823529411764, y: 0.043137254901960784, z: 0.08627450980392157, w: 1 };
  try {
    const b = JSON.parse(fs.readFileSync(path.join(root, 'settings', 'v2', 'packages', 'builder.json'), 'utf8'));
    const c = b['splash-setting'] && b['splash-setting'].background && b['splash-setting'].background.color;
    if (c && typeof c.x === 'number') color = c;
  } catch (e) {}
  return color;
}

function findSettingsFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name !== 'assets' && e.name !== 'node_modules') stack.push(path.join(cur, e.name));
      } else if (/^settings(\.[0-9a-f]+)?\.json$/.test(e.name) && path.basename(cur) === 'src') {
        out.push(path.join(cur, e.name));
      }
    }
  }
  return out;
}

function patchSplash(opts = {}) {
  const root = opts.root || PROJECT_ROOT;
  const logoPath = path.join(root, 'settings', 'logo.png');
  if (!fs.existsSync(logoPath)) {
    console.error('logo not found:', logoPath);
    return 0;
  }
  const base64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  const background = readBackgroundColor(root);
  const files = findSettingsFiles(opts.destDir || path.join(root, 'build'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.splashScreen = Object.assign({}, data.splashScreen, {
      displayRatio: DISPLAY_RATIO,
      totalTime: TOTAL_TIME,
      logo: { type: 'custom', base64 },
      background: { type: 'color', color: background },
    });
    fs.writeFileSync(file, JSON.stringify(data));
    console.log('patched', path.relative(root, file));
  }
  return files.length;
}

module.exports = { patchSplash };

if (require.main === module) {
  patchSplash();
}
