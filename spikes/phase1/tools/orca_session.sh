#!/bin/bash
# Scripted Orca run for CI (owner-approved 2026-10-13, isolated runner).
# NOT a substitute for a person listening with Orca: it records what Orca
# would say (its debug log) and the AT-SPI tree, in a virtual display with
# no audio. Run inside a private session bus and display:
#   xvfb-run -a dbus-run-session -- bash tools/orca_session.sh <exe> <outdir>
set -u
exe=$1
out=$2
mkdir -p "$out"
/usr/libexec/at-spi-bus-launcher --launch-immediately >"$out/atspi-bus.log" 2>&1 &
sleep 2
gsettings set org.gnome.desktop.interface toolkit-accessibility true 2>/dev/null || true
orca --replace --debug-file="$out/orca-debug.txt" >"$out/orca-stdout.txt" 2>&1 &
orca_pid=$!
sleep 8
SPIKE_START=graph-react/index.html "$exe" >"$out/app.log" 2>&1 &
app=$!
sleep 15
win=$(xdotool search --pid "$app" 2>/dev/null | tail -1)
[ -n "$win" ] && xdotool windowactivate --sync "$win" 2>/dev/null
# Keyboard only, as a screen-reader user would move: Tab through the page
# (navigation links, then the graph's stages), Enter on a stage, Tab on.
# The AT-SPI tree check runs after Orca has quit, so the two don't compete.
for k in Tab Tab Tab Tab Tab Tab Tab Tab Return Tab Tab Tab; do
  xdotool key "$k"
  sleep 2
done
sleep 6
# Quit Orca gracefully, then stop the app. (In the first two CI runs Orca's
# log stopped while it set up web key bindings right after the AT-SPI check
# moved focus; the check now runs after Orca quits.)
orca --quit >/dev/null 2>&1 || kill "$orca_pid" 2>/dev/null
for _ in 1 2 3 4 5; do kill -0 "$orca_pid" 2>/dev/null || break; sleep 1; done
python3 tools/atspi_check.py spike-shell 4 >"$out/atspi.json" 2>"$out/atspi.err" || true
kill "$app" 2>/dev/null
sleep 1
grep -a "SPEECH OUTPUT" "$out/orca-debug.txt" >"$out/speech.txt" 2>/dev/null || true
echo "orca debug lines: $(wc -l <"$out/orca-debug.txt" 2>/dev/null || echo 0); speech lines: $(wc -l <"$out/speech.txt")"
head -40 "$out/speech.txt"
