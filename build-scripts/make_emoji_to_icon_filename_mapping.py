# -*- coding: utf-8 -*-

import json
import os
import sys

from make_alfred_json import IGNORED, icon


SCRIPT_DIR = sys.path[0]
WF_DIR = os.path.abspath(f'{SCRIPT_DIR}/../')

def make_emoji_to_icon_filename_map(json_filepath):
  emoji_to_icon_filename_map = {}
  with open(json_filepath) as f:
    raw_json = json.load(f)
    for emoji_json in raw_json:
      if emoji_json['hexcode'] in IGNORED: continue
      with_skins = [emoji_json] + emoji_json.get('skins', [])
      for skin_json in with_skins:
        emoji = skin_json['emoji']
        filename = icon(skin_json['hexcode'])
        emoji_to_icon_filename_map[emoji] = filename
  return emoji_to_icon_filename_map


if __name__ == '__main__':
  datadir = f'{WF_DIR}/emojibase/packages/data/en'
  raw_json_path = f'{datadir}/data.raw.json'
  with open(f'{SCRIPT_DIR}/emoji-to-icon-filename.json', 'w') as f:
    json.dump(make_emoji_to_icon_filename_map(raw_json_path), f, indent=2)
