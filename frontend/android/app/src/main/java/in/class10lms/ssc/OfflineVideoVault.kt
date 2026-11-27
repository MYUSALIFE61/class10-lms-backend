package `in`.class10lms.ssc

import android.content.Context
import android.content.SharedPreferences
import android.os.StatFs
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.io.File

/**
 * Pure domain state model for verified offline video records.
 */
data class OfflineVideoRecord(
    val lessonId: String,
    val downloadId: String,
    val studentId: String,
    val videoAssetId: String,
    val title: String,
    val chapterTitle: String,
    val subjectTitle: String,
    val thumbnailUrl: String,
    val durationSeconds: Long,
    val fileSize: Long,
    val bytesDownloaded: Long,
    val sha256Checksum: String,
    val status: String, // NOT_DOWNLOADED | DOWNLOADING | DOWNLOADED | DOWNLOAD_FAILED | FILE_MISSING
    val lastPositionMs: Long,
    val completed: Boolean,
    val downloadedAtEpochMs: Long,
    val wrappedDek: String,
    val nonceBase64: String,
    val watermarkText: String,
    val qualityLabel: String,
    val errorCode: String = "",
    val errorMessage: String = "",
    val cipherFormat: String = OfflineVideoVault.CIPHER_FORMAT_V2_GCM,
    val offlineLeaseExpiresAtEpochMs: Long = 0L
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("lessonId", lessonId)
        put("downloadId", downloadId)
        put("studentId", studentId)
        put("videoAssetId", videoAssetId)
        put("title", title)
        put("chapterTitle", chapterTitle)
        put("subjectTitle", subjectTitle)
        put("thumbnailUrl", thumbnailUrl)
        put("durationSeconds", durationSeconds)
        put("fileSize", fileSize)
        put("bytesDownloaded", bytesDownloaded)
        put("sha256Checksum", sha256Checksum)
        put("status", status)
        put("lastPositionMs", lastPositionMs)
        put("completed", completed)
        put("downloadedAtEpochMs", downloadedAtEpochMs)
        put("wrappedDek", wrappedDek)
        put("nonceBase64", nonceBase64)
        put("watermarkText", watermarkText)
        put("qualityLabel", qualityLabel)
        put("errorCode", errorCode)
        put("errorMessage", errorMessage)
        put("cipherFormat", cipherFormat)
        put("offlineLeaseExpiresAtEpochMs", offlineLeaseExpiresAtEpochMs)
    }

    /**
     * Public JS-safe representation (NEVER includes wrappedDek, nonce, or raw filesystem paths).
     */
    fun toPublicJsMap(): JSONObject = JSONObject().apply {
        put("lessonId", lessonId)
        put("downloadId", downloadId)
        put("videoAssetId", videoAssetId)
        put("title", title)
        put("chapterTitle", chapterTitle)
        put("subjectTitle", subjectTitle)
        put("thumbnailUrl", thumbnailUrl)
        put("durationSeconds", durationSeconds)
        put("fileSize", fileSize)
        put("bytesDownloaded", bytesDownloaded)
        put("sha256Checksum", sha256Checksum)
        put("status", status)
        put("lastPositionMs", lastPositionMs)
        put("lastPositionSeconds", (lastPositionMs / 1000L).coerceAtLeast(0L))
        put("completed", completed)
        put("downloadedAtEpochMs", downloadedAtEpochMs)
        put("watermarkText", watermarkText)
        put("qualityLabel", qualityLabel)
        put("errorCode", errorCode)
        put("errorMessage", errorMessage)
        put("cipherFormat", cipherFormat)
        put("offlineLeaseExpiresAtEpochMs", offlineLeaseExpiresAtEpochMs)
    }

    companion object {
        fun fromJson(obj: JSONObject): OfflineVideoRecord = OfflineVideoRecord(
            lessonId = obj.optString("lessonId", ""),
            downloadId = obj.optString("downloadId", ""),
            studentId = obj.optString("studentId", ""),
            videoAssetId = obj.optString("videoAssetId", ""),
            title = obj.optString("title", "Class 10 Lesson"),
            chapterTitle = obj.optString("chapterTitle", ""),
            subjectTitle = obj.optString("subjectTitle", ""),
            thumbnailUrl = obj.optString("thumbnailUrl", ""),
            durationSeconds = obj.optLong("durationSeconds", 0L),
            fileSize = obj.optLong("fileSize", 0L),
            bytesDownloaded = obj.optLong("bytesDownloaded", 0L),
            sha256Checksum = obj.optString("sha256Checksum", ""),
            status = obj.optString("status", "NOT_DOWNLOADED"),
            lastPositionMs = obj.optLong("lastPositionMs", 0L),
            completed = obj.optBoolean("completed", false),
            downloadedAtEpochMs = obj.optLong("downloadedAtEpochMs", 0L),
            wrappedDek = obj.optString("wrappedDek", ""),
            nonceBase64 = obj.optString("nonceBase64", ""),
            watermarkText = obj.optString("watermarkText", ""),
            qualityLabel = obj.optString("qualityLabel", "720p"),
            errorCode = obj.optString("errorCode", ""),
            errorMessage = obj.optString("errorMessage", ""),
            cipherFormat = obj.optString("cipherFormat", OfflineVideoVault.CIPHER_FORMAT_V1_CTR),
            offlineLeaseExpiresAtEpochMs = obj.optLong("offlineLeaseExpiresAtEpochMs", 0L)
        )
    }
}

data class DecryptionCredentials(
    val file: File,
    val dek: ByteArray,
    val nonceOrSalt: ByteArray,
    val cipherFormat: String,
    val plaintextSize: Long,
    val lessonId: String,
    val studentId: String
)

/**
 * Manages Android app-private encrypted video storage under `context.noBackupFilesDir/offline_lessons/`.
 *
 * Privacy & Security Properties:
 * - Stored strictly inside app-private internal storage (never Downloads, SD card, or MediaStore).
 * - Writes `.nomedia` sentinel so Android media scanners / Gallery never index files.
 * - Excluded from cloud/ADB backups (`noBackupFilesDir` + `android:allowBackup="false"`).
 * - Excluded from FileProvider (`res/xml/file_paths.xml`), never exposes public file URLs.
 * - Metadata & Keystore-wrapped DEKs stored inside EncryptedSharedPreferences.
 */
class OfflineVideoVault(context: Context) {

    companion object {
        const val STATUS_NOT_DOWNLOADED = "NOT_DOWNLOADED"
        const val STATUS_DOWNLOADING = "DOWNLOADING"
        const val STATUS_PAUSED = "PAUSED"
        const val STATUS_DOWNLOADED = "DOWNLOADED"
        const val STATUS_DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
        const val STATUS_FILE_MISSING = "FILE_MISSING"

        const val CIPHER_FORMAT_V1_CTR = "v1_ctr"
        const val CIPHER_FORMAT_V2_GCM = "v2_gcm"

        // Require 100 MB safety buffer beyond the video file size before starting download
        const val STORAGE_SAFETY_BUFFER_BYTES = 100L * 1024L * 1024L
        private const val PREFS_NAME = "class10_lms_offline_vault_v1"
        private const val ROOT_FOLDER = "offline_lessons"

        fun sanitizeId(raw: String): String =
            raw.trim().replace(Regex("[^a-zA-Z0-9_-]"), "").take(80)

        fun getExpectedPhysicalFileSize(plaintextSize: Long, cipherFormat: String): Long {
            return if (cipherFormat == CIPHER_FORMAT_V2_GCM) {
                AuthenticatedChunkedCipher.getExpectedPhysicalSize(plaintextSize)
            } else {
                plaintextSize
            }
        }
    }

    private val appContext = context.applicationContext
    private val vaultRoot: File = File(appContext.noBackupFilesDir, ROOT_FOLDER).apply {
        if (!exists()) mkdirs()
        ensureNoMediaMarker(this)
    }

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun ensureNoMediaMarker(dir: File) {
        try {
            val nomedia = File(dir, ".nomedia")
            if (!nomedia.exists()) nomedia.createNewFile()
        } catch (_: Exception) {
            // Best-effort marker inside already-private internal directory
        }
    }

    private fun studentNamespace(studentId: String): String {
        val cleaned = studentId.trim().ifEmpty { "anonymous" }
        return CtrSeekCipher.sha256Hex(cleaned).take(20)
    }

    private fun prefKey(studentId: String, lessonId: String): String =
        "dl_${studentNamespace(studentId)}_${sanitizeId(lessonId)}"

    private fun leasePrefKey(studentId: String): String =
        "lease_${studentNamespace(studentId)}"

    private fun clockWatermarkKey(studentId: String): String =
        "clock_${studentNamespace(studentId)}"

    /**
     * Persists a server-signed, device-bound offline authorization lease inside Keystore-backed
     * EncryptedSharedPreferences (never student-editable plaintext storage).
     */
    fun saveStudentOfflineLease(
        studentId: String,
        leaseToken: String,
        leaseExpiresAtEpochMs: Long,
        subscriptionExpiresAtEpochMs: Long = 0L
    ) {
        val now = System.currentTimeMillis()
        val obj = JSONObject().apply {
            put("leaseToken", leaseToken)
            put("leaseExpiresAtEpochMs", leaseExpiresAtEpochMs)
            put("subscriptionExpiresAtEpochMs", subscriptionExpiresAtEpochMs)
            put("updatedAtEpochMs", now)
        }
        val prevClock = prefs.getLong(clockWatermarkKey(studentId), 0L)
        prefs.edit()
            .putString(leasePrefKey(studentId), obj.toString())
            .putLong(clockWatermarkKey(studentId), maxOf(prevClock, now))
            .apply()
    }

    /**
     * Verifies whether the student holds a valid, unexpired offline playback authorization lease.
     * Detects basic system-clock rollback (> 10 minutes backwards) and expired leases.
     */
    fun checkOfflineLeaseValid(
        studentId: String,
        lessonId: String,
        nowEpochMs: Long = System.currentTimeMillis()
    ): Pair<Boolean, String> {
        val lastClock = prefs.getLong(clockWatermarkKey(studentId), 0L)
        if (lastClock > 0L && nowEpochMs + 600_000L < lastClock) {
            return false to "Device clock rollback detected. Connect to the internet to re-verify your Class 10 subscription."
        }
        if (nowEpochMs > lastClock) {
            prefs.edit().putLong(clockWatermarkKey(studentId), nowEpochMs).apply()
        }

        val record = getRecord(studentId, lessonId)
        val recordLeaseExp = record?.offlineLeaseExpiresAtEpochMs ?: 0L
        val studentLeaseRaw = prefs.getString(leasePrefKey(studentId), null)
        val studentLeaseExp = if (!studentLeaseRaw.isNullOrBlank()) {
            try {
                JSONObject(studentLeaseRaw).optLong("leaseExpiresAtEpochMs", 0L)
            } catch (_: Exception) {
                0L
            }
        } else {
            0L
        }

        val effectiveExp = when {
            studentLeaseExp > 0L && recordLeaseExp > 0L -> studentLeaseExp
            studentLeaseExp > 0L -> studentLeaseExp
            else -> recordLeaseExp
        }
        if (effectiveExp > 0L && nowEpochMs > effectiveExp) {
            return false to "Your offline viewing license has expired. Connect to the internet to verify your Class 10 subscription and renew offline access."
        }
        return true to ""
    }

    fun getStudentDir(studentId: String): File {
        val dir = File(vaultRoot, studentNamespace(studentId))
        if (!dir.exists()) dir.mkdirs()
        ensureNoMediaMarker(dir)
        return dir
    }

    fun getEncryptedVideoFile(studentId: String, lessonId: String): File {
        val safeLesson = sanitizeId(lessonId)
        require(safeLesson.isNotEmpty()) { "Invalid lessonId" }
        return File(getStudentDir(studentId), "$safeLesson.enc")
    }

    fun getPartialVideoFile(studentId: String, lessonId: String): File {
        val safeLesson = sanitizeId(lessonId)
        require(safeLesson.isNotEmpty()) { "Invalid lessonId" }
        return File(getStudentDir(studentId), "$safeLesson.enc.part")
    }

    fun getAvailableStorageBytes(): Long {
        return try {
            val stat = StatFs(vaultRoot.absolutePath)
            stat.availableBytes
        } catch (_: Exception) {
            0L
        }
    }

    fun hasSufficientStorage(
        requiredBytes: Long,
        safetyBufferBytes: Long = STORAGE_SAFETY_BUFFER_BYTES
    ): Boolean {
        val needed = requiredBytes.coerceAtLeast(0L) + safetyBufferBytes.coerceAtLeast(0L)
        return getAvailableStorageBytes() >= needed
    }

    fun saveRecord(record: OfflineVideoRecord) {
        prefs.edit()
            .putString(prefKey(record.studentId, record.lessonId), record.toJson().toString())
            .apply()
    }

    fun getRecord(studentId: String, lessonId: String): OfflineVideoRecord? {
        val raw = prefs.getString(prefKey(studentId, lessonId), null) ?: return null
        return try {
            OfflineVideoRecord.fromJson(JSONObject(raw))
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Strictly verifies that a completed record's encrypted file actually exists on disk, matches
     * expected byte length, has intact key material, and (when deepVerify=true) matches SHA-256.
     *
     * Never returns DOWNLOADED if the local file is missing, truncated, or corrupted.
     */
    fun verifyRecord(
        studentId: String,
        lessonId: String,
        deepVerifyChecksum: Boolean = false
    ): OfflineVideoRecord? {
        val record = getRecord(studentId, lessonId) ?: return null
        if (record.status != STATUS_DOWNLOADED) return record

        val file = getEncryptedVideoFile(studentId, lessonId)
        if (!file.exists() || !file.isFile) {
            val updated = record.copy(
                status = STATUS_FILE_MISSING,
                bytesDownloaded = 0L,
                errorCode = "FILE_MISSING",
                errorMessage = "Downloaded video file was removed. Tap Download Video to save it again."
            )
            saveRecord(updated)
            return updated
        }

        val expectedPhysSize = getExpectedPhysicalFileSize(record.fileSize, record.cipherFormat)
        if (record.fileSize <= 0L || file.length() != expectedPhysSize ||
            record.wrappedDek.isBlank() || record.nonceBase64.isBlank()
        ) {
            file.delete()
            val updated = record.copy(
                status = STATUS_DOWNLOAD_FAILED,
                bytesDownloaded = 0L,
                errorCode = "CORRUPTED_FILE",
                errorMessage = "Downloaded lesson file is incomplete or corrupted. Please retry download."
            )
            saveRecord(updated)
            return updated
        }

        if (deepVerifyChecksum && record.sha256Checksum.isNotBlank()) {
            return try {
                val dek = AndroidKeystoreKeyWrapper.unwrapDek(record.wrappedDek)
                val nonceOrSalt = Base64.decode(record.nonceBase64, Base64.NO_WRAP)
                val (computedHash, verifiedSize) = if (record.cipherFormat == CIPHER_FORMAT_V2_GCM) {
                    AuthenticatedChunkedCipher.computeDecryptedSha256AndSize(
                        file, dek, nonceOrSalt, record.lessonId, record.studentId, record.fileSize
                    )
                } else {
                    CtrSeekCipher.computeDecryptedSha256AndSize(file, dek, nonceOrSalt)
                }
                if (verifiedSize == record.fileSize && computedHash.equals(record.sha256Checksum, ignoreCase = true)) {
                    record
                } else {
                    file.delete()
                    val failed = record.copy(
                        status = STATUS_DOWNLOAD_FAILED,
                        bytesDownloaded = 0L,
                        errorCode = "CHECKSUM_MISMATCH",
                        errorMessage = "Integrity verification failed for this downloaded video. Please download again."
                    )
                    saveRecord(failed)
                    failed
                }
            } catch (_: Exception) {
                file.delete()
                val failed = record.copy(
                    status = STATUS_DOWNLOAD_FAILED,
                    bytesDownloaded = 0L,
                    errorCode = "DECRYPTION_KEY_INVALID",
                    errorMessage = "Encrypted video key could not be verified. Please download again."
                )
                saveRecord(failed)
                failed
            }
        }

        return record
    }

    fun listVerifiedRecords(studentId: String): List<OfflineVideoRecord> {
        val prefix = "dl_${studentNamespace(studentId)}_"
        val result = mutableListOf<OfflineVideoRecord>()
        for ((key, value) in prefs.all) {
            if (!key.startsWith(prefix) || value !is String) continue
            val parsed = try {
                OfflineVideoRecord.fromJson(JSONObject(value))
            } catch (_: Exception) {
                continue
            }
            val verified = verifyRecord(studentId, parsed.lessonId, deepVerifyChecksum = false) ?: continue
            result.add(verified)
        }
        return result.sortedByDescending { it.downloadedAtEpochMs }
    }

    fun updatePlaybackProgress(
        studentId: String,
        lessonId: String,
        lastPositionMs: Long,
        completed: Boolean
    ): OfflineVideoRecord? {
        val current = getRecord(studentId, lessonId) ?: return null
        val updated = current.copy(
            lastPositionMs = lastPositionMs.coerceAtLeast(0L),
            completed = current.completed || completed
        )
        saveRecord(updated)
        return updated
    }

    fun deleteLessonFilesAndRecord(studentId: String, lessonId: String) {
        getEncryptedVideoFile(studentId, lessonId).delete()
        getPartialVideoFile(studentId, lessonId).delete()
        prefs.edit().remove(prefKey(studentId, lessonId)).apply()
    }

    /**
     * Securely removes all downloaded encrypted videos and Keystore-wrapped DEKs for a student
     * (invoked on logout / device revocation / account deletion per retention policy).
     */
    fun clearStudentDownloads(studentId: String): Int {
        var removedCount = 0
        val dir = getStudentDir(studentId)
        dir.listFiles()?.forEach { f ->
            if (f.name != ".nomedia" && f.delete()) {
                removedCount++
            }
        }
        dir.deleteRecursively()

        val prefix = "dl_${studentNamespace(studentId)}_"
        val editor = prefs.edit()
        for (key in prefs.all.keys) {
            if (key.startsWith(prefix)) {
                editor.remove(key)
            }
        }
        editor.remove(leasePrefKey(studentId))
        editor.remove(clockWatermarkKey(studentId))
        editor.apply()
        return removedCount
    }

    fun clearAllDownloads(): Int {
        var removed = 0
        vaultRoot.listFiles()?.forEach { child ->
            if (child.name != ".nomedia") {
                if (child.deleteRecursively()) removed++
            }
        }
        prefs.edit().clear().apply()
        ensureNoMediaMarker(vaultRoot)
        return removed
    }

    fun getTotalUsedBytes(studentId: String): Long {
        val dir = getStudentDir(studentId)
        return dir.listFiles()
            ?.filter { it.isFile && it.name != ".nomedia" }
            ?.sumOf { it.length() }
            ?: 0L
    }

    fun openDecryptionCredentials(studentId: String, lessonId: String): DecryptionCredentials {
        val verified = verifyRecord(studentId, lessonId, deepVerifyChecksum = false)
            ?: throw IllegalStateException("Offline lesson download record not found.")
        if (verified.status != STATUS_DOWNLOADED) {
            throw IllegalStateException("Offline lesson is not verified for playback (status=${verified.status}).")
        }
        val file = getEncryptedVideoFile(studentId, lessonId)
        val dek = AndroidKeystoreKeyWrapper.unwrapDek(verified.wrappedDek)
        val nonceOrSalt = Base64.decode(verified.nonceBase64, Base64.NO_WRAP)
        return DecryptionCredentials(
            file = file,
            dek = dek,
            nonceOrSalt = nonceOrSalt,
            cipherFormat = verified.cipherFormat,
            plaintextSize = verified.fileSize,
            lessonId = verified.lessonId,
            studentId = verified.studentId
        )
    }
}

