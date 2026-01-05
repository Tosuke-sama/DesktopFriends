package com.desktopfriends.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int RECORD_AUDIO_PERMISSION_REQUEST_CODE = 1001;
    private PermissionRequest pendingPermissionRequest;
    private boolean isKeyboardVisible = false;
    private View rootView;

    // 文件选择器相关
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate() 之前注册 ActivityResultLauncher
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                Log.d(TAG, "File chooser result: " + result.getResultCode());
                if (filePathCallback != null) {
                    Uri[] results = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        String dataString = result.getData().getDataString();
                        if (dataString != null) {
                            results = new Uri[]{Uri.parse(dataString)};
                            Log.d(TAG, "Selected file: " + dataString);
                        }
                    }
                    filePathCallback.onReceiveValue(results);
                    filePathCallback = null;
                }
            }
        );

        // 注册自定义插件
        registerPlugin(LocalServerPlugin.class);
        super.onCreate(savedInstanceState);

        // 预先请求麦克风权限
        requestAudioPermission();

        // 启用 WebView 调试（开发阶段可查看 console.log）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // 配置 WebView 媒体设置
        WebView webView = getBridge().getWebView();
        WebSettings webSettings = webView.getSettings();
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);

        // 设置 WebChromeClient 处理麦克风权限和文件选择
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this,
                                Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            runOnUiThread(() -> request.grant(request.getResources()));
                        } else {
                            pendingPermissionRequest = request;
                            requestAudioPermission();
                        }
                        return;
                    }
                }
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            // 处理文件选择器
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
                Log.d(TAG, "onShowFileChooser called");

                // 取消之前的回调
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                try {
                    // 创建文件选择 Intent
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/zip");

                    Log.d(TAG, "Launching file chooser");
                    fileChooserLauncher.launch(Intent.createChooser(intent, "选择模型文件"));
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "Error launching file chooser", e);
                    filePathCallback = null;
                    return false;
                }
            }
        });

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
                isKeyboardVisible = keypadHeight > screenHeight * 0.15;
            }
        });
    }

    private void requestAudioPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.RECORD_AUDIO},
                        RECORD_AUDIO_PERMISSION_REQUEST_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RECORD_AUDIO_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingPermissionRequest != null) {
                    runOnUiThread(() -> {
                        pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                        pendingPermissionRequest = null;
                    });
                }
            } else {
                if (pendingPermissionRequest != null) {
                    runOnUiThread(() -> {
                        pendingPermissionRequest.deny();
                        pendingPermissionRequest = null;
                    });
                }
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !isKeyboardVisible) {
            enableFullScreen();
        }
    }

    private void enableFullScreen() {
        Window window = getWindow();
        View decorView = window.getDecorView();

        WindowCompat.setDecorFitsSystemWindows(window, false);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
    }
}
