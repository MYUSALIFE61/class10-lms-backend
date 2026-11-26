package `in`.class10lms.ssc

import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * Lightweight background reporter that submits protected capture/recording telemetry
 * to the existing Class 10 LMS Express backend (/api/v1/student/security/events).
 *
 * Security & privacy constraints:
 * - Sends ONLY authorized fields: lessonId, deviceId, eventType, timestamp, androidApiLevel, protectionAction.
 * - Never collects unrelated private device identifiers, installed app lists, or personal files.
 * - Fails silently on offline devices so video protection never crashes or unlocks playback.
 */
class SecurityEventReporter(
    private val apiBaseUrl: String,
    private val accessToken: String,
    private val deviceId: String,
    private val lessonId: String,
    private val enabled: Boolean = true
) {
    companion object {
        private const val TAG = "Class10SecurityReport"
        private val executor = Executors.newSingleThreadExecutor()
    }

    fun report(eventType: String, protectionAction: String) {
        if (!enabled) return
        val cleanBase = apiBaseUrl.trim().trimEnd('/')
        if (cleanBase.isEmpty() || accessToken.isBlank()) return
        if (!isAllowedEndpoint(cleanBase)) return

        val isoTimestamp = formatUtcIso(System.currentTimeMillis())
        val payload = JSONObject().apply {
            if (lessonId.isNotBlank()) put("lessonId", lessonId)
            put("deviceId", deviceId.ifBlank { "android-native" })
            put("eventType", eventType)
            put("timestamp", isoTimestamp)
            put("androidApiLevel", Build.VERSION.SDK_INT)
            put("protectionAction", protectionAction)
        }.toString()

        executor.execute {
            var conn: HttpURLConnection? = null
            try {
                val url = URL("$cleanBase/student/security/events")
                conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 5_000
                    readTimeout = 5_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Authorization", "Bearer $accessToken")
                    if (deviceId.isNotBlank()) {
                        setRequestProperty("X-Device-Id", deviceId)
                    }
                }
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload)
                    writer.flush()
                }
                val code = conn.responseCode
                Log.i(TAG, "Reported security event [$eventType] -> HTTP $code")
            } catch (ex: Exception) {
                Log.w(TAG, "Skipped security event report [$eventType]: ${ex.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    private fun isAllowedEndpoint(baseUrl: String): Boolean {
        if (baseUrl.startsWith("https://")) return true
        if (BuildConfig.DEBUG && (
                baseUrl.startsWith("http://localhost:") ||
                baseUrl.startsWith("http://127.0.0.1:") ||
                baseUrl.startsWith("http://10.0.2.2:")
            )
        ) {
            return true
        }
        return false
    }

    private fun formatUtcIso(epochMs: Long): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date(epochMs))
    }
}
