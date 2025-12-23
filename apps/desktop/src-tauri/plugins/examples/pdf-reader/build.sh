#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$SCRIPT_DIR/../../../"   # apps/desktop/src-tauri
CRATE_NAME="pdf-reader-plugin"
LIB_BASE="pdf_reader_plugin"

case "$(uname -s)" in
  Darwin*) LIB_PREFIX="lib"; LIB_EXT="dylib" ;;
  Linux*)  LIB_PREFIX="lib"; LIB_EXT="so" ;;
  MINGW*|MSYS*|CYGWIN*) LIB_PREFIX=""; LIB_EXT="dll" ;;
  *) echo "Unsupported OS"; exit 1 ;;
esac
LIB_NAME="${LIB_PREFIX}${LIB_BASE}.${LIB_EXT}"

# 1) Build from workspace root for this crate
cd "$WORKSPACE_DIR"
cargo build --release -p "$CRATE_NAME"

# 2) Stage package contents without a top-level folder
STAGE_DIR="$SCRIPT_DIR/dist/pkg"
OUT_ZIP="$SCRIPT_DIR/dist/pdf-reader.zip"
rm -rf "$STAGE_DIR" "$OUT_ZIP"
mkdir -p "$STAGE_DIR/ui"

# Copy artifacts
cp "$WORKSPACE_DIR/target/release/$LIB_NAME" "$STAGE_DIR/"
cp "$SCRIPT_DIR/manifest.json" "$STAGE_DIR/"
[ -f "$SCRIPT_DIR/README.md" ] && cp "$SCRIPT_DIR/README.md" "$STAGE_DIR/" || true
if [ -d "$SCRIPT_DIR/ui" ] && [ "$(ls -A "$SCRIPT_DIR/ui" 2>/dev/null)" ]; then
  cp -R "$SCRIPT_DIR/ui/"* "$STAGE_DIR/ui/"
fi

# 3) Zip with files at zip root
cd "$STAGE_DIR"
mkdir -p "$SCRIPT_DIR/dist"
zip -r "$OUT_ZIP" . >/dev/null

echo "插件包: $OUT_ZIP"
