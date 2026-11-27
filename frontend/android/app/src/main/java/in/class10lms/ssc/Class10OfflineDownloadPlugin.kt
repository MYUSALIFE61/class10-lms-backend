package `in`.class10lms.ssc

import android.util.Base64
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.BufferedInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher

/**
 * Capacitor 7 Native Background Streaming Offline Video Downloader Plugin.
 *
 * Capabilities:
 * - Concurrent background downloads (2-worker pool) with duplicate-job prevention.
 * - Pre-flight StatFs storage check (+100 MB safety buffer) for low-storage handling.
 * - Streaming 64 KB chunk writes directly through AES-256-CTR into app-private `.enc.part` files
 *   (NEVER loads MP4 files into memory, NEVER writes to public Downloads/Gallery).
 * - HTTP `Range: bytes=<offset>-` resumable download recovery across network interruptions.
 * - Full-file SHA-256 integrity verification over decrypted bytes BEFORE atomic rename to `.enc`
 *   and BEFORE marking status = DOWNLOADED.
 * - Secure student-scoped cleanup on logout/account removal.
 */
@CapacitorPlugin(name = "Class10OfflineDownload")
class Class10OfflineDownloadPlugin : Plugin() {

    companion object {
        private const val TAG = "Class10OfflineDL"
        private const val STREAM_CHUNK_BYTES = 64 * 1024
        private const val CONNECT_TIMEOUT_MS = 20_000
        private const val READ_TIMEOUT_MS = 45_000
        private const val PROGRESS_EMIT_INTERVAL_MS = 180L
    }

    private data class ActiveJob(
        val lessonId: String,
        val studentId: String,
        val cancelled: AtomicBoolean = AtomicBoolean(false),
        val paused: AtomicBoolean = AtomicBoolean(false),
        @Volatile var connection: HttpURLConnection? = null,
        @Volatile var future: Future<*>? = null
    )

    private lateinit var vault: OfflineVideoVault
    private val executor = Executors.newFixedThreadPool(2)
    private val activeJobs = ConcurrentHashMap<String, ActiveJob>()

    override fun load() {
        super.load()
        vault = OfflineVideoVault(context.applicationContext)
    }

    override fun handleOnDestroy() {
        for (job in activeJobs.values) {
            job.cancelled.set(true)
            try {
                job.connection?.disconnect()
            } catch (_: Exception) {
            }
            job.future?.cancel(true)
        }
        activeJobs.clear()
        executor.shutdownNow()
        super.handleOnDestroy()
    }

    private fun jobKey(studentId: String, lessonId: String): String =
        "${studentId.trim()}::${OfflineVideoVault.sanitizeId(lessonId)}"

    private fun readLongArg(call: PluginCall, key: String, defaultValue: Long = 0L): Long {
        val raw = call.data?.opt(key) ?: return defaultValue
        return when (raw) {
            is Number -> raw.toLong()
            is String -> raw.toLongOrNull() ?: defaultValue
            else -> defaultValue
        }
    }

    private fun isAllowedDownloadUrl(rawUrl: String): Boolean {
        if (rawUrl.startsWith("https://")) return true
        if (BuildConfig.DEBUG && (
                rawUrl.startsWith("http://localhost:") ||
                rawUrl.startsWith("http://127.0.0.1:") ||
                rawUrl.startsWith("http://10.0.2.2:")
            )
        ) {
            return true
        }
        return false
    }

    @PluginMethod
    fun startDownload(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        val downloadId = call.getString("downloadId").orEmpty().trim()
        val videoAssetId = call.getString("videoAssetId").orEmpty().trim()
        val streamUrl = call.getString("streamUrl").orEmpty().trim()
        val expectedChecksum = call.getString("sha256Checksum").orEmpty().trim().lowercase()
        val expectedSize = readLongArg(call, "fileSize", 0L)
        val title = call.getString("title") ?: "Class 10 Lesson"
        val chapterTitle = call.getString("chapterTitle") ?: ""
        val subjectTitle = call.getString("subjectTitle") ?: ""
        val thumbnailUrl = call.getString("thumbnailUrl") ?: ""
        val durationSeconds = readLongArg(call, "durationSeconds", 0L)
        val watermarkText = call.getString("watermarkText") ?: ""
        val qualityLabel = call.getString("qualityLabel") ?: "720p"
        val offlineLeaseToken = call.getString("offlineLeaseToken") ?: ""
        val offlineLeaseExpiresAtEpochMs = readLongArg(call, "offlineLeaseExpiresAtEpochMs", 0L)
        val subscriptionExpiresAtEpochMs = readLongArg(call, "subscriptionExpiresAtEpochMs", 0L)

        if (offlineLeaseToken.isNotBlank() && offlineLeaseExpiresAtEpochMs > 0L) {
            vault.saveStudentOfflineLease(
                studentId = studentId,
                leaseToken = offlineLeaseToken,
                leaseExpiresAtEpochMs = offlineLeaseExpiresAtEpochMs,
                subscriptionExpiresAtEpochMs = subscriptionExpiresAtEpochMs
            )
        }

        if (studentId.isEmpty() || lessonId.isEmpty() || downloadId.isEmpty() || streamUrl.isEmpty()) {
            call.reject("Missing required download parameters (studentId, lessonId, downloadId, streamUrl)")
            return
        }
        if (!isAllowedDownloadUrl(streamUrl)) {
            call.reject("Blocked insecure download stream URL")
            return
        }
        if (expectedSize <= 0L || expectedChecksum.length != 64) {
            call.reject("Valid fileSize and 64-char SHA-256 checksum are required for verified downloads")
            return
        }

        // Duplicate-download guard: if already verified locally, return immediately
        val existingVerified = vault.verifyRecord(studentId, lessonId, deepVerifyChecksum = false)
        if (existingVerified?.status == OfflineVideoVault.STATUS_DOWNLOADED &&
            existingVerified.sha256Checksum.equals(expectedChecksum, ignoreCase = true)
        ) {
            call.resolve(
                JSObject().apply {
                    put("started", false)
                    put("alreadyDownloaded", true)
                    put("record", JSObject(existingVerified.toPublicJsMap().toString()))
                }
            )
            return
        }

        val key = jobKey(studentId, lessonId)
        if (activeJobs.containsKey(key)) {
            call.resolve(
                JSObject().apply {
                    put("started", false)
                    put("alreadyInProgress", true)
                }
            )
            return
        }

        // Pre-flight storage check (required bytes + 100 MB safety margin)
        val partFile = vault.getPartialVideoFile(studentId, lessonId)
        val existingPartLen = if (partFile.exists()) partFile.length() else 0L
        val remainingNeeded = (expectedSize - existingPartLen).coerceAtLeast(0L)
        if (!vault.hasSufficientStorage(remainingNeeded)) {
            val availableMb = vault.getAvailableStorageBytes() / (1024L * 1024L)
            val neededMb = (remainingNeeded + OfflineVideoVault.STORAGE_SAFETY_BUFFER_BYTES) / (1024L * 1024L)
            val msg = "Insufficient storage space (${availableMb} MB free, ~${neededMb} MB required). Free up space and retry."
            emitStateChanged(lessonId, downloadId, OfflineVideoVault.STATUS_DOWNLOAD_FAILED, 0, 0L, expectedSize, "INSUFFICIENT_STORAGE", msg)
            call.reject(msg, "INSUFFICIENT_STORAGE")
            return
        }

        val job = ActiveJob(lessonId = lessonId, studentId = studentId)
        activeJobs[key] = job

        job.future = executor.submit {
            executeStreamingDownload(
                job = job,
                key = key,
                studentId = studentId,
                lessonId = lessonId,
                downloadId = downloadId,
                videoAssetId = videoAssetId,
                streamUrl = streamUrl,
                expectedChecksum = expectedChecksum,
                expectedSize = expectedSize,
                title = title,
                chapterTitle = chapterTitle,
                subjectTitle = subjectTitle,
                thumbnailUrl = thumbnailUrl,
                durationSeconds = durationSeconds,
                watermarkText = watermarkText,
                qualityLabel = qualityLabel,
                offlineLeaseExpiresAtEpochMs = offlineLeaseExpiresAtEpochMs
            )
        }

        call.resolve(
            JSObject().apply {
                put("started", true)
                put("alreadyDownloaded", false)
                put("alreadyInProgress", false)
                put("lessonId", lessonId)
                put("downloadId", downloadId)
            }
        )
    }

    private fun executeStreamingDownload(
        job: ActiveJob,
        key: String,
        studentId: String,
        lessonId: String,
        downloadId: String,
        videoAssetId: String,
        streamUrl: String,
        expectedChecksum: String,
        expectedSize: Long,
        title: String,
        chapterTitle: String,
        subjectTitle: String,
        thumbnailUrl: String,
        durationSeconds: Long,
        watermarkText: String,
        qualityLabel: String,
        offlineLeaseExpiresAtEpochMs: Long = 0L
    ) {
        val partFile = vault.getPartialVideoFile(studentId, lessonId)
        val finalFile = vault.getEncryptedVideoFile(studentId, lessonId)

        var dek: ByteArray? = null
        try {
            // Reuse existing partial file + wrapped DEK for HTTP Range resume if checksum & download match
            val previous = vault.getRecord(studentId, lessonId)
            val canResumePartial = previous != null &&
                previous.cipherFormat == OfflineVideoVault.CIPHER_FORMAT_V2_GCM &&
                previous.sha256Checksum.equals(expectedChecksum, ignoreCase = true) &&
                previous.wrappedDek.isNotBlank() &&
                previous.nonceBase64.isNotBlank() &&
                partFile.exists() &&
                partFile.length() > 0L

            var resumeOffset = 0L
            var chunkIndex = 0
            val wrappedDek: String
            val nonceBase64: String
            val nonceBytes: ByteArray

            if (canResumePartial) {
                val prev = previous!!
                wrappedDek = prev.wrappedDek
                nonceBase64 = prev.nonceBase64
                dek = AndroidKeystoreKeyWrapper.unwrapDek(wrappedDek)
                nonceBytes = Base64.decode(nonceBase64, Base64.NO_WRAP)

                // Clean truncate to last full chunk boundary (CHUNK_TOTAL_SIZE = 65,552 bytes)
                val fullChunkPhysSize = AuthenticatedChunkedCipher.CHUNK_TOTAL_SIZE.toLong()
                val completeChunks = partFile.length() / fullChunkPhysSize
                val validPhysicalLen = completeChunks * fullChunkPhysSize
                if (partFile.length() > validPhysicalLen) {
                    val raf = java.io.RandomAccessFile(partFile, "rw")
                    raf.use { it.setLength(validPhysicalLen) }
                }
                resumeOffset = completeChunks * AuthenticatedChunkedCipher.CHUNK_DATA_SIZE.toLong()
                chunkIndex = completeChunks.toInt()
            } else {
                partFile.delete()
                dek = AuthenticatedChunkedCipher.generateDek()
                nonceBytes = AuthenticatedChunkedCipher.generateSalt8()
                wrappedDek = AndroidKeystoreKeyWrapper.wrapDek(dek)
                nonceBase64 = Base64.encodeToString(nonceBytes, Base64.NO_WRAP)
                resumeOffset = 0L
                chunkIndex = 0
            }

            var record = OfflineVideoRecord(
                lessonId = lessonId,
                downloadId = downloadId,
                studentId = studentId,
                videoAssetId = videoAssetId,
                title = title,
                chapterTitle = chapterTitle,
                subjectTitle = subjectTitle,
                thumbnailUrl = thumbnailUrl,
                durationSeconds = durationSeconds,
                fileSize = expectedSize,
                bytesDownloaded = resumeOffset,
                sha256Checksum = expectedChecksum,
                status = OfflineVideoVault.STATUS_DOWNLOADING,
                lastPositionMs = previous?.lastPositionMs ?: 0L,
                completed = previous?.completed ?: false,
                downloadedAtEpochMs = 0L,
                wrappedDek = wrappedDek,
                nonceBase64 = nonceBase64,
                watermarkText = watermarkText,
                qualityLabel = qualityLabel,
                cipherFormat = OfflineVideoVault.CIPHER_FORMAT_V2_GCM,
                offlineLeaseExpiresAtEpochMs = offlineLeaseExpiresAtEpochMs
            )
            vault.saveRecord(record)

            val initialPct = ((resumeOffset * 100L) / expectedSize).toInt().coerceIn(0, 99)
            emitStateChanged(lessonId, downloadId, OfflineVideoVault.STATUS_DOWNLOADING, initialPct, resumeOffset, expectedSize, "", "")

            val conn = (URL(streamUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                instanceFollowRedirects = false
                setRequestProperty("Accept", "video/mp4,application/octet-stream,*/*")
                if (resumeOffset > 0L) {
                    setRequestProperty("Range", "bytes=$resumeOffset-")
                }
            }
            job.connection = conn

            val code = conn.responseCode
            if (job.cancelled.get()) {
                handleCancellation(studentId, lessonId, downloadId, expectedSize)
                return
            }

            if (code == 401 || code == 403) {
                throw SecurityException("Unauthorized or expired download authorization (HTTP $code).")
            }
            if (code != 200 && code != 206) {
                throw IllegalStateException("Download server returned HTTP $code.")
            }

            val appendMode = (code == 206 && resumeOffset > 0L)
            val startOffset = if (appendMode) resumeOffset else 0L
            if (!appendMode && partFile.exists()) {
                partFile.delete()
                chunkIndex = 0
            }

            var downloaded = startOffset
            var lastEmitMs = 0L
            var lastEmitPct = -1
            val buf = ByteArray(STREAM_CHUNK_BYTES)
            val chunkBuf = ByteArray(AuthenticatedChunkedCipher.CHUNK_DATA_SIZE)
            var chunkBufLen = 0

            BufferedInputStream(conn.inputStream, STREAM_CHUNK_BYTES).use { input ->
                FileOutputStream(partFile, appendMode).use { output ->
                    while (true) {
                        if (job.paused.get()) {
                            handlePause(studentId, lessonId, downloadId, expectedSize, partFile)
                            return
                        }
                        if (job.cancelled.get() || Thread.currentThread().isInterrupted) {
                            handleCancellation(studentId, lessonId, downloadId, expectedSize)
                            return
                        }
                        val needed = AuthenticatedChunkedCipher.CHUNK_DATA_SIZE - chunkBufLen
                        val read = input.read(buf, 0, minOf(buf.size, needed))
                        if (read == -1) break
                        if (read > 0) {
                            System.arraycopy(buf, 0, chunkBuf, chunkBufLen, read)
                            chunkBufLen += read
                            downloaded += read

                            if (chunkBufLen == AuthenticatedChunkedCipher.CHUNK_DATA_SIZE) {
                                val encChunk = AuthenticatedChunkedCipher.encryptChunk(
                                    plaintext = chunkBuf,
                                    offset = 0,
                                    length = chunkBufLen,
                                    dek = dek,
                                    baseSalt = nonceBytes,
                                    chunkIndex = chunkIndex,
                                    lessonId = lessonId,
                                    studentId = studentId
                                )
                                output.write(encChunk)
                                chunkIndex++
                                chunkBufLen = 0
                            }

                            val now = System.currentTimeMillis()
                            val pct = ((downloaded * 100L) / expectedSize).toInt().coerceIn(0, 99)
                            if (pct != lastEmitPct && (now - lastEmitMs >= PROGRESS_EMIT_INTERVAL_MS || pct == 99)) {
                                lastEmitMs = now
                                lastEmitPct = pct
                                emitProgress(lessonId, downloadId, pct, downloaded, expectedSize)
                            }
                        }
                    }

                    // Flush final partial chunk if any
                    if (chunkBufLen > 0) {
                        val encChunk = AuthenticatedChunkedCipher.encryptChunk(
                            plaintext = chunkBuf,
                            offset = 0,
                            length = chunkBufLen,
                            dek = dek,
                            baseSalt = nonceBytes,
                            chunkIndex = chunkIndex,
                            lessonId = lessonId,
                            studentId = studentId
                        )
                        output.write(encChunk)
                        chunkIndex++
                        chunkBufLen = 0
                    }
                    output.fd.sync()
                }
            }

            if (job.cancelled.get()) {
                handleCancellation(studentId, lessonId, downloadId, expectedSize)
                return
            }

            // Strict Verification Gate: streaming decrypted SHA-256 checksum + per-chunk GCM tag verification BEFORE completion
            val (computedSha256, verifiedSize) = try {
                AuthenticatedChunkedCipher.computeDecryptedSha256AndSize(
                    encryptedFile = partFile,
                    dek = dek,
                    baseSalt = nonceBytes,
                    lessonId = lessonId,
                    studentId = studentId,
                    expectedPlaintextSize = expectedSize
                )
            } catch (authEx: Exception) {
                Log.e(TAG, "Chunked GCM integrity check failed for $lessonId: ${authEx.message}")
                "" to 0L
            }

            if (verifiedSize != expectedSize || !computedSha256.equals(expectedChecksum, ignoreCase = true)) {
                Log.e(
                    TAG,
                    "Integrity verification failed for $lessonId: size=$verifiedSize/$expectedSize hashMatch=${computedSha256.equals(expectedChecksum, true)}"
                )
                partFile.delete()
                val failed = record.copy(
                    status = OfflineVideoVault.STATUS_DOWNLOAD_FAILED,
                    bytesDownloaded = 0L,
                    errorCode = "CHECKSUM_MISMATCH",
                    errorMessage = "Downloaded video failed integrity verification. Please retry download."
                )
                vault.saveRecord(failed)
                emitStateChanged(
                    lessonId,
                    downloadId,
                    OfflineVideoVault.STATUS_DOWNLOAD_FAILED,
                    0,
                    0L,
                    expectedSize,
                    "CHECKSUM_MISMATCH",
                    failed.errorMessage
                )
                return
            }

            val expectedPhysSize = AuthenticatedChunkedCipher.getExpectedPhysicalSize(expectedSize)
            if (finalFile.exists()) finalFile.delete()
            val renamed = partFile.renameTo(finalFile)
            if (!renamed || !finalFile.exists() || finalFile.length() != expectedPhysSize) {
                partFile.delete()
                throw IllegalStateException("Failed to finalize encrypted offline video file.")
            }

            val completedRecord = record.copy(
                status = OfflineVideoVault.STATUS_DOWNLOADED,
                bytesDownloaded = expectedSize,
                downloadedAtEpochMs = System.currentTimeMillis(),
                errorCode = "",
                errorMessage = ""
            )
            vault.saveRecord(completedRecord)
            emitProgress(lessonId, downloadId, 100, expectedSize, expectedSize)
            emitStateChanged(
                lessonId,
                downloadId,
                OfflineVideoVault.STATUS_DOWNLOADED,
                100,
                expectedSize,
                expectedSize,
                "",
                "",
                computedSha256
            )
            Log.i(TAG, "Verified offline download complete: lessonId=$lessonId bytes=$expectedSize")
        } catch (ex: Exception) {
            if (job.paused.get()) {
                handlePause(studentId, lessonId, downloadId, expectedSize, partFile)
            } else if (job.cancelled.get()) {
                handleCancellation(studentId, lessonId, downloadId, expectedSize)
            } else {
                Log.w(TAG, "Offline download interrupted/failed for $lessonId: ${ex.message}")
                val partialBytes = if (partFile.exists()) partFile.length() else 0L
                val errorCode = when (ex) {
                    is SecurityException -> "UNAUTHORIZED_DOWNLOAD"
                    else -> "NETWORK_INTERRUPTED"
                }
                val message = ex.message ?: "Download interrupted. Check connection and tap Retry Download."
                val prev = vault.getRecord(studentId, lessonId)
                if (prev != null) {
                    vault.saveRecord(
                        prev.copy(
                            status = OfflineVideoVault.STATUS_DOWNLOAD_FAILED,
                            bytesDownloaded = partialBytes,
                            errorCode = errorCode,
                            errorMessage = message
                        )
                    )
                }
                val pct = if (expectedSize > 0) ((partialBytes * 100L) / expectedSize).toInt().coerceIn(0, 99) else 0
                emitStateChanged(
                    lessonId,
                    downloadId,
                    OfflineVideoVault.STATUS_DOWNLOAD_FAILED,
                    pct,
                    partialBytes,
                    expectedSize,
                    errorCode,
                    message
                )
            }
        } finally {
            dek?.fill(0)
            try {
                job.connection?.disconnect()
            } catch (_: Exception) {
            }
            activeJobs.remove(key)
        }
    }

    private fun handlePause(
        studentId: String,
        lessonId: String,
        downloadId: String,
        expectedSize: Long,
        partFile: java.io.File
    ) {
        val fullChunkPhysSize = AuthenticatedChunkedCipher.CHUNK_TOTAL_SIZE.toLong()
        val completeChunks = if (partFile.exists()) partFile.length() / fullChunkPhysSize else 0L
        val validPhysicalLen = completeChunks * fullChunkPhysSize
        if (partFile.exists() && partFile.length() > validPhysicalLen) {
            try {
                java.io.RandomAccessFile(partFile, "rw").use { it.setLength(validPhysicalLen) }
            } catch (_: Exception) {
            }
        }
        val pausedPlaintextBytes = (completeChunks * AuthenticatedChunkedCipher.CHUNK_DATA_SIZE.toLong())
            .coerceAtMost(expectedSize)
        val prev = vault.getRecord(studentId, lessonId)
        if (prev != null) {
            vault.saveRecord(
                prev.copy(
                    status = OfflineVideoVault.STATUS_PAUSED,
                    bytesDownloaded = pausedPlaintextBytes,
                    errorCode = "",
                    errorMessage = ""
                )
            )
        }
        val pct = if (expectedSize > 0) ((pausedPlaintextBytes * 100L) / expectedSize).toInt().coerceIn(0, 99) else 0
        emitStateChanged(
            lessonId,
            downloadId,
            OfflineVideoVault.STATUS_PAUSED,
            pct,
            pausedPlaintextBytes,
            expectedSize,
            "",
            ""
        )
    }

    @PluginMethod
    fun pauseDownload(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        if (studentId.isEmpty() || lessonId.isEmpty()) {
            call.reject("studentId and lessonId are required")
            return
        }
        val key = jobKey(studentId, lessonId)
        val job = activeJobs[key]
        if (job != null) {
            job.paused.set(true)
            try {
                job.connection?.disconnect()
            } catch (_: Exception) {
            }
            call.resolve(JSObject().put("paused", true))
        } else {
            call.resolve(JSObject().put("paused", false))
        }
    }

    @PluginMethod
    fun updateOfflineLease(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val leaseToken = call.getString("leaseToken").orEmpty().trim()
        val leaseExpiresAtEpochMs = readLongArg(call, "leaseExpiresAtEpochMs", 0L)
        val subscriptionExpiresAtEpochMs = readLongArg(call, "subscriptionExpiresAtEpochMs", 0L)
        if (studentId.isEmpty() || leaseToken.isEmpty() || leaseExpiresAtEpochMs <= 0L) {
            call.reject("studentId, leaseToken, and leaseExpiresAtEpochMs are required")
            return
        }
        vault.saveStudentOfflineLease(
            studentId = studentId,
            leaseToken = leaseToken,
            leaseExpiresAtEpochMs = leaseExpiresAtEpochMs,
            subscriptionExpiresAtEpochMs = subscriptionExpiresAtEpochMs
        )
        call.resolve(JSObject().put("updated", true))
    }

    private fun handleCancellation(studentId: String, lessonId: String, downloadId: String, expectedSize: Long) {
        vault.deleteLessonFilesAndRecord(studentId, lessonId)
        emitStateChanged(
            lessonId,
            downloadId,
            OfflineVideoVault.STATUS_NOT_DOWNLOADED,
            0,
            0L,
            expectedSize,
            "CANCELLED",
            "Download cancelled."
        )
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        if (studentId.isEmpty() || lessonId.isEmpty()) {
            call.reject("studentId and lessonId are required")
            return
        }
        val key = jobKey(studentId, lessonId)
        val job = activeJobs[key]
        if (job != null) {
            job.cancelled.set(true)
            try {
                job.connection?.disconnect()
            } catch (_: Exception) {
            }
            job.future?.cancel(true)
        } else {
            vault.deleteLessonFilesAndRecord(studentId, lessonId)
        }
        call.resolve(JSObject().put("cancelled", true))
    }

    @PluginMethod
    fun getLessonDownloadStatus(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        val deepVerify = call.getBoolean("deepVerify") ?: false
        if (studentId.isEmpty() || lessonId.isEmpty()) {
            call.reject("studentId and lessonId are required")
            return
        }

        val key = jobKey(studentId, lessonId)
        val active = activeJobs.containsKey(key)
        val record = vault.verifyRecord(studentId, lessonId, deepVerifyChecksum = deepVerify)

        val status = when {
            active -> OfflineVideoVault.STATUS_DOWNLOADING
            record != null -> record.status
            else -> OfflineVideoVault.STATUS_NOT_DOWNLOADED
        }

        val ret = JSObject().apply {
            put("status", status)
            put("isActive", active)
            if (record != null) {
                put("record", JSObject(record.toPublicJsMap().toString()))
            }
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun listDownloads(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        if (studentId.isEmpty()) {
            call.reject("studentId is required")
            return
        }
        val records = vault.listVerifiedRecords(studentId)
        val arr = JSArray()
        for (rec in records) {
            arr.put(JSObject(rec.toPublicJsMap().toString()))
        }
        call.resolve(
            JSObject().apply {
                put("items", arr)
                put("totalUsedBytes", vault.getTotalUsedBytes(studentId))
                put("availableStorageBytes", vault.getAvailableStorageBytes())
            }
        )
    }

    @PluginMethod
    fun deleteDownload(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        if (studentId.isEmpty() || lessonId.isEmpty()) {
            call.reject("studentId and lessonId are required")
            return
        }
        val key = jobKey(studentId, lessonId)
        activeJobs[key]?.let {
            it.cancelled.set(true)
            it.connection?.disconnect()
            it.future?.cancel(true)
        }
        vault.deleteLessonFilesAndRecord(studentId, lessonId)
        call.resolve(JSObject().put("deleted", true))
    }

    @PluginMethod
    fun updateOfflineProgress(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        val lessonId = call.getString("lessonId").orEmpty().trim()
        val lastPositionMs = readLongArg(call, "lastPositionMs", 0L)
        val completed = call.getBoolean("completed") ?: false
        if (studentId.isEmpty() || lessonId.isEmpty()) {
            call.reject("studentId and lessonId are required")
            return
        }
        val updated = vault.updatePlaybackProgress(studentId, lessonId, lastPositionMs, completed)
        call.resolve(JSObject().put("updated", updated != null))
    }

    @PluginMethod
    fun clearStudentDownloads(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        for ((k, job) in activeJobs) {
            if (studentId.isEmpty() || job.studentId == studentId) {
                job.cancelled.set(true)
                try {
                    job.connection?.disconnect()
                } catch (_: Exception) {
                }
                job.future?.cancel(true)
                activeJobs.remove(k)
            }
        }
        val removed = if (studentId.isNotEmpty()) {
            vault.clearStudentDownloads(studentId)
        } else {
            vault.clearAllDownloads()
        }
        call.resolve(JSObject().put("cleared", true).put("removedCount", removed))
    }

    @PluginMethod
    fun getStorageStats(call: PluginCall) {
        val studentId = call.getString("studentId").orEmpty().trim()
        call.resolve(
            JSObject().apply {
                put("usedBytes", if (studentId.isNotEmpty()) vault.getTotalUsedBytes(studentId) else 0L)
                put("availableBytes", vault.getAvailableStorageBytes())
                put("safetyBufferBytes", OfflineVideoVault.STORAGE_SAFETY_BUFFER_BYTES)
            }
        )
    }

    private fun emitProgress(
        lessonId: String,
        downloadId: String,
        percent: Int,
        bytesDownloaded: Long,
        totalBytes: Long
    ) {
        val payload = JSObject().apply {
            put("lessonId", lessonId)
            put("downloadId", downloadId)
            put("status", OfflineVideoVault.STATUS_DOWNLOADING)
            put("percent", percent)
            put("bytesDownloaded", bytesDownloaded)
            put("totalBytes", totalBytes)
        }
        notifyListeners("downloadProgress", payload, true)
    }

    private fun emitStateChanged(
        lessonId: String,
        downloadId: String,
        status: String,
        percent: Int,
        bytesDownloaded: Long,
        totalBytes: Long,
        errorCode: String,
        errorMessage: String,
        verifiedChecksum: String = ""
    ) {
        val payload = JSObject().apply {
            put("lessonId", lessonId)
            put("downloadId", downloadId)
            put("status", status)
            put("percent", percent)
            put("bytesDownloaded", bytesDownloaded)
            put("totalBytes", totalBytes)
            put("errorCode", errorCode)
            put("errorMessage", errorMessage)
            if (verifiedChecksum.isNotEmpty()) {
                put("verifiedChecksum", verifiedChecksum)
            }
        }
        notifyListeners("downloadStateChanged", payload, true)
    }
}
