# -*- coding: utf-8 -*-

import glob
import os
import plistlib
import shutil
import subprocess
import sys

from contextlib import contextmanager


SCRIPT_DIR = sys.path[0]
WF_DIR = os.path.abspath(f'{SCRIPT_DIR}/../')
BUILD_DIR = f'{WF_DIR}/wfbuild'

WF_FILES = [
  'cook-new.png',
  'emoji-kitchen.bin',
  'empty-kitchen.png',
  'icon.png',
  'impbcopy',
  'info.plist',
  'README.md',
  'search.sh',
  'set_icon.sh',
]


def copy(filenames, dest_folder):
  if os.path.exists(dest_folder):
    shutil.rmtree(dest_folder)
  os.makedirs(dest_folder)

  for filename in filenames:
    if os.path.isdir(filename):
      shutil.copytree(filename, f'{dest_folder}/{filename}')
    else:
      shutil.copy(filename, f'{dest_folder}/{filename}')


def plistRead(path):
  with open(path, 'rb') as f:
    return plistlib.load(f)


def plistWrite(obj, path):
  with open(path, 'wb') as f:
    return plistlib.dump(obj, f)


@contextmanager
def cwd(dir):
  old_wd = os.path.abspath(os.curdir)
  os.chdir(dir)
  yield
  os.chdir(old_wd)

  
def make_export_ready(plist_path, lang, iconset):
  wf = plistRead(plist_path)

  # remove noexport vars
  wf['variablesdontexport'] = []

  # add readme
  with open('README.md') as f:
    wf['readme'] = f.read()

  # set language and iconset specific bundle id
  wf['bundleid'] = f'mr.pennyworth.{lang}.{iconset}.FastEmoji'

  plistWrite(wf, plist_path)
  return f'{wf["name"]}-{lang}-{iconset}'


def gen_workflow(lang, iconset):
  subprocess.call(['python3', f'{SCRIPT_DIR}/make_alfred_json.py', lang])
  copy(WF_FILES, BUILD_DIR)
  shutil.copy(
    f'{SCRIPT_DIR}/alfreditems.{lang}.json',
    f'{BUILD_DIR}/alfreditems.json'
  )
  shutil.copytree(
    f'{WF_DIR}/assets/{iconset}_icons',
    f'{BUILD_DIR}/icons'
  )
  wf_name = make_export_ready(f'{BUILD_DIR}/info.plist', lang, iconset)
  print(wf_name)
  with cwd(BUILD_DIR):
    subprocess.call(
      ['zip', '-q', '-r', f'../{wf_name}.alfredworkflow'] +
      ['icons', 'alfreditems.json'] + WF_FILES
    )


if __name__ == '__main__':
  langs = [
    langfilepath.split('/')[-2]
    for langfilepath
    in glob.glob(f'{WF_DIR}/emojibase/packages/data/*/data.raw.json')
  ]
  iconsets = ['apple', 'joypixels']
  for lang in langs:
    for iconset in iconsets:
      gen_workflow(lang, iconset)
