package `in`.class10lms.ssc

import android.content.SharedPreferences
import android.content.pm.ActivityInfo
import android.os.Build
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest

@CapacitorPlugin(name = "Class10Security")
class Class10SecurityPlugin : Plugin(), ScreenProtectionEventBus.Listener {

    private val encryptedPrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "class10_lms_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun load() {
        super.load()
        ScreenProtectionEventBus.addListener(this)
    }

    override fun handleOnDestroy() {
        ScreenProtectionEventBus.removeListener(this)
        super.handleOnDestroy()
    }

    override fun onProtectionTransition(transition: ProtectionTransition) {
        val payload = stateToJsObject(transition.state).apply {
            put("protectionAction", transition.protectionAction ?: "")
            put("timestamp", System.currentTimeMillis())
        }
        notifyListeners("screenProtectionChanged", payload, true)
        if (transition.shouldNotifyRecordingStarted) {
            notifyListeners("screenRecordingDetected", payload, true)
        }
        if (transition.shouldNotifyRecordingStopped) {
            notifyListeners("screenRecordingStopped", payload, true)
        }
    }

    private fun stateToJsObject(state: ScreenProtectionState): JSObject =
        JSObject().apply {
            put("isScreenRecording", state.isScreenRecording)
            put("isUnsafeDisplayActive", state.isUnsafeDisplayActive)
            put("unsafeDisplayName", state.unsafeDisplayName ?: "")
            put("isCaptureActive", state.isCaptureActive)
            put("isWarningVisible", state.isWarningVisible)
            put("canManualResume", state.canManualResume)
            put("flagSecureEnforced", state.flagSecureEnforced)
            put("detectionApiSupported", state.detectionApiSupported)
            put("androidApiLevel", state.androidApiLevel)
            put("threatType", state.threatType.name)
        }

    /**
     * Native protection floor: MainActivity & protected screens ALWAYS retain FLAG_SECURE so
     * JavaScript or remote configuration can never silently disable screenshot protection.
     */
    @PluginMethod
    fun setFlagSecure(call: PluginCall) {
        activity?.runOnUiThread {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            val result = JSObject()
            result.put("applied", true)
            result.put("enabled", true)
            result.put("enforcedByNativePolicy", true)
            call.resolve(result)
        } ?: call.reject("Activity unavailable")
    }

    @PluginMethod
    fun getProtectionStatus(call: PluginCall) {
        val state = ScreenProtectionEventBus.latestState
        val status = stateToJsObject(state).apply {
            put("platform", "android")
            put("sdkInt", Build.VERSION.SDK_INT)
        }
        call.resolve(status)
    }

    @PluginMethod
    fun setSecureItem(call: PluginCall) {
        val key = call.getString("key")
        val value = call.getString("value")
        if (key.isNullOrBlank() || value == null) {
            call.reject("Both key and value are required")
            return
        }
        try {
            encryptedPrefs.edit().putString(key, value).apply()
            call.resolve(JSObject().put("saved", true))
        } catch (ex: Exception) {
            call.reject("Secure storage write failed: ${ex.message}")
        }
    }

    @PluginMethod
    fun getSecureItem(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrBlank()) {
            call.reject("Key is required")
            return
        }
        try {
            val value = encryptedPrefs.getString(key, null)
            call.resolve(JSObject().put("value", value))
        } catch (ex: Exception) {
            call.reject("Secure storage read failed: ${ex.message}")
        }
    }

    @PluginMethod
    fun removeSecureItem(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrBlank()) {
            call.reject("Key is required")
            return
        }
        try {
            encryptedPrefs.edit().remove(key).apply()
            call.resolve(JSObject().put("removed", true))
        } catch (ex: Exception) {
            call.reject("Secure storage delete failed: ${ex.message}")
        }
    }

    @PluginMethod
    fun setFullscreenMode(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        activity?.runOnUiThread {
            val window = activity.window
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

            if (enabled) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
            call.resolve(JSObject().put("fullscreen", enabled))
        } ?: call.reject("Activity unavailable")
    }

    @PluginMethod
    fun requestIntegrityToken(call: PluginCall) {
        val nonce = call.getString("nonce")
        val cloudProjectStr = call.getString("cloudProjectNumber")
        if (nonce.isNullOrBlank()) {
            call.reject("Server-generated nonce is required")
            return
        }
        try {
            val integrityManager = IntegrityManagerFactory.create(context)
            val requestBuilder = IntegrityTokenRequest.builder().setNonce(nonce)
            val projectNum = cloudProjectStr?.toLongOrNull()
            if (projectNum != null && projectNum > 0L) {
                requestBuilder.setCloudProjectNumber(projectNum)
            }
            integrityManager.requestIntegrityToken(requestBuilder.build())
                .addOnSuccessListener { response ->
                    call.resolve(JSObject().put("token", response.token()))
                }
                .addOnFailureListener { error ->
                    call.reject("Play Integrity token unavailable: ${error.message}")
                }
        } catch (ex: Exception) {
            call.reject("Play Integrity request failed: ${ex.message}")
        }
    }
}
