#!/bin/bash
# PDF 阅读器插件构建脚本
#
# 使用方法:
#   ./build.sh           - 构建 release 版本
#   ./build.sh debug     - 构建 debug 版本
#   ./build.sh package   - 构建并打包为 zip

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="pdf-reader"
BUILD_TYPE="${1:-release}"

# 检测操作系统
case "$(uname -s)" in
    Darwin*)
        LIB_EXT="dylib"
        LIB_PREFIX="lib"
        TARGET_TRIPLE=""
        ;;
    Linux*)
        LIB_EXT="so"
        LIB_PREFIX="lib"
        TARGET_TRIPLE=""
        ;;
    MINGW*|CYGWIN*|MSYS*)
        LIB_EXT="dll"
        LIB_PREFIX=""
        TARGET_TRIPLE=""
        ;;
    *)
        echo "未知操作系统"
        exit 1
        ;;
esac

LIB_NAME="${LIB_PREFIX}pdf_reader_plugin.${LIB_EXT}"

echo "=== 构建 PDF 阅读器插件 ==="
echo "构建类型: ${BUILD_TYPE}"
echo "目标库: ${LIB_NAME}"

cd "$SCRIPT_DIR"

# 构建
if [ "$BUILD_TYPE" = "debug" ]; then
    cargo build
    BUILT_LIB="target/debug/${LIB_NAME}"
else
    cargo build --release
    BUILT_LIB="target/release/${LIB_NAME}"
fi

echo "构建完成: ${BUILT_LIB}"

# 打包
if [ "$BUILD_TYPE" = "package" ] || [ "$2" = "package" ]; then
    echo "=== 打包插件 ==="

    DIST_DIR="dist/${PLUGIN_NAME}"
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR/ui"

    # 复制文件
    cp "target/release/${LIB_NAME}" "$DIST_DIR/"
    cp manifest.json "$DIST_DIR/"
    cp -r ui/* "$DIST_DIR/ui/"

    # 创建 zip
    cd dist
    rm -f "${PLUGIN_NAME}.zip"
    zip -r "${PLUGIN_NAME}.zip" "$PLUGIN_NAME"

    echo "插件包已创建: dist/${PLUGIN_NAME}.zip"
fi

echo "=== 完成 ==="
