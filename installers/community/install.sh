#!/usr/bin/env bash
set -euo pipefail

CLI_URL="${BESTRONG_CLI_URL:-https://github.com/TennisShoeNinja/BeStrongHQ/releases/latest/download/bestrong-posix}"
BIN_DIR="${BESTRONG_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/bestrong"

mkdir -p "$BIN_DIR"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$CLI_URL" -o "$TARGET"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TARGET" "$CLI_URL"
else
  printf '%s\n' "Error: install needs curl or wget." >&2
  exit 1
fi

chmod +x "$TARGET"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '%s\n' "Add $BIN_DIR to PATH if your shell cannot find 'bestrong'."
    ;;
esac

"$TARGET" setup

printf '\n%s\n' "BeStrong HQ CLI installed at $TARGET"
printf '%s\n' "Run 'bestrong doctor' to check Docker."
printf '%s\n' "Run 'bestrong open' to start BeStrong."
