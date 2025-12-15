package com.tablefri.app;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean isKeyboardVisible = false;
    private View rootView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 注册自定义插件
        registerPlugin(LocalServerPlugin.class);
        super.onCreate(savedInstanceState);

        // 启用 WebView 调试（开发阶段可查看 console.log）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // 启用全面屏模式
        enableFullScreen();

        // 监听键盘状态，避免在键盘显示时重新设置全屏
        rootView = getWindow().getDecorView().getRootView();
        rootView.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                Rect r = new Rect();
                rootView.getWindowVisibleDisplayFrame(r);
                int screenHeight = rootView.getHeight();
                int keypadHeight = screenHeight - r.bottom;
                // 键盘高度超过屏幕 15% 认为键盘已显示
                isKeyboardVisible = keypadHeight > screenHeight * 0.15;
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 只有在获得焦点且键盘未显示时才重新设置全屏
        if (hasFocus && !isKeyboardVisible) {
            enableFullScreen();
        }
    }

    private void enableFullScreen() {
        Window window = getWindow();
        View decorView = window.getDecorView();

        // 允许内容延伸到系统栏区域
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // 获取 WindowInsetsController
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            // 隐藏状态栏和导航栏
            controller.hide(WindowInsetsCompat.Type.systemBars());
            // 设置沉浸式模式（滑动边缘可临时显示系统栏）
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }

        // Android P 及以上支持刘海屏
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
    }
}
