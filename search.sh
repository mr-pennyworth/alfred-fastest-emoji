#!/bin/bash

if [[ -z "${alfred_workflow_data}" ]]; then
  alfred_workflow_data="${HOME}/Library/Application Support/Alfred"\
"/Workflow Data/mr.pennyworth.fastEmoji"
fi

kitchen_data="${alfred_workflow_data}/kitchen_data"
mkdir -p "${kitchen_data}" > /dev/null 2> /dev/null

chmod +x "./emoji-kitchen.bin" > /dev/null 2> /dev/null
xattr -d com.apple.quarantine "./emoji-kitchen.bin" \
  > /dev/null 2> /dev/null

./emoji-kitchen.bin "${emoji}" "${emoji2}" "${kitchen_data}" \
  > "${alfred_workflow_data}/kitchen.log" 2>&1
