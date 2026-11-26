package `in`.class10lms.ssc

import android.content.pm.ActivityInfo
import android.net.http.SslError
import android.os.Bundle
import android.os.Message
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebChromeClient
import com.getcapacitor.BridgeWebViewClient

class MainActivity : BridgeActivity() {

    companion object {
        private const val TAG = "Class10LMSWebView"
    }

    private var customFullscreenView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private lateinit var screenProtectionManager: ScreenCaptureProtectionManager

    private fun enforceSecureWindow() {
        window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Enforce FLAG_SECURE immediately to prevent screenshots and Recent Apps previews
        enforceSecureWindow()
        // Register native security, Play Integrity, Own Media3 ExoPlayer & Offline Download plugins before bridge init
        registerPlugin(Class10SecurityPlugin::class.java)
        registerPlugin(Class10MediaPlayerPlugin::class.java)
        registerPlugin(Class10OfflineDownloadPlugin::class.java)
        super.onCreate(savedInstanceState)
        enforceSecureWindow()

        screenProtectionManager = ScreenCaptureProtectionManager(
            activity = this,
            screenSharingGuardEnabled = true,
            onTransition = { transition ->
                if (transition.shouldPausePlayer) {
                    Log.w(TAG, "Screen capture/sharing detected on MainActivity (${transition.state.threatType})")
                }
            }
        )
        screenProtectionManager.register()

        // Disable WebView remote inspection in production release builds
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Intercept Android Back button cleanly if native HTML5 video fullscreen is active
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customFullscreenView != null) {
                    exitCustomFullscreen()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })

        val currentBridge = bridge ?: return
        val webView = currentBridge.webView ?: return
        val lmsHost = currentBridge.host ?: "app.class10lms.in"

        // Preserve required WebView settings for React LMS + YouTube IFrame Player API
        webView.settings.apply {
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            domStorageEnabled = true
            // Route target="_blank" and window.open() popups to onCreateWindow() so they can be blocked
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = false
        }

        // Extend Capacitor's BridgeWebViewClient to preserve local asset loading while blocking
        // external YouTube watch pages, youtu.be, external browsers, and external app intents.
        currentBridge.setWebViewClient(object : BridgeWebViewClient(currentBridge) {

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val urlStr = request.url?.toString()
                val decision = LmsNavigationPolicy.evaluateNavigation(
                    rawUrl = urlStr,
                    isForMainFrame = request.isForMainFrame,
                    lmsHost = lmsHost
                )

                if (!decision.allow) {
                    Log.i(
                        TAG,
                        "Blocked external navigation [${decision.reason}] mainFrame=${request.isForMainFrame} host=${request.url?.host}"
                    )
                    // Returning true cancels navigation without calling bridge.launchIntent() or external apps
                    return true
                }

                // Allow Capacitor plugins/router to inspect internal LMS URLs; load allowed embed subframes directly
                return if (decision.isInternalLms) {
                    super.shouldOverrideUrlLoading(view, request)
                } else {
                    false
                }
            }

            @Deprecated("Deprecated in Android API 24+")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                val decision = LmsNavigationPolicy.evaluateNavigation(
                    rawUrl = url,
                    isForMainFrame = true,
                    lmsHost = lmsHost
                )
                if (!decision.allow) {
                    Log.i(TAG, "Blocked legacy navigation [${decision.reason}]")
                    return true
                }
                return if (decision.isInternalLms) {
                    @Suppress("DEPRECATION")
                    super.shouldOverrideUrlLoading(view, url)
                } else {
                    false
                }
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                // Never bypass SSL certificate validation
                Log.w(TAG, "Cancelled WebView load due to SSL error: primaryError=${error?.primaryError}")
                handler?.cancel()
            }
        })

        // Extend existing BridgeWebChromeClient: preserve HTML5 fullscreen AND block unwanted popups
        webView.webChromeClient = object : BridgeWebChromeClient(currentBridge) {

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                // Prevents target="_blank" (e.g., YouTube bottom-right branding link) and window.open()
                // from opening external browsers, YouTube app, or stray WebView popups.
                val hitExtra = view?.hitTestResult?.extra
                Log.i(
                    TAG,
                    "Blocked WebView popup/new-window request (isDialog=$isDialog, userGesture=$isUserGesture, hasTarget=${hitExtra != null})"
                )
                return false
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customFullscreenView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customFullscreenView = view
                customViewCallback = callback

                val decor = window.decorView as FrameLayout
                decor.addView(
                    view,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                toggleSystemBars(hide = true)
                enforceSecureWindow()
            }

            override fun onHideCustomView() {
                exitCustomFullscreen()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        enforceSecureWindow()
        if (::screenProtectionManager.isInitialized) {
            screenProtectionManager.register()
        }
    }

    override fun onResume() {
        super.onResume()
        enforceSecureWindow()
    }

    override fun onStop() {
        if (::screenProtectionManager.isInitialized) {
            // Prevents duplicate listeners when LmsMedia3PlayerActivity is in the foreground
            screenProtectionManager.unregister()
        }
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enforceSecureWindow()
        }
    }

    override fun onDestroy() {
        if (::screenProtectionManager.isInitialized) {
            screenProtectionManager.unregister()
        }
        super.onDestroy()
    }

    private fun exitCustomFullscreen() {
        val decor = window.decorView as FrameLayout
        customFullscreenView?.let { decor.removeView(it) }
        customFullscreenView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        toggleSystemBars(hide = false)
    }

    private fun toggleSystemBars(hide: Boolean) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (hide) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }
}
