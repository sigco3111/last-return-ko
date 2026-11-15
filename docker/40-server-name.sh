#!/bin/sh
# Run by the nginx image's entrypoint, once, before nginx starts.
#
# LAST_RETURN_SERVER_NAME is what this server calls itself, for example "Official server". Set, it is written
# into the page, and the game puts it in front of "How you played" in the bug reports filed from it. The Helm
# chart sets it from `serverName`. Unset, the page is served as it was built.
#
# Nothing here stops nginx from starting: a name that cannot be written only means reports go without it.
set -u

name=${LAST_RETURN_SERVER_NAME:-}
[ -n "$name" ] || exit 0

page=/usr/share/nginx/html/index.html

# The name goes into an HTML attribute by way of sed, so it is held to characters that mean nothing to either.
case "$name" in
  *[!A-Za-z0-9\ ._-]*)
    echo "last-return: LAST_RETURN_SERVER_NAME may only hold letters, digits, spaces, dots, underscores and hyphens. Left out." >&2
    exit 0
    ;;
esac
if [ "${#name}" -gt 40 ]; then
  echo "last-return: LAST_RETURN_SERVER_NAME is longer than 40 characters. Left out." >&2
  exit 0
fi

if sed -i "s|<meta name=\"last-return-server\" content=\"[^\"]*\">|<meta name=\"last-return-server\" content=\"$name\">|" "$page" \
    && grep -q "<meta name=\"last-return-server\" content=\"$name\">" "$page"; then
  echo "last-return: this server calls itself \"$name\" in bug reports."
else
  echo "last-return: could not write the server name into $page (an older page, or the file cannot be written). Left out." >&2
fi
exit 0
