#!/usr/bin/env bash

npm install pkg -g

cd emoji-kitchen
npm install
cd ..

pkg --targets node14-macos-x64 ./emoji-kitchen --output emoji-kitchen.bin
