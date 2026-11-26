package `in`.class10lms.ssc

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import javax.crypto.AEADBadTagException

/**
 * Rigorous Unit & Benchmark Tests for Phase 2 Authenticated Chunked AES-256-GCM.
 *
 * Verifies:
 * - 64 KB chunk authenticated framing with 16-byte GCM tag
 * - Bit-flip tampering detection at chunk level
 * - Chunk-swapping / reordering prevention via AAD chunkIndex binding
 * - Multi-student isolation via AAD studentId binding
 * - Multi-lesson isolation via AAD lessonId binding
 * - High-speed random-access seekable range reads for AndroidX Media3
 * - Real throughput benchmark on Small, Medium, and Large video files
 */
class AuthenticatedChunkedCipherTest {

    private fun generateSyntheticVideoBytes(size: Int): ByteArray {
        val bytes = ByteArray(size)
        // ISO BMFF 'ftyp' box
        bytes[0] = 0x00; bytes[1] = 0x00; bytes[2] = 0x00; bytes[3] = 0x18
        bytes[4] = 'f'.code.toByte(); bytes[5] = 't'.code.toByte(); bytes[6] = 'y'.code.toByte(); bytes[7] = 'p'.code.toByte()
        bytes[8] = 'i'.code.toByte(); bytes[9] = 's'.code.toByte(); bytes[10] = 'o'.code.toByte(); bytes[11] = 'm'.code.toByte()
        for (i in 12 until size) {
            bytes[i] = ((i * 37 + 19) and 0xFF).toByte()
        }
        return bytes
    }

    @Test
    fun encryptsAndDecryptsArbitraryUnalignedMedia3SeekRanges() {
        val plaintextSize = 200_000 // > 3 chunks (64KB * 3 = 192KB + 8KB remainder)
        val plaintext = generateSyntheticVideoBytes(plaintextSize)
        val dek = AuthenticatedChunkedCipher.generateDek()
        val salt = AuthenticatedChunkedCipher.generateSalt8()
        val lessonId = "lesson-math-101"
        val studentId = "student-alice-uuid"

        val srcFile = File.createTempFile("auth_src_", ".mp4")
        val encFile = File.createTempFile("auth_enc_", ".enc2")
        try {
            srcFile.writeBytes(plaintext)
            val writtenBytes = AuthenticatedChunkedCipher.encryptFile(
                sourceFile = srcFile,
                targetEncryptedFile = encFile,
                dek = dek,
                baseSalt = salt,
                lessonId = lessonId,
                studentId = studentId
            )
            assertEquals(plaintextSize.toLong(), writtenBytes)

            // Calculate expected file expansion: 4 chunks * 16 bytes tag = 64 bytes overhead
            val expectedPhysicalSize = plaintextSize + (4 * AuthenticatedChunkedCipher.GCM_TAG_SIZE)
            assertEquals(expectedPhysicalSize.toLong(), encFile.length())

            val raf = RandomAccessFile(encFile, "r")
            raf.use { reader ->
                // Test 1: Full file read
                val fullRead = AuthenticatedChunkedCipher.readPlaintextRange(
                    encryptedRaf = reader,
                    reqOffset = 0L,
                    reqLength = plaintextSize,
                    dek = dek,
                    baseSalt = salt,
                    lessonId = lessonId,
                    studentId = studentId,
                    totalPlaintextSize = plaintextSize.toLong()
                )
                assertArrayEquals("Full decrypted stream mismatch", plaintext, fullRead)

                // Test 2: Unaligned random-access seek positions across chunk boundaries
                val testRanges = listOf(
                    0L to 100,
                    15L to 30,
                    65_530L to 20, // Straddles chunk 0 and chunk 1
                    131_070L to 30, // Straddles chunk 1 and chunk 2
                    195_000L to 5_000, // Read inside last chunk
                    0L to 1,
                    (plaintextSize - 10).toLong() to 10 // Last 10 bytes of file
                )

                for ((offset, len) in testRanges) {
                    val slice = AuthenticatedChunkedCipher.readPlaintextRange(
                        encryptedRaf = reader,
                        reqOffset = offset,
                        reqLength = len,
                        dek = dek,
                        baseSalt = salt,
                        lessonId = lessonId,
                        studentId = studentId,
                        totalPlaintextSize = plaintextSize.toLong()
                    )
                    val expectedSlice = plaintext.copyOfRange(offset.toInt(), (offset + len).toInt())
                    assertArrayEquals("Seek mismatch at offset=$offset len=$len", expectedSlice, slice)
                }
            }
        } finally {
            srcFile.delete()
            encFile.delete()
        }
    }

    @Test
    fun detectsSingleBitCiphertextTamperingWithAeadBadTagException() {
        val plaintext = generateSyntheticVideoBytes(100_000)
        val dek = AuthenticatedChunkedCipher.generateDek()
        val salt = AuthenticatedChunkedCipher.generateSalt8()
        val lessonId = "lesson-sci-202"
        val studentId = "student-bob-uuid"

        val srcFile = File.createTempFile("tamper_src_", ".mp4")
        val encFile = File.createTempFile("tamper_enc_", ".enc2")
        try {
            srcFile.writeBytes(plaintext)
            AuthenticatedChunkedCipher.encryptFile(srcFile, encFile, dek, salt, lessonId, studentId)

            // Corrupt 1 byte in chunk 0 ciphertext
            val encBytes = encFile.readBytes()
            encBytes[500] = (encBytes[500].toInt() xor 0x01).toByte()
            encFile.writeBytes(encBytes)

            val raf = RandomAccessFile(encFile, "r")
            raf.use { reader ->
                try {
                    AuthenticatedChunkedCipher.readPlaintextRange(
                        encryptedRaf = reader,
                        reqOffset = 0L,
                        reqLength = 1000,
                        dek = dek,
                        baseSalt = salt,
                        lessonId = lessonId,
                        studentId = studentId,
                        totalPlaintextSize = plaintext.size.toLong()
                    )
                    fail("Must throw AEADBadTagException on corrupted ciphertext")
                } catch (e: Exception) {
                    assertTrue(
                        "Expected AEADBadTagException but got: ${e.javaClass.simpleName}",
                        e is AEADBadTagException || e.cause is AEADBadTagException
                    )
                }
            }
        } finally {
            srcFile.delete()
            encFile.delete()
        }
    }

    @Test
    fun detectsChunkSwappingAndReorderingViaAadBinding() {
        val plaintext = generateSyntheticVideoBytes(140_000) // 2 full chunks (64KB each) + tail
        val dek = AuthenticatedChunkedCipher.generateDek()
        val salt = AuthenticatedChunkedCipher.generateSalt8()
        val lessonId = "lesson-swap-303"
        val studentId = "student-alice"

        val srcFile = File.createTempFile("swap_src_", ".mp4")
        val encFile = File.createTempFile("swap_enc_", ".enc2")
        try {
            srcFile.writeBytes(plaintext)
            AuthenticatedChunkedCipher.encryptFile(srcFile, encFile, dek, salt, lessonId, studentId)

            // Swap Chunk 0 and Chunk 1 in physical file
            val chunkSize = AuthenticatedChunkedCipher.CHUNK_TOTAL_SIZE
            val encBytes = encFile.readBytes()
            val chunk0 = encBytes.copyOfRange(0, chunkSize)
            val chunk1 = encBytes.copyOfRange(chunkSize, chunkSize * 2)

            System.arraycopy(chunk1, 0, encBytes, 0, chunkSize)
            System.arraycopy(chunk0, 0, encBytes, chunkSize, chunkSize)
            encFile.writeBytes(encBytes)

            val raf = RandomAccessFile(encFile, "r")
            raf.use { reader ->
                try {
                    // Try to read from start
                    AuthenticatedChunkedCipher.readPlaintextRange(
                        encryptedRaf = reader,
                        reqOffset = 0L,
                        reqLength = 500,
                        dek = dek,
                        baseSalt = salt,
                        lessonId = lessonId,
                        studentId = studentId,
                        totalPlaintextSize = plaintext.size.toLong()
                    )
                    fail("Must reject swapped/reordered chunk due to AAD chunkIndex mismatch")
                } catch (e: Exception) {
                    assertTrue(e is AEADBadTagException || e.cause is AEADBadTagException)
                }
            }
        } finally {
            srcFile.delete()
            encFile.delete()
        }
    }

    @Test
    fun enforcesStudentAndLessonIsolationViaAadBinding() {
        val plaintext = generateSyntheticVideoBytes(80_000)
        val dek = AuthenticatedChunkedCipher.generateDek()
        val salt = AuthenticatedChunkedCipher.generateSalt8()
        val lessonId = "lesson-physics-404"
        val authorizedStudent = "student-authorized-id"
        val attackerStudent = "student-attacker-id"

        val srcFile = File.createTempFile("isol_src_", ".mp4")
        val encFile = File.createTempFile("isol_enc_", ".enc2")
        try {
            srcFile.writeBytes(plaintext)
            AuthenticatedChunkedCipher.encryptFile(srcFile, encFile, dek, salt, lessonId, authorizedStudent)

            val raf = RandomAccessFile(encFile, "r")
            raf.use { reader ->
                // Attacker attempts to read with attacker studentId
                try {
                    AuthenticatedChunkedCipher.readPlaintextRange(
                        encryptedRaf = reader,
                        reqOffset = 0L,
                        reqLength = 1000,
                        dek = dek,
                        baseSalt = salt,
                        lessonId = lessonId,
                        studentId = attackerStudent,
                        totalPlaintextSize = plaintext.size.toLong()
                    )
                    fail("Attacker studentId must fail AAD validation")
                } catch (e: Exception) {
                    assertTrue(e is AEADBadTagException || e.cause is AEADBadTagException)
                }

                // Attacker attempts to read under different lessonId
                try {
                    AuthenticatedChunkedCipher.readPlaintextRange(
                        encryptedRaf = reader,
                        reqOffset = 0L,
                        reqLength = 1000,
                        dek = dek,
                        baseSalt = salt,
                        lessonId = "lesson-wrong-505",
                        studentId = authorizedStudent,
                        totalPlaintextSize = plaintext.size.toLong()
                    )
                    fail("Wrong lessonId must fail AAD validation")
                } catch (e: Exception) {
                    assertTrue(e is AEADBadTagException || e.cause is AEADBadTagException)
                }
            }
        } finally {
            srcFile.delete()
            encFile.delete()
        }
    }

    @Test
    fun benchmarkPerformanceAcrossSmallMediumLargeBuffers() {
        // Measure encryption throughput, decryption throughput, and seek latency
        val testSizes = listOf(
            "Small (1 MB)" to 1 * 1024 * 1024,
            "Medium (5 MB)" to 5 * 1024 * 1024,
            "Large (15 MB)" to 15 * 1024 * 1024
        )

        val dek = AuthenticatedChunkedCipher.generateDek()
        val salt = AuthenticatedChunkedCipher.generateSalt8()
        val lessonId = "lesson-bench-999"
        val studentId = "student-bench-user"

        for ((label, size) in testSizes) {
            val plaintext = generateSyntheticVideoBytes(size)
            val srcFile = File.createTempFile("bench_src_", ".bin")
            val encFile = File.createTempFile("bench_enc_", ".bin")
            try {
                srcFile.writeBytes(plaintext)

                // 1. Measure Encryption Throughput
                val encStart = System.nanoTime()
                AuthenticatedChunkedCipher.encryptFile(srcFile, encFile, dek, salt, lessonId, studentId)
                val encNanos = System.nanoTime() - encStart
                val encMbPerSec = (size.toDouble() / (1024.0 * 1024.0)) / (encNanos.toDouble() / 1_000_000_000.0)

                val raf = RandomAccessFile(encFile, "r")
                raf.use { reader ->
                    // 2. Measure Full Decryption Throughput
                    val decStart = System.nanoTime()
                    val decrypted = AuthenticatedChunkedCipher.readPlaintextRange(
                        encryptedRaf = reader,
                        reqOffset = 0L,
                        reqLength = size,
                        dek = dek,
                        baseSalt = salt,
                        lessonId = lessonId,
                        studentId = studentId,
                        totalPlaintextSize = size.toLong()
                    )
                    val decNanos = System.nanoTime() - decStart
                    val decMbPerSec = (size.toDouble() / (1024.0 * 1024.0)) / (decNanos.toDouble() / 1_000_000_000.0)
                    assertEquals(size, decrypted.size)

                    // 3. Measure Random Seek Latency (50 random seeks)
                    val seekIterations = 50
                    val seekWindow = 32 * 1024 // 32 KB Media3 read buffer
                    val maxOffset = (size - seekWindow).coerceAtLeast(0).toLong()

                    val seekStart = System.nanoTime()
                    for (i in 0 until seekIterations) {
                        val seekPos = ((i * 7919) % (maxOffset + 1))
                        val slice = AuthenticatedChunkedCipher.readPlaintextRange(
                            encryptedRaf = reader,
                            reqOffset = seekPos,
                            reqLength = seekWindow,
                            dek = dek,
                            baseSalt = salt,
                            lessonId = lessonId,
                            studentId = studentId,
                            totalPlaintextSize = size.toLong()
                        )
                        assertEquals(minOf(seekWindow.toLong(), size - seekPos).toInt(), slice.size)
                    }
                    val seekTotalNanos = System.nanoTime() - seekStart
                    val avgSeekMs = (seekTotalNanos.toDouble() / seekIterations.toDouble()) / 1_000_000.0

                    println("[BENCHMARK $label] Encryption: %.1f MB/s | Decryption: %.1f MB/s | Avg Seek: %.2f ms".format(
                        encMbPerSec, decMbPerSec, avgSeekMs
                    ))
                    assertTrue("Encryption throughput must exceed 10 MB/s", encMbPerSec > 10.0)
                    assertTrue("Decryption throughput must exceed 10 MB/s", decMbPerSec > 10.0)
                    assertTrue("Seek latency must be under 50ms", avgSeekMs < 50.0)
                }
            } finally {
                srcFile.delete()
                encFile.delete()
            }
        }
    }
}
