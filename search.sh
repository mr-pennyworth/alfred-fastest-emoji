#!/bin/bash

cd "$(dirname "$0")" || exit 1

if [[ -z "${alfred_workflow_data}" ]]; then
  alfred_workflow_data="${HOME}/Library/Application Support/Alfred"\
"/Workflow Data/${alfred_workflow_bundleid:-mr.pennyworth.fastEmoji}"
fi

kitchen_data="${alfred_workflow_data}/kitchen_data"
/bin/mkdir -p "${kitchen_data}" || exit 1

exec /usr/bin/osascript -l JavaScript ./emoji-kitchen.js \
  "${emoji:-}" "${emoji2:-}" "${kitchen_data}" \
  > "${alfred_workflow_data}/kitchen.log" 2>&1
