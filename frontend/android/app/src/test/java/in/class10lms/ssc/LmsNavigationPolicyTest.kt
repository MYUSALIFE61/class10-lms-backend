package `in`.class10lms.ssc

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LmsNavigationPolicyTest {

    private val lmsHost = "app.class10lms.in"

    @Test
    fun allowsInternalLmsNavigation() {
        val res = LmsNavigationPolicy.evaluateNavigation(
            rawUrl = "https://app.class10lms.in/lessons/1234",
            isForMainFrame = true,
            lmsHost = lmsHost
        )
        assertTrue(res.allow)
        assertTrue(res.isInternalLms)
    }

    @Test
    fun blocksYouTubeWatchLogoAndShortLinksOnMainFrame() {
        val blockedUrls = listOf(
            "https://www.youtube.com/watch?v=M7lc1UVf-VE",
            "https://m.youtube.com/watch?v=M7lc1UVf-VE",
            "https://youtube.com/shorts/abcdef12345",
            "https://www.youtube.com/@GoogleDevelopers",
            "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
            "https://youtu.be/M7lc1UVf-VE",
            "https://www.youtube-nocookie.com/watch?v=M7lc1UVf-VE"
        )
        for (url in blockedUrls) {
            val res = LmsNavigationPolicy.evaluateNavigation(url, isForMainFrame = true, lmsHost = lmsHost)
            assertFalse("Expected main-frame URL to be blocked: $url", res.allow)
        }
    }

    @Test
    fun blocksYouTubeWatchAndShortLinksEvenInSubframes() {
        val blockedSubframes = listOf(
            "https://www.youtube.com/watch?v=M7lc1UVf-VE",
            "https://youtu.be/M7lc1UVf-VE",
            "https://www.youtube.com/redirect?q=https://example.com"
        )
        for (url in blockedSubframes) {
            val res = LmsNavigationPolicy.evaluateNavigation(url, isForMainFrame = false, lmsHost = lmsHost)
            assertFalse("Expected subframe URL to be blocked: $url", res.allow)
        }
    }

    @Test
    fun allowsRequiredYouTubeEmbedAndMediaPlaybackSubframes() {
        val allowedSubframes = listOf(
            "https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1&controls=1&rel=0",
            "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?enablejsapi=1",
            "https://www.youtube.com/iframe_api",
            "https://rr1---sn-abcd.googlevideo.com/videoplayback?id=123",
            "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
            "https://s.ytimg.com/yts/jsbin/player.js",
            "https://youtubei.googleapis.com/youtubei/v1/player",
            "https://checkout.razorpay.com/v1/checkout.html",
            "about:blank"
        )
        for (url in allowedSubframes) {
            val res = LmsNavigationPolicy.evaluateNavigation(url, isForMainFrame = false, lmsHost = lmsHost)
            assertTrue("Expected playback subframe to be allowed: $url (${res.reason})", res.allow)
        }
    }

    @Test
    fun blocksExternalAppIntentsMarketAndCustomSchemes() {
        val blockedIntents = listOf(
            "intent://www.youtube.com/watch?v=M7lc1UVf-VE#Intent;package=com.google.android.youtube;scheme=https;end",
            "vnd.youtube://M7lc1UVf-VE",
            "youtube://watch?v=M7lc1UVf-VE",
            "market://details?id=com.google.android.youtube",
            "tel:+919876543210",
            "mailto:test@example.com",
            "javascript:alert(1)",
            "file:///etc/passwd"
        )
        for (url in blockedIntents) {
            val res = LmsNavigationPolicy.evaluateNavigation(url, isForMainFrame = true, lmsHost = lmsHost)
            assertFalse("Expected external intent/scheme to be blocked: $url", res.allow)
        }
    }

    @Test
    fun blocksExternalBrowsersAndSpoofedDomainHostnames() {
        val blockedExternal = listOf(
            "https://www.google.com/",
            "https://evil-youtube.com/embed/M7lc1UVf-VE",
            "https://notyoutube.com/embed/M7lc1UVf-VE",
            "https://app.class10lms.in.attacker.com/login",
            "https://youtube.com.evil.org/embed/M7lc1UVf-VE",
            "http://www.youtube.com/embed/M7lc1UVf-VE"
        )
        for (url in blockedExternal) {
            val resMain = LmsNavigationPolicy.evaluateNavigation(url, isForMainFrame = true, lmsHost = lmsHost)
            val resSub = LmsNavigationPolicy.evaluateNavigation(url, isForMainFrame = false, lmsHost = lmsHost)
            assertFalse("Expected spoofed/external main-frame URL to be blocked: $url", resMain.allow)
            assertFalse("Expected spoofed/external subframe URL to be blocked: $url", resSub.allow)
        }
    }
}
