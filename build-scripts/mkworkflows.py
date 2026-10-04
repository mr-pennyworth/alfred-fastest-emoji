# -*- coding: utf-8 -*-
"""Build fresh Alfred workflow archives. Run from any working directory."""

import argparse
import io
import json
import os
import plistlib
import shutil
import tempfile
import zipfile
from pathlib import Path

from make_alfred_json import make_alfred_json


SCRIPT_DIR = Path(__file__).resolve().parent
WF_DIR = SCRIPT_DIR.parent
BUILD_DIR = WF_DIR / 'wfbuild'
ICONSETS = ('apple', 'joypixels')

WF_FILES = [
  '3F8BD888-F727-48D6-95A1-67269524AEB2.png',
  'cook-new.png',
  'emoji-kitchen.js',
  'empty-kitchen.png',
  'icon.png',
  'imgs.sh',
  'info.plist',
  'README.md',
  'search.sh',
]


def available_languages():
  return sorted(path.parent.name for path in
                (WF_DIR / 'emojibase/packages/data').glob('*/data.raw.json'))


def plistRead(path):
  with open(path, 'rb') as f:
    return plistlib.load(f)


def plistWrite(obj, path):
  with open(path, 'wb') as f:
    plistlib.dump(obj, f)


def make_export_ready(plist_path, lang, iconset):
  wf = plistRead(plist_path)
  # Do not export values that Alfred marks as private.
  variables = wf.get('variables', {})
  for name in wf.get('variablesdontexport', []):
    variables.pop(name, None)
  wf['variablesdontexport'] = []
  wf['readme'] = (WF_DIR / 'README.md').read_text(encoding='utf-8')
  wf['bundleid'] = f'mr.pennyworth.{lang}.{iconset}.FastEmoji'
  plistWrite(wf, plist_path)
  return f'{wf["name"].replace(" ", ".")}-{lang}-{iconset}'


def load_icon_bundle(iconset):
  directory = WF_DIR / 'assets' / f'{iconset}_icons'
  files = sorted(directory.glob('*.png'))
  if not files:
    raise FileNotFoundError(f'No icons found: {directory}')
  buffer = io.BytesIO()
  names = set()
  with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as package:
    for file in files:
      # JoyPixels uses lowercase hex names. Workflow data uses uppercase hex.
      name = f'icons/{file.stem.upper()}.png'
      if name in names:
        raise ValueError(f'Duplicate icon filename: {name}')
      names.add(name)
      package.write(file, name)
  return buffer.getvalue(), names


def validate_icons(items, names):
  for item in items:
    paths = [item['icon']['path']]
    menu = item.get('mods', {}).get('cmd', {}).get('variables', {}).get('tone_choice_menu')
    if menu:
      paths.extend(choice['icon']['path'] for choice in json.loads(menu)['items'])
    for path in paths:
      if Path(path).as_posix() not in names:
        raise FileNotFoundError(f'Missing emoji icon: {path}')


def gen_workflow(lang, iconset, output_dir=BUILD_DIR, icon_bundle=None):
  if lang not in available_languages():
    raise ValueError(f'Unsupported language: {lang}')
  if iconset not in ICONSETS:
    raise ValueError(f'Unsupported icon set: {iconset}')
  output_dir = Path(output_dir).resolve()
  output_dir.mkdir(parents=True, exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='famos-', dir=output_dir) as temporary:
    stage = Path(temporary)
    for name in WF_FILES:
      shutil.copy2(WF_DIR / name, stage / name)
    make_alfred_json(
      datadir=str(WF_DIR / 'emojibase/packages/data' / lang),
      outfile_path=str(stage / 'alfreditems.json')
    )
    icon_bytes, icon_names = icon_bundle if icon_bundle is not None else load_icon_bundle(iconset)
    with open(stage / 'alfreditems.json', encoding='utf-8') as f:
      validate_icons(json.load(f)['items'], icon_names)
    name = make_export_ready(stage / 'info.plist', lang, iconset)
    archive = output_dir / f'{name}.alfredworkflow'
    # Start with a fresh icon bundle, never an old workflow archive. Reuse the
    # compressed icons across languages to avoid copying and compressing them again.
    staged_archive = stage / 'workflow.zip'
    staged_archive.write_bytes(icon_bytes)
    with zipfile.ZipFile(staged_archive, 'a', zipfile.ZIP_DEFLATED) as package:
      for name in WF_FILES + ['alfreditems.json']:
        package.write(stage / name, name)
    os.replace(staged_archive, archive)
  print(archive)
  return archive


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--lang', choices=available_languages(), action='append',
                      help='Language to build. Repeat this option for more languages. Default: all.')
  parser.add_argument('--iconset', choices=ICONSETS, action='append',
                      help='Icon set to build. Default: both.')
  parser.add_argument('--output-dir', type=Path, default=BUILD_DIR,
                      help='Archive directory. Default: wfbuild in the repository.')
  args = parser.parse_args()
  languages = args.lang or available_languages()
  if not languages:
    parser.error('No emoji data found. Run git submodule update --init --recursive.')
  bundles = {}
  for lang in languages:
    for iconset in args.iconset or ICONSETS:
      if iconset not in bundles:
        bundles[iconset] = load_icon_bundle(iconset)
      gen_workflow(lang, iconset, args.output_dir, bundles[iconset])


if __name__ == '__main__':
  main()
