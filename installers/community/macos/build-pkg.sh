#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/installers"
WORK_DIR="$ROOT_DIR/dist/pkgroot"
VERSION="${BESTRONG_INSTALLER_VERSION:-0.1.0}"
IDENTIFIER="com.bestronghq.community"
PKG_NAME="BeStrongHQ-Community-$VERSION.pkg"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/usr/local/bin"
mkdir -p "$WORK_DIR/Applications/BeStrong HQ"
mkdir -p "$OUT_DIR"

install -m 755 "$ROOT_DIR/installers/community/bin/bestrong" "$WORK_DIR/usr/local/bin/bestrong"

write_launcher() {
  local name="$1"
  local command="$2"
  local mode="${3:-default}"
  local bundle="$WORK_DIR/Applications/BeStrong HQ/$name.app"
  local executable="$bundle/Contents/MacOS/$name"
  local plist="$bundle/Contents/Info.plist"
  local identifier_slug
  identifier_slug="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-*$//;s/--*/-/g')"

  mkdir -p "$bundle/Contents/MacOS"
  if [[ "$mode" == "report" ]]; then
    cat > "$executable" <<'SH'
#!/usr/bin/env bash
set +e
report="${TMPDIR:-/tmp}/bestrong-troubleshoot.txt"
/usr/local/bin/bestrong doctor > "$report" 2>&1
/usr/bin/open -a TextEdit "$report" >/dev/null 2>&1 || /usr/bin/open "$report" >/dev/null 2>&1
exit 0
SH
  else
    cat > "$executable" <<SH
#!/usr/bin/env bash
set +e
output="\$(/usr/local/bin/bestrong $command 2>&1)"
status="\$?"
if [[ "\$status" -ne 0 ]]; then
  export BESTRONG_LAUNCHER_OUTPUT="\$output"
  /usr/bin/osascript <<'APPLESCRIPT'
set msg to system attribute "BESTRONG_LAUNCHER_OUTPUT"
display alert "BeStrong HQ could not start" message msg as critical buttons {"OK"} default button "OK"
APPLESCRIPT
fi
exit "\$status"
SH
  fi
  chmod +x "$executable"

  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$name</string>
  <key>CFBundleIdentifier</key>
  <string>com.bestronghq.community.$identifier_slug</string>
  <key>CFBundleName</key>
  <string>$name</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
PLIST
}

write_launcher "Open BeStrong" "open"
write_launcher "Start BeStrong" "start"
write_launcher "Stop BeStrong" "stop"
write_launcher "Update BeStrong" "update"
write_launcher "Troubleshoot BeStrong" "doctor" "report"

PKGBUILD_ARGS=(
  --root "$WORK_DIR"
  --identifier "$IDENTIFIER"
  --version "$VERSION"
  --install-location /
)

if [[ -n "${INSTALLER_SIGN_IDENTITY:-}" ]]; then
  PKGBUILD_ARGS+=(--sign "$INSTALLER_SIGN_IDENTITY")
fi

pkgbuild "${PKGBUILD_ARGS[@]}" "$OUT_DIR/$PKG_NAME"

printf '%s\n' "Built $OUT_DIR/$PKG_NAME"
printf '%s\n' "Submit the package for notarization before publishing it to coaches."
