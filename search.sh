#!/bin/bash

PORT=36363

function is_server_up() {
  pgrep emoji-kitchen.bin > /dev/null
}

function start_server() {
  chmod +x ./emoji-kitchen.bin > /dev/null 2> /dev/null
  xattr -d com.apple.quarantine ./emoji-kitchen.bin  > /dev/null 2> /dev/null
  mkdir -p "${alfred_workflow_data}" > /dev/null 2> /dev/null
  ./emoji-kitchen.bin > "${alfred_workflow_data}/kitchen.log" 2>&1 &
}

if ! is_server_up; then
  start_server
  sleep 1
fi

curl -s -G "http://localhost:$PORT/" \
   --data-urlencode "query=$emoji" \
   --data-urlencode "query2=${emoji2}" \
   > "${alfred_workflow_data}/kitchen_data/tmp.json"
