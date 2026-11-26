package `in`.class10lms.ssc

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import javax.crypto.Cipher

/**
 * Unit tests for Phase 12 Seekable AES-256-CTR Offline Video Encryption & Integrity Verification.
 * Proves:
 * - Encrypted MP4 bytes on disk are ciphertext (not plaintext / unplayable externally)
 * - O(1) random-access seeking decrypts arbitrary unaligned byte offsets identically for Media3
 * - Full-file streaming SHA-256 detects both valid downloads and 1-byte corruption
 * - Resumable encryption continues cleanly across chunk/Range interruptions
 */
class OfflineCryptoEngineTest {

    private fun buildSyntheticMp4Bytes(sizeBytes: Int = 128 * 1024 + 37): ByteArray {
        val data = ByteArray(sizeBytes)
        // ISO Base Media ftyp box header at offset 4..7
        data[0] = 0x00; data[1] = 0x00; data[2] = 0x00; data[3] = 0x18
        data[4] = 'f'.code.toByte(); data[5] = 't'.code.toByte(); data[6] = 'y'.code.toByte(); data[7] = 'p'.code.toByte()
        data[8] = 'i'.code.toByte(); data[9] = 's'.code.toByte(); data[10] = 'o'.code.toByte(); data[11] = 'm'.code.toByte()
        for (i in 12 until sizeBytes) {
            data[i] = ((i * 31 + 17) and 0xFF).toByte()
        }
        return data
    }

    private fun sha256(bytes: ByteArray): String =
        CtrSeekCipher.bytesToHex(MessageDigest.getInstance("SHA-256").digest(bytes))

    @Test
    fun encryptsDiskBytesAndDecryptsArbitraryUnalignedMedia3SeekOffsetsIdentically() {
        val plaintext = buildSyntheticMp4Bytes(131_109) // > 2 x 64KB + unaligned tail
        val key = CtrSeekCipher.generateAes256KeyBytes()
        val nonce = CtrSeekCipher.generateNonce16()

        // Encrypt in streaming chunks from offset 0
        val encCipher = CtrSeekCipher.createCipherAtOffset(Cipher.ENCRYPT_MODE, key, nonce, 0L)
        val ciphertext = encCipher.doFinal(plaintext)

        // Ciphertext must NOT contain raw MP4 "ftyp" header on disk
        assertEquals(plaintext.size, ciphertext.size)
        val headerSlice = String(ciphertext.copyOfRange(4, 8), Charsets.US_ASCII)
        assertNotEquals("ftyp", headerSlice)

        // Verify random-access decryption across aligned and unaligned seek positions
        val testRanges = listOf(
            0 to 32,
            7 to 45,
            15 to 17,
            16 to 64,
            17 to 100,
            4099 to 513,
            65_535 to 1024,
            130_000 to 1109
        )
        for ((offset, len) in testRanges) {
            val decCipher = CtrSeekCipher.createCipherAtOffset(Cipher.DECRYPT_MODE, key, nonce, offset.toLong())
            val sliceCipher = ciphertext.copyOfRange(offset, offset + len)
            val decrypted = decCipher.doFinal(sliceCipher)
            val expected = plaintext.copyOfRange(offset, offset + len)
            assertArrayEquals("Mismatch at seek offset=$offset len=$len", expected, decrypted)
        }
    }

    @Test
    fun supportsResumedEncryptionAfterNetworkInterruptionAndPassesSha256Verification() {
        val plaintext = buildSyntheticMp4Bytes(95_003)
        val expectedHash = sha256(plaintext)
        val key = CtrSeekCipher.generateAes256KeyBytes()
        val nonce = CtrSeekCipher.generateNonce16()

        val splitOffset = 37_123 // Intentionally NOT a multiple of 16 bytes
        val part1Plain = plaintext.copyOfRange(0, splitOffset)
        val part2Plain = plaintext.copyOfRange(splitOffset, plaintext.size)

        val tempFile = File.createTempFile("offline_resume_test_", ".enc")
        try {
            // Part 1 written before network drops
            val enc1 = CtrSeekCipher.createCipherAtOffset(Cipher.ENCRYPT_MODE, key, nonce, 0L)
            FileOutputStream(tempFile, false).use { it.write(enc1.doFinal(part1Plain)) }

            // Part 2 resumed via HTTP Range: bytes=37123-
            val resumeOffset = tempFile.length()
            assertEquals(splitOffset.toLong(), resumeOffset)
            val enc2 = CtrSeekCipher.createCipherAtOffset(Cipher.ENCRYPT_MODE, key, nonce, resumeOffset)
            FileOutputStream(tempFile, true).use { it.write(enc2.doFinal(part2Plain)) }

            // Full streaming SHA-256 verification must match original MP4 hash & exact byte length
            val (actualHash, verifiedSize) = CtrSeekCipher.computeDecryptedSha256AndSize(tempFile, key, nonce)
            assertEquals(plaintext.size.toLong(), verifiedSize)
            assertEquals(expectedHash, actualHash)
        } finally {
            tempFile.delete()
        }
    }

    @Test
    fun detectsSingleByteCorruptionViaStreamingSha256Verification() {
        val plaintext = buildSyntheticMp4Bytes(40_960)
        val expectedHash = sha256(plaintext)
        val key = CtrSeekCipher.generateAes256KeyBytes()
        val nonce = CtrSeekCipher.generateNonce16()

        val encCipher = CtrSeekCipher.createCipherAtOffset(Cipher.ENCRYPT_MODE, key, nonce, 0L)
        val ciphertext = encCipher.doFinal(plaintext)
        // Flip 1 bit mid-file to simulate corruption/tampering
        ciphertext[12_345] = (ciphertext[12_345].toInt() xor 0x01).toByte()

        val tempFile = File.createTempFile("offline_corrupt_test_", ".enc")
        try {
            tempFile.writeBytes(ciphertext)
            val (actualHash, verifiedSize) = CtrSeekCipher.computeDecryptedSha256AndSize(tempFile, key, nonce)
            assertEquals(plaintext.size.toLong(), verifiedSize)
            assertFalse("Corrupted ciphertext must NEVER match expected SHA-256", actualHash.equals(expectedHash, true))
        } finally {
            tempFile.delete()
        }
    }

    @Test
    fun counterAdditionHandlesMultiByteCarryCorrectly() {
        val nonce = ByteArray(16) { 0x00 }
        nonce[15] = 0xFF.toByte()
        nonce[14] = 0xFF.toByte()
        val next = CtrSeekCipher.deriveCounterForBlock(nonce, 1L)
        assertEquals(0x00.toByte(), next[15])
        assertEquals(0x00.toByte(), next[14])
        assertEquals(0x01.toByte(), next[13])
        assertTrue(OfflineVideoVault.sanitizeId("../evil/lesson-123").none { it == '.' || it == '/' })
    }
}

