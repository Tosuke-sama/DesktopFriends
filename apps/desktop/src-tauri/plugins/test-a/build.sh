#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ID="test-a"
CRATE_NAME="test-a-plugin"
LIB_BASE="test_a_plugin"

case "$(uname -s)" in
  Darwin*) LIB_PREFIX="lib"; LIB_EXT="dylib" ;;
  Linux*)  LIB_PREFIX="lib"; LIB_EXT="so" ;;
  MINGW*|MSYS*|CYGWIN*) LIB_PREFIX=""; LIB_EXT="dll" ;;
  *) echo "Unsupported OS"; exit 1 ;;
esac
LIB_NAME="${LIB_PREFIX}${LIB_BASE}.${LIB_EXT}"

WORKSPACE_DIR="$SCRIPT_DIR/../../"
WORKSPACE_TOML="$WORKSPACE_DIR/Cargo.toml"
IS_MEMBER=0
if [ -f "$WORKSPACE_TOML" ] && grep -q '^\[workspace\]' "$WORKSPACE_TOML" 2>/dev/null; then
  if grep -q "plugins/$PLUGIN_ID" "$WORKSPACE_TOML" 2>/dev/null; then IS_MEMBER=1; fi
fi

if [ $IS_MEMBER -eq 1 ]; then
  echo "Building via workspace: $CRATE_NAME"
  (cd "$WORKSPACE_DIR" && cargo build --release -p "$CRATE_NAME")
  BUILT_LIB="$WORKSPACE_DIR/target/release/$LIB_NAME"
else
  echo "Building locally: $CRATE_NAME"
  (cd "$SCRIPT_DIR" && cargo build --release)
  BUILT_LIB="$SCRIPT_DIR/target/release/$LIB_NAME"
fi

[ -f "$BUILT_LIB" ] || { echo "Build artifact not found: $BUILT_LIB" >&2; exit 2; }

STAGE_DIR="$SCRIPT_DIR/dist/pkg"
OUT_ZIP="$SCRIPT_DIR/dist/$PLUGIN_ID.zip"
rm -rf "$STAGE_DIR" "$OUT_ZIP"
mkdir -p "$STAGE_DIR/ui"

cp "$BUILT_LIB" "$STAGE_DIR/"
cp "$SCRIPT_DIR/manifest.json" "$STAGE_DIR/"
[ -f "$SCRIPT_DIR/README.md" ] && cp "$SCRIPT_DIR/README.md" "$STAGE_DIR/" || true
if [ -d "$SCRIPT_DIR/ui" ] && [ "$(ls -A "$SCRIPT_DIR/ui" 2>/dev/null)" ]; then
  cp -R "$SCRIPT_DIR/ui/"* "$STAGE_DIR/ui/"
fi

(cd "$STAGE_DIR" && zip -r "$OUT_ZIP" . >/dev/null)

echo "Plugin package: $OUT_ZIP"
