#!/usr/bin/env bash
set -euo pipefail

CLI_URL="${BESTRONG_CLI_URL:-https://github.com/TennisShoeNinja/BeStrongHQ/releases/latest/download/bestrong-posix}"
BIN_DIR="${BESTRONG_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/bestrong"

shell_profile() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"

  case "$shell_name" in
    zsh)
      printf '%s\n' "$HOME/.zshrc"
      ;;
    bash)
      if [[ "$(uname -s)" == "Darwin" ]]; then
        printf '%s\n' "$HOME/.bash_profile"
      else
        printf '%s\n' "$HOME/.bashrc"
      fi
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_profile_path() {
  local profile
  profile="$(shell_profile)" || return 0

  local marker="# BeStrong HQ Community Edition CLI"
  if [[ -f "$profile" ]] && grep -F "$marker" "$profile" >/dev/null 2>&1; then
    return 0
  fi

  mkdir -p "$(dirname "$profile")"
  {
    printf '\n%s\n' "$marker"
    printf 'export PATH="%s:$PATH"\n' "$BIN_DIR"
  } >> "$profile"

  printf '%s\n' "Updated $profile so new terminals find BeStrong first."
}

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

RESOLVED_BESTRONG="$(command -v bestrong 2>/dev/null || true)"
if [[ "$RESOLVED_BESTRONG" != "$TARGET" ]]; then
  ensure_profile_path
fi

"$TARGET" setup

printf '\n%s\n' "BeStrong HQ CLI installed at $TARGET"

if [[ "$RESOLVED_BESTRONG" == "$TARGET" ]]; then
  printf '%s\n' "Run 'bestrong doctor' to check Docker."
  printf '%s\n' "Run 'bestrong open' to start BeStrong."
else
  if [[ -n "$RESOLVED_BESTRONG" ]]; then
    printf '%s\n' "This terminal currently finds another 'bestrong' first:"
    printf '%s\n' "  $RESOLVED_BESTRONG"
  else
    printf '%s\n' "This terminal does not find 'bestrong' yet."
  fi
  printf '%s\n' "For this terminal, run:"
  printf '%s\n' "  $TARGET doctor"
  printf '%s\n' "  $TARGET open"
  printf '%s\n' "Open a new terminal before using plain 'bestrong'."
fi
