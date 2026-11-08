#!/usr/bin/env bash
# Phase 1 spike helper (throwaway, like everything under spikes/phase1/).
#
#   ./spike.sh start [page]   build if needed, then open the app (default page: recipe)
#                             pages: recipe, library, checks, graph-react, graph-svelte
#   ./spike.sh refresh        reinstall pinned dependencies and rebuild everything
#   ./spike.sh test           core tests, then automated runs of every page
#   ./spike.sh reset-data     delete the spike app's local data (SQLite library, exports)
#
# It never runs git: pull or commit yourself. Rust is expected in ~/.cargo/bin
# (rustup per-user install) or on PATH. Set SPIKE_DATA_DIR to an existing folder
# to keep a run's data out of the app's normal folders, on every OS.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
core="$here/recipe-core"
graph="$here/graph"
shell="$here/shell-tauri"
exe="$shell/src-tauri/target/debug/spike-shell"
# The webview's data and exports live under the data directory; the SQLite
# plugin keeps the library under the config directory.
data="${XDG_DATA_HOME:-$HOME/.local/share}/invalid.spike.phase1-shell"
config="${XDG_CONFIG_HOME:-$HOME/.config}/invalid.spike.phase1-shell"
PATH="$HOME/.cargo/bin:$PATH"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# macOS has no timeout command.
limited() {
  if command -v timeout >/dev/null; then timeout "$@"; else perl -e 'alarm shift; exec @ARGV' "$@"; fi
}

check_tools() {
  command -v node >/dev/null || die "node not found (Node 20+ needed)"
  command -v npm >/dev/null || die "npm not found"
  command -v cargo >/dev/null || die "cargo not found: install Rust with rustup (see spikes/phase1/README.md)"
  if [ "$(uname -s)" = Linux ]; then
    pkg-config --exists webkit2gtk-4.1 || die "WebKitGTK 4.1 development files not found (libwebkit2gtk-4.1-dev)"
  fi
}

install_deps() {
  say "Installing pinned dependencies"
  (cd "$core" && npm ci --no-audit --no-fund)
  (cd "$graph" && npm ci --no-audit --no-fund)
}

build() {
  say "Building the core, both graph candidates, and the shell"
  "$shell/prepare.sh"
  (cd "$shell/src-tauri" && cargo build)
}

page_path() {
  case "${1:-recipe}" in
    recipe) echo recipe.html ;;
    library) echo library.html ;;
    checks) echo index.html ;;
    graph-react) echo graph-react/index.html ;;
    graph-svelte) echo graph-svelte/index.html ;;
    *) die "unknown page '$1' (recipe, library, checks, graph-react, graph-svelte)" ;;
  esac
}

cmd_start() {
  check_tools
  local page
  page=$(page_path "${1:-recipe}")
  [ -d "$core/node_modules" ] && [ -d "$graph/node_modules" ] || install_deps
  build
  say "Opening $page"
  SPIKE_START="$page" exec "$exe"
}

cmd_refresh() {
  check_tools
  install_deps
  build
  say "Refreshed. Start with: $0 start"
}

cmd_test() {
  check_tools
  [ -d "$core/node_modules" ] && [ -d "$graph/node_modules" ] || install_deps
  say "Core tests (Node)"
  # Node 22 prints TAP ("# pass 14") when output isn't a terminal; Node 23+
  # prints the spec reporter ("ℹ pass 14"). Match both; npm's exit status still
  # decides pass or fail (pipefail).
  (cd "$core" && npm test --silent 2>&1 | grep -E '^(# |ℹ )(pass|fail) ')
  build
  local out fail=0
  out=$(mktemp -d)
  # Graph pages need a visible window (animation frames stop when hidden).
  for page in checks recipe library graph-react graph-svelte; do
    local hidden=1
    case "$page" in graph-*) hidden=0 ;; esac
    if SPIKE_HIDDEN=$hidden SPIKE_START="$(page_path "$page")" SPIKE_AUTO=1 SPIKE_EXIT=1 \
      SPIKE_REPORT="$out/$page.json" limited 120 "$exe" >"$out/$page.log" 2>&1 && [ -f "$out/$page.json" ]; then
      node -e '
        const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        // Report shapes: graph pages {steps, passed, total}; checks {results, passed, total};
        // recipe {ok, results}; library {integrity, revisions, verified, failures}.
        let ok, detail;
        if (typeof d.ok === "boolean") { ok = d.ok; detail = `${d.results.length} steps (edit, save, export, import)`; }
        else if (typeof d.passed === "number") { ok = d.passed === d.total; detail = `${d.passed}/${d.total}`; }
        else { ok = d.integrity === "ok" && d.failures.length === 0; detail = `${d.verified}/${d.revisions} revisions verified, integrity ${d.integrity}`; }
        console.log(`${ok ? "PASS" : "FAIL"}  ${process.argv[2]}  ${detail}`);
        process.exit(ok ? 0 : 1);' "$out/$page.json" "$page" || fail=1
    else
      echo "FAIL  $page  (no report; log: $out/$page.log)"
      fail=1
    fi
  done
  say "Reports and logs: $out"
  return $fail
}

cmd_reset_data() {
  local dir found=0
  for dir in "$data" "$config"; do
    if [ -d "$dir" ]; then
      rm -rf "$dir"
      say "Deleted $dir"
      found=1
    fi
  done
  [ "$found" = 1 ] || say "No spike data found"
}

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  refresh) cmd_refresh ;;
  test) cmd_test ;;
  reset-data) cmd_reset_data ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
