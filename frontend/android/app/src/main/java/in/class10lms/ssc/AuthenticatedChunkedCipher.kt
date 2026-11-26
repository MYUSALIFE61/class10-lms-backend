package `in`.class10lms.ssc

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Phase 2 Authenticated Encryption Architecture: Chunked AES-256-GCM.
 *
 * Solves the integrity limitation of stream-based AES-CTR by verifying per-chunk
 * 128-bit authentication tags in O(1) time during random-access Media3 playback.
 *
 * Framing Specification:
 * - Plaintext chunk size: 64 KB (65,536 bytes).
 * - Per-chunk framing: [Ciphertext (up to 64 KB)][GCM Tag (16 bytes)].
 * - Physical chunk size: exactly 65,552 bytes (last chunk: remainingBytes + 16).
 * - Per-chunk IV (12 bytes): [8-byte per-video salt][4-byte big-endian chunkIndex].
 *   Guarantees unique IV per chunk under the same per-video DEK.
 * - Additional Authenticated Data (AAD): UTF-8 bytes of "c10v2|<lessonId>|<studentId>|<chunkIndex>".
 *   Guarantees chunks cannot be swapped, reordered, or stolen across lessons/students.
 */
object AuthenticatedChunkedCipher {
    const val CHUNK_DATA_SIZE = 64 * 1024 // 65,536 bytes
    const val GCM_TAG_SIZE = 16 // 16 bytes = 128 bits
    const val CHUNK_TOTAL_SIZE = CHUNK_DATA_SIZE + GCM_TAG_SIZE // 65,552 bytes
    const val GCM_IV_SIZE = 12 // 96 bits
    const val SALT_SIZE = 8 // 64 bits

    private val secureRandom = SecureRandom()

    fun generateDek(): ByteArray = ByteArray(32).also { secureRandom.nextBytes(it) }

    fun generateSalt8(): ByteArray = ByteArray(SALT_SIZE).also { secureRandom.nextBytes(it) }

    /**
     * Builds unique 12-byte IV for a chunk: salt (8 bytes) + chunkIndex (4 bytes big-endian).
     */
    fun deriveChunkIv(baseSalt: ByteArray, chunkIndex: Int): ByteArray {
        require(baseSalt.size == SALT_SIZE) { "Salt must be 8 bytes" }
        require(chunkIndex >= 0) { "chunkIndex must be non-negative" }
        val iv = ByteArray(GCM_IV_SIZE)
        System.arraycopy(baseSalt, 0, iv, 0, SALT_SIZE)
        ByteBuffer.wrap(iv, SALT_SIZE, 4).putInt(chunkIndex)
        return iv
    }

    /**
     * Builds Additional Authenticated Data (AAD) binding context:
     * "c10v2|<lessonId>|<studentId>|<chunkIndex>"
     */
    fun buildAad(lessonId: String, studentId: String, chunkIndex: Int): ByteArray {
        val safeLesson = OfflineVideoVault.sanitizeId(lessonId)
        val safeStudent = OfflineVideoVault.sanitizeId(studentId)
        return "c10v2|$safeLesson|$safeStudent|$chunkIndex".toByteArray(Charsets.UTF_8)
    }

    /**
     * Encrypts a single plaintext chunk with AES-256-GCM and appends the 16-byte authentication tag.
     */
    fun encryptChunk(
        plaintext: ByteArray,
        offset: Int,
        length: Int,
        dek: ByteArray,
        baseSalt: ByteArray,
        chunkIndex: Int,
        lessonId: String,
        studentId: String
    ): ByteArray {
        require(dek.size == 32) { "DEK must be 32 bytes" }
        require(length in 0..CHUNK_DATA_SIZE) { "Chunk length out of bounds: $length" }

        val iv = deriveChunkIv(baseSalt, chunkIndex)
        val aad = buildAad(lessonId, studentId, chunkIndex)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keySpec = SecretKeySpec(dek, "AES")
        val gcmSpec = GCMParameterSpec(GCM_TAG_SIZE * 8, iv)
        cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)
        cipher.updateAAD(aad)

        // doFinal produces ciphertext + tag appended
        return cipher.doFinal(plaintext, offset, length)
    }

    /**
     * Decrypts and authenticates a single chunk. Throws AEADBadTagException if ciphertext or AAD was tampered.
     */
    fun decryptChunk(
        chunkWithTag: ByteArray,
        offset: Int,
        length: Int,
        dek: ByteArray,
        baseSalt: ByteArray,
        chunkIndex: Int,
        lessonId: String,
        studentId: String
    ): ByteArray {
        require(dek.size == 32) { "DEK must be 32 bytes" }
        require(length >= GCM_TAG_SIZE) { "Chunk too small for GCM tag: $length" }

        val iv = deriveChunkIv(baseSalt, chunkIndex)
        val aad = buildAad(lessonId, studentId, chunkIndex)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keySpec = SecretKeySpec(dek, "AES")
        val gcmSpec = GCMParameterSpec(GCM_TAG_SIZE * 8, iv)
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)
        cipher.updateAAD(aad)

        return cipher.doFinal(chunkWithTag, offset, length)
    }

    /**
     * Encrypts an entire plaintext stream/file into chunked authenticated format (.enc2).
     */
    fun encryptFile(
        sourceFile: File,
        targetEncryptedFile: File,
        dek: ByteArray,
        baseSalt: ByteArray,
        lessonId: String,
        studentId: String
    ): Long {
        val inRaf = RandomAccessFile(sourceFile, "r")
        val outRaf = RandomAccessFile(targetEncryptedFile, "rw")
        val buf = ByteArray(CHUNK_DATA_SIZE)
        var chunkIndex = 0
        var totalPlaintextBytes = 0L

        inRaf.use { reader ->
            outRaf.use { writer ->
                writer.setLength(0L)
                while (true) {
                    val read = reader.read(buf)
                    if (read <= 0) break
                    val encrypted = encryptChunk(
                        plaintext = buf,
                        offset = 0,
                        length = read,
                        dek = dek,
                        baseSalt = baseSalt,
                        chunkIndex = chunkIndex,
                        lessonId = lessonId,
                        studentId = studentId
                    )
                    writer.write(encrypted)
                    totalPlaintextBytes += read
                    chunkIndex++
                }
            }
        }
        return totalPlaintextBytes
    }

    /**
     * Random-access seekable range reader for Media3.
     * Decrypts only the required chunks, verifies GCM tags, and slices the requested byte range.
     *
     * @param encryptedRaf Open read-only RandomAccessFile of the .enc2 file.
     * @param reqOffset Logical plaintext start offset.
     * @param reqLength Logical plaintext length to read.
     * @param totalPlaintextSize Total size of the original unencrypted video.
     */
    fun readPlaintextRange(
        encryptedRaf: RandomAccessFile,
        reqOffset: Long,
        reqLength: Int,
        dek: ByteArray,
        baseSalt: ByteArray,
        lessonId: String,
        studentId: String,
        totalPlaintextSize: Long
    ): ByteArray {
        require(reqOffset >= 0L) { "Offset must be non-negative" }
        if (reqLength <= 0 || reqOffset >= totalPlaintextSize) return ByteArray(0)

        val actualLen = minOf(reqLength.toLong(), totalPlaintextSize - reqOffset).toInt()
        val endOffset = reqOffset + actualLen - 1

        val startChunkIdx = (reqOffset / CHUNK_DATA_SIZE).toInt()
        val endChunkIdx = (endOffset / CHUNK_DATA_SIZE).toInt()

        val output = ByteArray(actualLen)
        var outPos = 0

        val chunkBuf = ByteArray(CHUNK_TOTAL_SIZE)

        for (chunkIdx in startChunkIdx..endChunkIdx) {
            val chunkPlainOffset = chunkIdx.toLong() * CHUNK_DATA_SIZE
            val chunkPlainLen = minOf(
                CHUNK_DATA_SIZE.toLong(),
                totalPlaintextSize - chunkPlainOffset
            ).toInt()
            val chunkPhysicalSize = chunkPlainLen + GCM_TAG_SIZE
            val chunkPhysicalOffset = chunkIdx.toLong() * CHUNK_TOTAL_SIZE

            // Seek to physical chunk start
            encryptedRaf.seek(chunkPhysicalOffset)
            val bytesRead = encryptedRaf.read(chunkBuf, 0, chunkPhysicalSize)
            if (bytesRead != chunkPhysicalSize) {
                throw AEADBadTagException("Incomplete chunk $chunkIdx (read $bytesRead expected $chunkPhysicalSize)")
            }

            // Authenticate and decrypt chunk
            val decrypted = decryptChunk(
                chunkWithTag = chunkBuf,
                offset = 0,
                length = chunkPhysicalSize,
                dek = dek,
                baseSalt = baseSalt,
                chunkIndex = chunkIdx,
                lessonId = lessonId,
                studentId = studentId
            )

            // Calculate overlap between decrypted chunk and requested window
            val sliceStartInChunk = if (chunkIdx == startChunkIdx) (reqOffset - chunkPlainOffset).toInt() else 0
            val sliceEndInChunk = if (chunkIdx == endChunkIdx) (endOffset - chunkPlainOffset).toInt() else (chunkPlainLen - 1)
            val sliceLen = (sliceEndInChunk - sliceStartInChunk + 1).coerceAtLeast(0)

            System.arraycopy(decrypted, sliceStartInChunk, output, outPos, sliceLen)
            outPos += sliceLen
        }

        return output
    }

    /**
     * Calculates the expected physical encrypted file size on disk for a given plaintext size.
     */
    fun getExpectedPhysicalSize(plaintextSize: Long): Long {
        if (plaintextSize <= 0L) return 0L
        val fullChunks = plaintextSize / CHUNK_DATA_SIZE
        val remainder = plaintextSize % CHUNK_DATA_SIZE
        val chunkCount = if (remainder > 0L) fullChunks + 1 else fullChunks
        return plaintextSize + (chunkCount * GCM_TAG_SIZE)
    }

    /**
     * Streams through all chunks of an encrypted file, verifies every chunk's GCM tag,
     * and computes the SHA-256 digest of the authenticated plaintext.
     * Throws AEADBadTagException if any chunk fails authentication.
     */
    fun computeDecryptedSha256AndSize(
        encryptedFile: File,
        dek: ByteArray,
        baseSalt: ByteArray,
        lessonId: String,
        studentId: String,
        expectedPlaintextSize: Long
    ): Pair<String, Long> {
        val expectedPhysSize = getExpectedPhysicalSize(expectedPlaintextSize)
        if (encryptedFile.length() != expectedPhysSize) {
            throw AEADBadTagException("File length mismatch: actual=${encryptedFile.length()} expected=$expectedPhysSize")
        }

        val md = java.security.MessageDigest.getInstance("SHA-256")
        val raf = RandomAccessFile(encryptedFile, "r")
        val chunkBuf = ByteArray(CHUNK_TOTAL_SIZE)
        var totalPlaintext = 0L

        val fullChunks = (expectedPlaintextSize / CHUNK_DATA_SIZE).toInt()
        val remainder = (expectedPlaintextSize % CHUNK_DATA_SIZE).toInt()
        val totalChunks = if (remainder > 0) fullChunks + 1 else fullChunks

        raf.use { reader ->
            for (chunkIdx in 0 until totalChunks) {
                val plainChunkLen = if (chunkIdx == totalChunks - 1 && remainder > 0) remainder else CHUNK_DATA_SIZE
                val physChunkLen = plainChunkLen + GCM_TAG_SIZE

                reader.seek(chunkIdx.toLong() * CHUNK_TOTAL_SIZE)
                val read = reader.read(chunkBuf, 0, physChunkLen)
                if (read != physChunkLen) {
                    throw AEADBadTagException("Truncated chunk at index $chunkIdx")
                }

                val decrypted = decryptChunk(
                    chunkWithTag = chunkBuf,
                    offset = 0,
                    length = physChunkLen,
                    dek = dek,
                    baseSalt = baseSalt,
                    chunkIndex = chunkIdx,
                    lessonId = lessonId,
                    studentId = studentId
                )

                md.update(decrypted)
                totalPlaintext += decrypted.size
            }
        }

        return CtrSeekCipher.bytesToHex(md.digest()) to totalPlaintext
    }
}
