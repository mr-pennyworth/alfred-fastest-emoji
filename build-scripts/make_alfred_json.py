# -*- coding: utf-8 -*-

import glob
import json
import os
import sys

from collections import defaultdict


SCRIPT_DIR = sys.path[0]
WF_DIR = os.path.abspath(f'{SCRIPT_DIR}/../')

IGNORED = {
  # These "regional indicator"s aren't really emojis.
  # They're not even listed in full-emoji-list.html.
  # No idea what they are doing in data.raw.json
  # Just imgore them.
  '1F1E6', '1F1E7', '1F1E8', '1F1E9', '1F1EA', '1F1EB', '1F1EC',
  '1F1ED', '1F1EE', '1F1EF', '1F1F0', '1F1F1', '1F1F2', '1F1F3',
  '1F1F4', '1F1F5', '1F1F6', '1F1F7', '1F1F8', '1F1F9', '1F1FA',
  '1F1FB', '1F1FC', '1F1FD', '1F1FE', '1F1FF'
}


_uid_to_shortcodes_map = None
def get_uid_to_shortcodes_map(datadir):
  global _uid_to_shortcodes_map
  if _uid_to_shortcodes_map is None:
    _uid_to_shortcodes_map = defaultdict(list)
    shortcode_filenames = glob.glob(f'{datadir}/shortcodes/*.json')
    for shortcode_filename in shortcode_filenames:
      with open(shortcode_filename) as f:
        for uid, shortcodes in json.load(f).items():
          # either string or list, just make list anyway
          if type(shortcodes) == str:
            shortcodes = [shortcodes]
          _uid_to_shortcodes_map[uid].extend([
            shortcode.replace('_', ' ').replace(':', '')
            for shortcode in shortcodes
          ])
          
  return _uid_to_shortcodes_map


def get_keywords(raw_json, datadir):
  uid_to_shorcodes = get_uid_to_shortcodes_map(datadir)
  return set(
    raw_json.get('tags', []) +
    [raw_json['annotation']] +
    uid_to_shorcodes[raw_json['hexcode']]
  )


def icon(uid):
  # joypixels icon names omit some codepoints
  omitted = ['200D', 'FE0F']
  return '-'.join([
    codepoint
    for codepoint
    in uid.split('-')
    if codepoint not in omitted
  ]) + '.png'


def make_tone_choice_menu(raw_json):
  items = []
  main_uid = raw_json['hexcode']
  for skin_tone_json in [raw_json] + raw_json['skins']:
    skin_tone_uid = skin_tone_json['hexcode']
    items.append({
      'uid': skin_tone_uid,
      'title': skin_tone_json['annotation'],
      'icon': {
        'path': f'./icons/{icon(skin_tone_uid)}'
      },
      'variables': {
        'uid': main_uid,
        'emoji': skin_tone_json['emoji'],
        'iconfile': f'./icons/{icon(skin_tone_uid)}'
      }
    })
  return {
    'items': items
  }


def make_alfred_item(raw_json, datadir):
  uid = raw_json['hexcode']
  title = raw_json['annotation']
  emoji = raw_json['emoji']

  keywords = get_keywords(raw_json, datadir)
  non_title_keywords = keywords - {title}

  subtitle = f'keywords: {", ".join(non_title_keywords)}'
  item = {
    'uid': uid,
    'title': title,
    'subtitle': subtitle,
    'match': ' '.join(keywords),
    'icon': {
      'path': f'./icons/{icon(uid)}'
    },
    'variables': {
      'emoji': emoji,
    }
  }

  skins = raw_json.get('skins', [])
  if not skins:
    return item

  all_emojis = [emoji] + [s['emoji'] for s in skins]
  emoji_row = ''.join(all_emojis)

  item['subtitle'] += f' [⌘: {emoji_row}]'
  item['mods'] = {}
  item['mods']['cmd'] = {
    'arg': '',
    'subtitle': f'↩: choose {emoji_row}',
    'variables': {
      'tone_choice_menu': json.dumps(make_tone_choice_menu(raw_json), indent=2)
    }
  }
  return item


def make_alfred_json(datadir, outfile_path):
  raw_json_path = f'{datadir}/data.raw.json'
  with open(raw_json_path, 'r') as f:
    raw_json = json.load(f)

  alfreditems = {'items': []}
  for raw_emoji in raw_json:
    if raw_emoji['hexcode'] in IGNORED: continue
    alfreditems['items'].append(make_alfred_item(raw_emoji, datadir))

  with open(outfile_path, 'w') as f:
    json.dump(alfreditems, f, indent=2)


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
  lang = 'en'
  if len(sys.argv) > 1:
    lang = sys.argv[1]
  datadir = f'{WF_DIR}/emojibase/packages/data/{lang}'
  make_alfred_json(
    datadir=datadir,
    outfile_path=f'{SCRIPT_DIR}/alfreditems.{lang}.json'
  )
  raw_json_path = f'{datadir}/data.raw.json'
  with open(f'{SCRIPT_DIR}/emoji-to-icon-filename.json', 'w') as f:
    json.dump(make_emoji_to_icon_filename_map(raw_json_path), f, indent=2)

