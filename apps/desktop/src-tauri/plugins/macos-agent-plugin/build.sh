#!/bin/bash
# macOS Agent 插件构建脚本
#
# 使用方法:
#   ./build.sh           - 构建 release 版本
#   ./build.sh debug     - 构建 debug 版本
#   ./build.sh package   - 构建并打包为 zip

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="macos-agent-plugin"
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

LIB_NAME="${LIB_PREFIX}macos_agent_plugin.${LIB_EXT}"

echo "=== 构建 macOS Agent 插件 ==="
echo "构建类型: ${BUILD_TYPE}"
echo "目标库: ${LIB_NAME}"

# 切换到 workspace 根目录（src-tauri）
cd "$SCRIPT_DIR/../../"

# 构建
if [ "$BUILD_TYPE" = "debug" ]; then
    cargo build -p macos-agent-plugin
    BUILT_LIB="target/debug/${LIB_NAME}"
elif [ "$BUILD_TYPE" = "package" ]; then
    # package 模式总是构建 release
    cargo build --release -p macos-agent-plugin
    BUILT_LIB="target/release/${LIB_NAME}"
else
    cargo build --release -p macos-agent-plugin
    BUILT_LIB="target/release/${LIB_NAME}"
fi

echo "构建完成: ${BUILT_LIB}"

# 打包
if [ "$BUILD_TYPE" = "package" ]; then
    echo "=== 打包插件 ==="

    DIST_DIR="$SCRIPT_DIR/dist/${PLUGIN_NAME}"
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR/ui"

    # 复制文件
    cp "$BUILT_LIB" "$DIST_DIR/"
    cp "$SCRIPT_DIR/manifest.json" "$DIST_DIR/"
    cp "$SCRIPT_DIR/README.md" "$DIST_DIR/"
    if [ -d "$SCRIPT_DIR/ui" ] && [ "$(ls -A "$SCRIPT_DIR/ui")" ]; then
        cp -r "$SCRIPT_DIR/ui"/* "$DIST_DIR/ui/"
    fi

    # 创建 zip
    cd "$SCRIPT_DIR/dist"
    rm -f "${PLUGIN_NAME}.zip"
    zip -r "${PLUGIN_NAME}.zip" "$PLUGIN_NAME"

    echo "插件包已创建: $SCRIPT_DIR/dist/${PLUGIN_NAME}.zip"
fi

echo "=== 完成 ==="


