package `in`.class10lms.ssc

import java.net.URI
import java.util.Locale

/**
 * Pure URI- and hostname-validated WebView navigation policy for the Class 10 LMS APK.
 *
 * Security goals:
 * - Prevent intercepted top-level navigation to YouTube watch pages, youtu.be, external browsers,
 *   and external app intents (intent://, market://, vnd.youtube://, custom URI schemes).
 * - Preserve normal YouTube IFrame embedded playback resources (embed frames, googlevideo, ytimg,
 *   youtubei.googleapis.com) and internal LMS SPA navigation.
 * - Uses strict URI parsing and exact/subdomain hostname boundaries (never substring matching).
 */
object LmsNavigationPolicy {

    data class NavigationDecision(
        val allow: Boolean,
        val isInternalLms: Boolean,
        val reason: String
    )

    private val YOUTUBE_PRIMARY_HOSTS = setOf(
        "youtube.com",
        "youtube-nocookie.com"
    )

    private val YOUTUBE_SHORT_HOSTS = setOf(
        "youtu.be"
    )

    private val YOUTUBE_MEDIA_SUBFRAME_HOSTS = setOf(
        "googlevideo.com",
        "ytimg.com",
        "youtubei.googleapis.com",
        "ggpht.com"
    )

    private val PAYMENT_SUBFRAME_HOSTS = setOf(
        "razorpay.com"
    )

    private val BLOCKED_YOUTUBE_PATH_PREFIXES = listOf(
        "/watch",
        "/shorts",
        "/channel",
        "/@",
        "/redirect",
        "/results",
        "/feed",
        "/playlist",
        "/user/",
        "/c/",
        "/live"
    )

    private val ALLOWED_YOUTUBE_SUBFRAME_PATH_PREFIXES = listOf(
        "/embed",
        "/iframe_api",
        "/s/player",
        "/youtubei/",
        "/api/",
        "/ptracking",
        "/get_video_info"
    )

    private val BLOCKED_EXTERNAL_SCHEMES = setOf(
        "intent",
        "market",
        "vnd.youtube",
        "youtube",
        "tel",
        "mailto",
        "sms",
        "geo",
        "file",
        "content",
        "javascript",
        "ftp",
        "upi",
        "phonepe",
        "tez",
        "paytmmp"
    )

    fun evaluateNavigation(
        rawUrl: String?,
        isForMainFrame: Boolean,
        lmsHost: String
    ): NavigationDecision {
        if (rawUrl.isNullOrBlank()) {
            return NavigationDecision(false, false, "empty_url")
        }

        val uri = try {
            URI(rawUrl.trim())
        } catch (_: Exception) {
            return NavigationDecision(false, false, "malformed_uri")
        }

        val scheme = uri.scheme?.lowercase(Locale.US) ?: ""
        if (scheme.isEmpty()) {
            return NavigationDecision(false, false, "missing_scheme")
        }

        // Allow about:blank strictly inside subframes for iframe bootstrapping
        if (scheme == "about") {
            return if (!isForMainFrame && rawUrl.equals("about:blank", ignoreCase = true)) {
                NavigationDecision(true, false, "subframe_about_blank")
            } else {
                NavigationDecision(false, false, "blocked_about_scheme")
            }
        }

        // Block external app intents, Play Store links, YouTube app schemes, and custom schemes
        if (scheme in BLOCKED_EXTERNAL_SCHEMES || (scheme != "https" && scheme != "http")) {
            return NavigationDecision(false, false, "blocked_scheme:$scheme")
        }

        val host = uri.host?.lowercase(Locale.US)?.trimEnd('.') ?: ""
        if (host.isEmpty()) {
            return NavigationDecision(false, false, "missing_host")
        }

        val normalizedLmsHost = lmsHost.lowercase(Locale.US).trimEnd('.')
        val path = uri.rawPath?.lowercase(Locale.US) ?: ""

        // 1. Internal LMS origin navigation (always permitted over HTTPS, or localhost in local dev)
        val isLocalhost = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2"
        if (host == normalizedLmsHost && (scheme == "https" || isLocalhost)) {
            return NavigationDecision(true, true, "internal_lms_navigation")
        }

        // Reject cleartext HTTP for all non-internal external destinations
        if (scheme != "https") {
            return NavigationDecision(false, false, "blocked_non_https_external")
        }

        // 2. Always block youtu.be short links in both main frame and subframes
        if (matchesAnyDomain(host, YOUTUBE_SHORT_HOSTS)) {
            return NavigationDecision(false, false, "blocked_youtu_be")
        }

        // 3. YouTube primary domains (youtube.com, m.youtube.com, youtube-nocookie.com)
        if (matchesAnyDomain(host, YOUTUBE_PRIMARY_HOSTS)) {
            if (isForMainFrame) {
                return NavigationDecision(false, false, "blocked_youtube_main_frame")
            }
            if (BLOCKED_YOUTUBE_PATH_PREFIXES.any { path == it || path.startsWith("$it/") || path.startsWith(it) }) {
                return NavigationDecision(false, false, "blocked_youtube_watch_subframe")
            }
            if (ALLOWED_YOUTUBE_SUBFRAME_PATH_PREFIXES.any { path == it || path.startsWith(it) }) {
                return NavigationDecision(true, false, "allowed_youtube_embed_subframe")
            }
            return NavigationDecision(false, false, "blocked_youtube_unknown_subframe_path")
        }

        // 4. Required YouTube media/CDN/API hosts (subframe only; never main-frame navigation)
        if (matchesAnyDomain(host, YOUTUBE_MEDIA_SUBFRAME_HOSTS)) {
            return if (!isForMainFrame) {
                NavigationDecision(true, false, "allowed_youtube_media_subframe")
            } else {
                NavigationDecision(false, false, "blocked_media_main_frame")
            }
        }

        // 5. Preserve existing Razorpay Checkout iframe inside LMS subscription screen (subframe only)
        if (matchesAnyDomain(host, PAYMENT_SUBFRAME_HOSTS)) {
            return if (!isForMainFrame) {
                NavigationDecision(true, false, "allowed_payment_subframe")
            } else {
                NavigationDecision(false, false, "blocked_payment_main_frame")
            }
        }

        // 6. Block all other external website navigations to keep students inside the LMS
        return NavigationDecision(false, false, "blocked_external_host:$host")
    }

    internal fun matchesAnyDomain(host: String, allowedDomains: Set<String>): Boolean {
        return allowedDomains.any { domain ->
            host == domain || host.endsWith(".$domain")
        }
    }
}
