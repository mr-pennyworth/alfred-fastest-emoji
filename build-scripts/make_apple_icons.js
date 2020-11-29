'use strict';

// https://stackoverflow.com/a/43808972/7979

const fontkit = require('fontkit');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const WF_DIR = path.resolve(SCRIPT_DIR, '..');
const ICONS_DIR = `${WF_DIR}/assets/apple_icons`;

const fontPath = '/System/Library/Fonts/Apple Color Emoji.ttc';
const font = fontkit.openSync(fontPath).fonts[0];
const e2i_map = JSON.parse(
  fs.readFileSync(`${SCRIPT_DIR}/emoji-to-icon-filename.json`)
);

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR);
}

for (let emoji in e2i_map) {
  let icon_filepath = `${ICONS_DIR}/${e2i_map[emoji]}`;
  let img = font.layout(emoji).glyphs[0].getImageForSize(64);
  var imgdata;
  if (img === null) {
    console.log(`${emoji} not supported by apple.`);
  } else {
    imgdata = img.data;
    fs.writeFileSync(icon_filepath, imgdata);
  }
}
