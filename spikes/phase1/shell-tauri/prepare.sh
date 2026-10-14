#!/bin/sh
# Assemble the frontend: the unchanged track A build and fixtures, the shared
# navigation and styles, and both track C graph candidates.
set -e
here=$(cd "$(dirname "$0")" && pwd)
core="$here/../recipe-core"
graph="$here/../graph"
(cd "$core" && npm run build --silent)
rm -rf "$here/ui/core" "$here/ui/fixtures" "$here/ui/shared"
cp -r "$core/dist" "$here/ui/core"
cp -r "$core/fixtures" "$here/ui/fixtures"
mkdir -p "$here/ui/shared"
cp "$graph/shared/nav.js" "$graph/shared/app.css" "$graph/shared/axe-run.js" "$here/ui/shared/"
# axe-core (MPL-2.0), for the platform probe page only (USABILITY §5).
cp "$graph/node_modules/axe-core/axe.min.js" "$here/ui/shared/axe.min.js"
(cd "$graph" && npm run build --silent)
