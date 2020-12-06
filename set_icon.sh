#!/bin/bash
#
# https://gist.github.com/nuada/260441da9ebc30cb98db9ecca88c07d9
#
# usage: set_icon.sh <some.icns or image_file> <folder or file path>
# Based on: http://www.amnoid.de/icns/makeicns.html

icon="$1"
target="$2"
if [[ -d "${target}" ]]; then
    target_icon="${target}"/$'Icon\r'
else
    target_icon="${target}"
fi
resource="/tmp/tmp$$.rsrc"

# Create resource fork
sips -i "${icon}"
DeRez -only icns "${icon}" > "${resource}"

# Remove resource from icon file
rm -f "${icon}/..namedfork/rsrc"
SetFile -a c "${icon}"

# Add resource to folder
Rez -append "${resource}" -o "${target_icon}"
SetFile -a C "${target}"
if [[ -d "${target}" ]]; then
    chflags hidden "${target_icon}"
fi

rm "${resource}"

