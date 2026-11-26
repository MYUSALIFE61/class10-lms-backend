# Keep Capacitor bridge, plugins, and WebView JS interfaces
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Google Play Integrity API classes
-keep class com.google.android.play.core.integrity.** { *; }

# Keep AndroidX Security Crypto & Tink primitives
-keep class androidx.security.crypto.** { *; }
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**

# Keep LMS Native Activities & Security Manager
-keep class in.class10lms.ssc.MainActivity { *; }
-keep class in.class10lms.ssc.LmsMedia3PlayerActivity { *; }
-keep class in.class10lms.ssc.ScreenCaptureProtectionManager** { *; }
-keep class in.class10lms.ssc.ScreenProtection** { *; }

# Keep LMS Offline Cryptography, Media3 Custom DataSource & Vault Models
-keep class in.class10lms.ssc.EncryptedOfflineDataSource** { *; }
-keep class in.class10lms.ssc.OfflineVideoVault** { *; }
-keep class in.class10lms.ssc.OfflineVideoRecord** { *; }
-keep class in.class10lms.ssc.CaptureThreatType { *; }
-keep class in.class10lms.ssc.CtrSeekCipher** { *; }
-keep class in.class10lms.ssc.AuthenticatedChunkedCipher** { *; }
-keep class in.class10lms.ssc.DecryptionCredentials { *; }
-keep class in.class10lms.ssc.AndroidKeystoreKeyWrapper** { *; }

# Keep Media3 ExoPlayer core & UI components
-keep class androidx.media3.exoplayer.** { *; }
-keep class androidx.media3.datasource.** { *; }
-keep class androidx.media3.ui.** { *; }
