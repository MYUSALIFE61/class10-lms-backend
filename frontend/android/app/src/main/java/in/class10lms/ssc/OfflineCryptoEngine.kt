package `in`.class10lms.ssc

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.io.FileInputStream
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Seekable AES-256-CTR streaming cipher engine (pure JVM/Android compatible for JUnit + runtime).
 *
 * Design:
 * - Per-video 256-bit DEK + 128-bit initial CTR counter are generated with SecureRandom.
 * - Payload bytes are encrypted/decrypted with AES/CTR/NoPadding in 64 KB chunks so large
 *   educational MP4s never load into RAM AND AndroidX Media3 can seek in O(1) time to any byte offset.
 * - Full-file integrity is verified via SHA-256 over the decrypted plaintext bytes before any
 *   download is marked complete.
 */
object CtrSeekCipher {
    const val AES_BLOCK_SIZE = 16
    private const val STREAM_BUFFER_BYTES = 64 * 1024
    private val secureRandom = SecureRandom()

    fun generateAes256KeyBytes(): ByteArray = ByteArray(32).also { secureRandom.nextBytes(it) }

    fun generateNonce16(): ByteArray = ByteArray(16).also { secureRandom.nextBytes(it) }

    /**
     * Computes big-endian 128-bit counter addition: (baseNonce + blockIndex) mod 2^128.
     * Matches JCE / Conscrypt AES/CTR/NoPadding block counter increment semantics exactly.
     */
    fun deriveCounterForBlock(baseNonce: ByteArray, blockIndex: Long): ByteArray {
        require(baseNonce.size == AES_BLOCK_SIZE) { "CTR nonce must be 16 bytes" }
        require(blockIndex >= 0L) { "blockIndex must be non-negative" }

        val result = baseNonce.copyOf()
        var carry = blockIndex
        var idx = AES_BLOCK_SIZE - 1
        while (idx >= 0 && carry > 0L) {
            val sum = (result[idx].toInt() and 0xFF) + (carry and 0xFFL)
            result[idx] = (sum and 0xFFL).toByte()
            carry = (carry ushr 8) + (sum ushr 8)
            idx--
        }
        return result
    }

    /**
     * Creates an AES/CTR/NoPadding cipher positioned at an arbitrary plaintext/ciphertext byte offset.
     */
    fun createCipherAtOffset(
        mode: Int,
        keyBytes: ByteArray,
        baseNonce: ByteArray,
        byteOffset: Long
    ): Cipher {
        require(keyBytes.size == 32) { "AES-256 key must be 32 bytes" }
        require(byteOffset >= 0L) { "byteOffset must be non-negative" }

        val blockIndex = byteOffset / AES_BLOCK_SIZE
        val intraBlockSkip = (byteOffset % AES_BLOCK_SIZE).toInt()
        val counter = deriveCounterForBlock(baseNonce, blockIndex)

        val cipher = Cipher.getInstance("AES/CTR/NoPadding")
        cipher.init(mode, SecretKeySpec(keyBytes, "AES"), IvParameterSpec(counter))
        if (intraBlockSkip > 0) {
            // Advance keystream inside the first 16-byte block so next byte aligns to byteOffset
            cipher.update(ByteArray(intraBlockSkip))
        }
        return cipher
    }

    /**
     * Streams an encrypted file in 64 KB chunks through AES-256-CTR decryption and computes the
     * SHA-256 hex digest of the plaintext along with total verified byte size.
     */
    fun computeDecryptedSha256AndSize(
        encryptedFile: File,
        keyBytes: ByteArray,
        baseNonce: ByteArray
    ): Pair<String, Long> {
        val cipher = createCipherAtOffset(Cipher.DECRYPT_MODE, keyBytes, baseNonce, 0L)
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(STREAM_BUFFER_BYTES)
        var totalBytes = 0L

        FileInputStream(encryptedFile).use { fis ->
            while (true) {
                val read = fis.read(buffer)
                if (read <= 0) break
                val plain = cipher.update(buffer, 0, read)
                if (plain != null && plain.isNotEmpty()) {
                    digest.update(plain)
                    totalBytes += plain.size
                }
            }
            val tail = cipher.doFinal()
            if (tail != null && tail.isNotEmpty()) {
                digest.update(tail)
                totalBytes += tail.size
            }
        }

        return bytesToHex(digest.digest()) to totalBytes
    }

    fun sha256Hex(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return bytesToHex(md.digest(input.toByteArray(Charsets.UTF_8)))
    }

    fun bytesToHex(bytes: ByteArray): String {
        val chars = CharArray(bytes.size * 2)
        val hex = "0123456789abcdef"
        for (i in bytes.indices) {
            val v = bytes[i].toInt() and 0xFF
            chars[i * 2] = hex[v ushr 4]
            chars[i * 2 + 1] = hex[v and 0x0F]
        }
        return String(chars)
    }
}

/**
 * Hardware-backed Android Keystore AES-256-GCM Master Key wrapper for per-video DEKs.
 * The master key never leaves Android Keystore; wrapped DEKs are stored in EncryptedSharedPreferences.
 */
object AndroidKeystoreKeyWrapper {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val MASTER_KEY_ALIAS = "class10_lms_offline_video_master_v1"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_LEN = 12

    @Synchronized
    private fun getOrCreateMasterKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(MASTER_KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            MASTER_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGen.init(spec)
        return keyGen.generateKey()
    }

    fun wrapDek(dekBytes: ByteArray): String {
        val masterKey = getOrCreateMasterKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, masterKey)
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(dekBytes)
        val combined = ByteArray(iv.size + ciphertext.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ciphertext, 0, combined, iv.size, ciphertext.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    fun unwrapDek(wrappedBase64: String): ByteArray {
        val combined = Base64.decode(wrappedBase64, Base64.NO_WRAP)
        require(combined.size > GCM_IV_LEN) { "Malformed wrapped DEK payload" }
        val iv = combined.copyOfRange(0, GCM_IV_LEN)
        val ciphertext = combined.copyOfRange(GCM_IV_LEN, combined.size)
        val masterKey = getOrCreateMasterKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, masterKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher.doFinal(ciphertext)
    }
}

