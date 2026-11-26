package `in`.class10lms.ssc

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import java.io.EOFException
import java.io.IOException
import java.io.RandomAccessFile
import javax.crypto.Cipher

/**
 * Custom AndroidX Media3 DataSource that decrypts AES-256-CTR encrypted MP4 files on-the-fly
 * directly from app-private storage (`noBackupFilesDir/offline_lessons/`) using a Keystore-wrapped DEK.
 *
 * Security & Performance:
 * - Accepts ONLY internal scheme `lms-offline://<lessonId>` (zero file:// or public content:// URLs).
 * - O(1) random-access seeking via CtrSeekCipher.createCipherAtOffset() — never buffers full MP4s in RAM.
 * - Playback remains 100% inside LmsMedia3PlayerActivity with FLAG_SECURE, watermark & A15 guard.
 */
@UnstableApi
class EncryptedOfflineDataSource(
    private val vault: OfflineVideoVault,
    private val studentId: String,
    private val expectedLessonId: String
) : BaseDataSource(/* isNetwork = */ false) {

    companion object {
        const val SCHEME = "lms-offline"

        fun buildInternalUri(lessonId: String): Uri =
            Uri.parse("$SCHEME://${OfflineVideoVault.sanitizeId(lessonId)}")
    }

    class Factory(
        context: Context,
        private val studentId: String,
        private val expectedLessonId: String
    ) : DataSource.Factory {
        private val vault = OfflineVideoVault(context.applicationContext)

        override fun createDataSource(): DataSource =
            EncryptedOfflineDataSource(vault, studentId, expectedLessonId)
    }

    private var uri: Uri? = null
    private var raf: RandomAccessFile? = null
    private var cipher: Cipher? = null
    private var credentials: DecryptionCredentials? = null
    private var currentPlaintextPos: Long = 0L
    private var bytesRemaining: Long = 0L
    private var opened: Boolean = false
    private var scratchReadBuf: ByteArray = ByteArray(64 * 1024)

    override fun open(dataSpec: DataSpec): Long {
        val reqUri = dataSpec.uri
        if (reqUri.scheme != SCHEME) {
            throw IOException("Blocked unauthorized offline URI scheme: ${reqUri.scheme}")
        }
        val uriLessonId = OfflineVideoVault.sanitizeId(reqUri.host.orEmpty())
        val safeExpected = OfflineVideoVault.sanitizeId(expectedLessonId)
        if (uriLessonId.isEmpty() || uriLessonId != safeExpected) {
            throw IOException("Offline media URI lesson mismatch")
        }

        uri = reqUri
        transferInitializing(dataSpec)

        try {
            val creds = vault.openDecryptionCredentials(studentId, safeExpected)
            credentials = creds
            val fileLength = creds.plaintextSize
            val position = dataSpec.position
            if (position < 0L || position > fileLength) {
                throw EOFException("Requested seek position $position exceeds file length $fileLength")
            }

            val accessFile = RandomAccessFile(creds.file, "r")
            raf = accessFile
            currentPlaintextPos = position

            if (creds.cipherFormat == OfflineVideoVault.CIPHER_FORMAT_V1_CTR) {
                accessFile.seek(position)
                cipher = CtrSeekCipher.createCipherAtOffset(Cipher.DECRYPT_MODE, creds.dek, creds.nonceOrSalt, position)
            } else {
                cipher = null
            }

            bytesRemaining = if (dataSpec.length != C.LENGTH_UNSET.toLong()) {
                minOf(dataSpec.length, fileLength - position)
            } else {
                fileLength - position
            }
            opened = true
            transferStarted(dataSpec)
            return bytesRemaining
        } catch (ex: IOException) {
            close()
            throw ex
        } catch (ex: Exception) {
            close()
            throw IOException("Failed to open encrypted offline lesson: ${ex.message}", ex)
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (bytesRemaining == 0L) return C.RESULT_END_OF_INPUT

        val accessFile = raf ?: throw IOException("EncryptedOfflineDataSource is not open")
        val creds = credentials ?: throw IOException("Decryption credentials not loaded")
        val toRead = minOf(bytesRemaining, length.toLong()).toInt()

        if (creds.cipherFormat == OfflineVideoVault.CIPHER_FORMAT_V1_CTR) {
            val activeCipher = cipher ?: throw IOException("CTR Cipher is not initialized")
            if (scratchReadBuf.size < toRead) {
                scratchReadBuf = ByteArray(toRead)
            }

            val readCount = accessFile.read(scratchReadBuf, 0, toRead)
            if (readCount == -1) {
                return C.RESULT_END_OF_INPUT
            }

            val decrypted = activeCipher.update(scratchReadBuf, 0, readCount, buffer, offset)
            bytesRemaining -= readCount
            currentPlaintextPos += readCount
            bytesTransferred(decrypted)
            return decrypted
        } else {
            // Authenticated V2 Chunked GCM read:
            // Verifies per-chunk 16-byte GCM tag + AAD before returning any decrypted bytes to Media3.
            val slice = try {
                AuthenticatedChunkedCipher.readPlaintextRange(
                    encryptedRaf = accessFile,
                    reqOffset = currentPlaintextPos,
                    reqLength = toRead,
                    dek = creds.dek,
                    baseSalt = creds.nonceOrSalt,
                    lessonId = creds.lessonId,
                    studentId = creds.studentId,
                    totalPlaintextSize = creds.plaintextSize
                )
            } catch (aeadEx: Exception) {
                throw IOException(
                    "Corrupted offline video chunk: GCM authentication tag verification failed (${aeadEx.message})",
                    aeadEx
                )
            }

            if (slice.isEmpty()) {
                return C.RESULT_END_OF_INPUT
            }

            System.arraycopy(slice, 0, buffer, offset, slice.size)
            bytesRemaining -= slice.size
            currentPlaintextPos += slice.size
            bytesTransferred(slice.size)
            return slice.size
        }
    }

    override fun getUri(): Uri? = uri

    override fun close() {
        uri = null
        cipher = null
        credentials?.dek?.fill(0)
        credentials = null
        try {
            raf?.close()
        } catch (_: IOException) {
            // Ignore close errors
        } finally {
            raf = null
            if (opened) {
                opened = false
                transferEnded()
            }
        }
    }
}

