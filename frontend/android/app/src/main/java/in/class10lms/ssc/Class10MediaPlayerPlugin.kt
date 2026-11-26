package `in`.class10lms.ssc

import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor Bridge Plugin for the LMS's Own Branded Android Media3 ExoPlayer.
 * Launches LmsMedia3PlayerActivity with native FLAG_SECURE, Android 15+ screen recording
 * detection, DisplayManager screen-sharing protection, dynamic watermark & backend telemetry.
 */
@CapacitorPlugin(name = "Class10MediaPlayer")
class Class10MediaPlayerPlugin : Plugin() {

    @PluginMethod
    fun playVideo(call: PluginCall) {
        val url = call.getString("url").orEmpty().trim()
        if (url.isEmpty()) {
            call.reject("Video stream URL is required")
            return
        }

        val title = call.getString("title") ?: "Class 10 SSC Lesson"
        val description = call.getString("description") ?: ""
        val notesText = call.getString("notesText") ?: ""
        val watermarkText = call.getString("watermarkText") ?: "Class 10 SSC LMS"
        val startPositionMs = call.getLong("startPositionMs") ?: 0L
        val completed = call.getBoolean("completed") ?: false

        val lessonId = call.getString("lessonId") ?: ""
        val apiBaseUrl = call.getString("apiBaseUrl") ?: ""
        val accessToken = call.getString("accessToken") ?: ""
        val deviceId = call.getString("deviceId") ?: ""
        val warningHeading = call.getString("warningHeading") ?: LmsMedia3PlayerActivity.DEFAULT_WARNING_HEADING
        val warningMessage = call.getString("warningMessage") ?: LmsMedia3PlayerActivity.DEFAULT_WARNING_MESSAGE
        val watermarkEnabled = call.getBoolean("watermarkEnabled") ?: true
        val screenSharingProtection = call.getBoolean("screenSharingProtection") ?: true
        val securityEventLogging = call.getBoolean("securityEventLogging") ?: true

        val intent = Intent(activity, LmsMedia3PlayerActivity::class.java).apply {
            putExtra(LmsMedia3PlayerActivity.EXTRA_URL, url)
            putExtra(LmsMedia3PlayerActivity.EXTRA_TITLE, title)
            putExtra(LmsMedia3PlayerActivity.EXTRA_DESCRIPTION, description)
            putExtra(LmsMedia3PlayerActivity.EXTRA_NOTES, notesText)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WATERMARK, watermarkText)
            putExtra(LmsMedia3PlayerActivity.EXTRA_START_POSITION_MS, startPositionMs)
            putExtra(LmsMedia3PlayerActivity.EXTRA_COMPLETED, completed)
            putExtra(LmsMedia3PlayerActivity.EXTRA_LESSON_ID, lessonId)
            putExtra(LmsMedia3PlayerActivity.EXTRA_API_BASE_URL, apiBaseUrl)
            putExtra(LmsMedia3PlayerActivity.EXTRA_ACCESS_TOKEN, accessToken)
            putExtra(LmsMedia3PlayerActivity.EXTRA_DEVICE_ID, deviceId)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WARNING_HEADING, warningHeading)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WARNING_MESSAGE, warningMessage)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WATERMARK_ENABLED, watermarkEnabled)
            putExtra(LmsMedia3PlayerActivity.EXTRA_SCREEN_SHARING_PROTECTION, screenSharingProtection)
            putExtra(LmsMedia3PlayerActivity.EXTRA_SECURITY_EVENT_LOGGING, securityEventLogging)
        }

        startActivityForResult(call, intent, "handlePlayerResult")
    }

    /**
     * Launches LmsMedia3PlayerActivity in verified encrypted offline mode.
     * Plays strictly from app-private AES-256-CTR storage via EncryptedOfflineDataSource
     * with zero external player intents, zero public URLs, FLAG_SECURE, watermark & A15 guard.
     */
    @PluginMethod
    fun playOfflineVideo(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        if (studentId.isEmpty() || lessonId.isEmpty()) {
            call.reject("studentId and lessonId are required for offline playback")
            return
        }

        val vault = OfflineVideoVault(context.applicationContext)
        val verified = vault.verifyRecord(studentId, lessonId, deepVerifyChecksum = false)
        if (verified == null || verified.status != OfflineVideoVault.STATUS_DOWNLOADED) {
            call.reject("Offline lesson video is missing or not verified", "FILE_MISSING")
            return
        }

        val title = call.getString("title") ?: verified.title.ifBlank { "Class 10 SSC Lesson" }
        val description = call.getString("description") ?: ""
        val notesText = call.getString("notesText") ?: ""
        val watermarkText = call.getString("watermarkText") ?: verified.watermarkText.ifBlank { "Class 10 SSC LMS" }
        val startPositionMs = call.getLong("startPositionMs") ?: verified.lastPositionMs
        val completed = call.getBoolean("completed") ?: verified.completed
        val apiBaseUrl = call.getString("apiBaseUrl") ?: ""
        val accessToken = call.getString("accessToken") ?: ""
        val deviceId = call.getString("deviceId") ?: ""
        val warningHeading = call.getString("warningHeading") ?: LmsMedia3PlayerActivity.DEFAULT_WARNING_HEADING
        val warningMessage = call.getString("warningMessage") ?: LmsMedia3PlayerActivity.DEFAULT_WARNING_MESSAGE
        val watermarkEnabled = call.getBoolean("watermarkEnabled") ?: true
        val screenSharingProtection = call.getBoolean("screenSharingProtection") ?: true
        val securityEventLogging = call.getBoolean("securityEventLogging") ?: true

        val intent = Intent(activity, LmsMedia3PlayerActivity::class.java).apply {
            putExtra(LmsMedia3PlayerActivity.EXTRA_OFFLINE_LESSON_ID, lessonId)
            putExtra(LmsMedia3PlayerActivity.EXTRA_STUDENT_ID, studentId)
            putExtra(LmsMedia3PlayerActivity.EXTRA_TITLE, title)
            putExtra(LmsMedia3PlayerActivity.EXTRA_DESCRIPTION, description)
            putExtra(LmsMedia3PlayerActivity.EXTRA_NOTES, notesText)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WATERMARK, watermarkText)
            putExtra(LmsMedia3PlayerActivity.EXTRA_START_POSITION_MS, startPositionMs)
            putExtra(LmsMedia3PlayerActivity.EXTRA_COMPLETED, completed)
            putExtra(LmsMedia3PlayerActivity.EXTRA_LESSON_ID, lessonId)
            putExtra(LmsMedia3PlayerActivity.EXTRA_API_BASE_URL, apiBaseUrl)
            putExtra(LmsMedia3PlayerActivity.EXTRA_ACCESS_TOKEN, accessToken)
            putExtra(LmsMedia3PlayerActivity.EXTRA_DEVICE_ID, deviceId)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WARNING_HEADING, warningHeading)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WARNING_MESSAGE, warningMessage)
            putExtra(LmsMedia3PlayerActivity.EXTRA_WATERMARK_ENABLED, watermarkEnabled)
            putExtra(LmsMedia3PlayerActivity.EXTRA_SCREEN_SHARING_PROTECTION, screenSharingProtection)
            putExtra(LmsMedia3PlayerActivity.EXTRA_SECURITY_EVENT_LOGGING, securityEventLogging)
        }

        startActivityForResult(call, intent, "handlePlayerResult")
    }

    @ActivityCallback
    private fun handlePlayerResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        val ret = JSObject().apply {
            put("lastPositionMs", data?.getLongExtra(LmsMedia3PlayerActivity.RESULT_LAST_POSITION_MS, 0L) ?: 0L)
            put("durationMs", data?.getLongExtra(LmsMedia3PlayerActivity.RESULT_DURATION_MS, 0L) ?: 0L)
            put("completed", data?.getBooleanExtra(LmsMedia3PlayerActivity.RESULT_COMPLETED, false) ?: false)
        }
        call.resolve(ret)
    }
}
