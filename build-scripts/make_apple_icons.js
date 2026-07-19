'use strict';

// https://stackoverflow.com/a/43808972/7979

const { spawnSync } = require('child_process');
const fontkit = require('fontkit');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const WF_DIR = path.resolve(SCRIPT_DIR, '..');
const ICONS_DIR = `${WF_DIR}/assets/apple_icons`;
const ICON_SIZE = 64;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const fontPath = '/System/Library/Fonts/Apple Color Emoji.ttc';
const font = fontkit.openSync(fontPath).fonts[0];
const emojiToIcon = JSON.parse(
  fs.readFileSync(`${SCRIPT_DIR}/emoji-to-icon-filename.json`)
);

function isPng(data) {
  return Buffer.isBuffer(data) && data.subarray(0, 8).equals(PNG_SIGNATURE);
}

fs.mkdirSync(ICONS_DIR, { recursive: true });
const appKitJobs = [];

for (const [emoji, filename] of Object.entries(emojiToIcon)) {
  const glyphs = font.layout(emoji).glyphs;
  const image = glyphs.length === 1
    ? glyphs[0].getImageForSize(ICON_SIZE)
    : null;

  if (image && isPng(image.data)) {
    fs.writeFileSync(path.join(ICONS_DIR, filename), image.data);
  } else {
    appKitJobs.push({ emoji, filename });
  }
}

if (appKitJobs.length > 0) {
  const renderer = path.join(SCRIPT_DIR, 'render_apple_emoji_icons.swift');
  const result = spawnSync(
    'swift',
    [renderer, ICON_SIZE.toString(), ICONS_DIR],
    {
      input: JSON.stringify(appKitJobs),
      stdio: ['pipe', 'inherit', 'inherit']
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(
  `Generated ${Object.keys(emojiToIcon).length} icons ` +
  `(${appKitJobs.length} rendered with AppKit).`
);
