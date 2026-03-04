#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WF_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC="${WF_DIR}/emoji-kitchen/emoji-kitchen.swift"
ARM_OUT="${WF_DIR}/emoji-kitchen.arm64.bin"
X64_OUT="${WF_DIR}/emoji-kitchen.x86_64.bin"
OUT="${WF_DIR}/emoji-kitchen.bin"

swiftc \
  -O \
  -whole-module-optimization \
  -target arm64-apple-macos12 \
  "${SRC}" \
  -o "${ARM_OUT}"

swiftc \
  -O \
  -whole-module-optimization \
  -target x86_64-apple-macos12 \
  "${SRC}" \
  -o "${X64_OUT}"

lipo -create \
  "${ARM_OUT}" \
  "${X64_OUT}" \
  -output "${OUT}"

strip "${OUT}"
chmod +x "${OUT}"
rm -f "${ARM_OUT}" "${X64_OUT}"
