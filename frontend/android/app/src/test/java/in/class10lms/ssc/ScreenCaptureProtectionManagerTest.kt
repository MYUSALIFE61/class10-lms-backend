package `in`.class10lms.ssc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for Phase 10 Native Android Screen Recording & Screen Sharing Protection Engine.
 * Runs purely on JVM via `./gradlew :app:testDebugUnitTest` without mocking Android internals.
 */
class ScreenCaptureProtectionManagerTest {

    @Test
    fun reportsHonestRecordingApiSupportByAndroidVersion() {
        val android14 = ScreenProtectionEngine(androidApiLevel = 34)
        assertFalse("Android 14 (API 34) must not pretend to support addScreenRecordingCallback", android14.snapshot().detectionApiSupported)
        assertTrue("FLAG_SECURE remains enforced on Android 14", android14.snapshot().flagSecureEnforced)
        assertTrue("Normal playback allowed when no threat active", android14.shouldAllowPlayback())

        val android15 = ScreenProtectionEngine(androidApiLevel = 35)
        assertTrue("Android 15 (API 35) supports addScreenRecordingCallback", android15.snapshot().detectionApiSupported)
    }

    @Test
    fun recordingDetectedPausesLocksAndRequiresManualResumeAfterStop() {
        val engine = ScreenProtectionEngine(androidApiLevel = 35, eventCooldownMs = 15_000L)

        // 1. Recording starts -> immediate pause, warning visible, manual resume locked
        val started = engine.onScreenRecordingChanged(isVisible = true, nowMs = 1_000L)
        assertTrue(started.shouldPausePlayer)
        assertTrue(started.shouldNotifyRecordingStarted)
        assertEquals("screen_recording_detected", started.telemetryEventType)
        assertTrue(started.state.isScreenRecording)
        assertTrue(started.state.isWarningVisible)
        assertFalse(started.state.canManualResume)
        assertFalse(started.state.shouldAllowPlayback)
        assertEquals(CaptureThreatType.SCREEN_RECORDING, started.state.threatType)

        // 2. Attempt to manually resume while recording is STILL visible -> rejected!
        val blockedResume = engine.onManualResumeRequested(nowMs = 2_000L)
        assertFalse(blockedResume.state.shouldAllowPlayback)
        assertTrue(blockedResume.state.isWarningVisible)
        assertFalse(blockedResume.state.canManualResume)

        // 3. Recording stops -> NEVER auto-resume! Keep video paused & expose manual Resume button
        val stopped = engine.onScreenRecordingChanged(isVisible = false, nowMs = 5_000L)
        assertFalse(stopped.shouldPausePlayer)
        assertTrue(stopped.shouldNotifyRecordingStopped)
        assertEquals("screen_recording_stopped", stopped.telemetryEventType)
        assertFalse(stopped.state.isScreenRecording)
        assertTrue("Overlay stays up until student manually resumes", stopped.state.awaitingManualResume)
        assertTrue("Manual Resume becomes available only after NOT_VISIBLE", stopped.state.canManualResume)
        assertFalse("Playback MUST remain paused until student taps Resume", stopped.state.shouldAllowPlayback)

        // 4. Student taps Resume Lesson -> clears overlay & unlocks playback
        val resumed = engine.onManualResumeRequested(nowMs = 6_000L)
        assertTrue(resumed.state.shouldAllowPlayback)
        assertFalse(resumed.state.isWarningVisible)
        assertFalse(resumed.state.awaitingManualResume)
        assertEquals("playback_resumed_after_capture", resumed.telemetryEventType)
        assertEquals("manual_resume_confirmed", resumed.protectionAction)
    }

    @Test
    fun unsafeSecondaryDisplayBlocksPlaybackUntilDisconnectedAndManuallyResumed() {
        val engine = ScreenProtectionEngine(androidApiLevel = 34, screenSharingGuardEnabled = true)

        val castStart = engine.onUnsafeDisplayChanged(true, "Miracast Living Room TV", nowMs = 10_000L)
        assertTrue(castStart.shouldPausePlayer)
        assertTrue(castStart.state.isUnsafeDisplayActive)
        assertEquals(CaptureThreatType.SCREEN_SHARING_DISPLAY, castStart.state.threatType)
        assertFalse(castStart.state.shouldAllowPlayback)
        assertFalse(castStart.state.canManualResume)
        assertEquals("screen_sharing_display_detected", castStart.telemetryEventType)

        // Disconnect display -> stays paused until manual Resume
        val castStop = engine.onUnsafeDisplayChanged(false, null, nowMs = 20_000L)
        assertFalse(castStop.state.isUnsafeDisplayActive)
        assertTrue(castStop.state.canManualResume)
        assertFalse(castStop.state.shouldAllowPlayback)

        // Manual resume unlocks playback
        val resumed = engine.onManualResumeRequested(nowMs = 21_000L)
        assertTrue(resumed.state.shouldAllowPlayback)
    }

    @Test
    fun overlappingRecordingAndExternalDisplayRequiresBothToClear() {
        val engine = ScreenProtectionEngine(androidApiLevel = 35)

        engine.onScreenRecordingChanged(true, nowMs = 1_000L)
        val both = engine.onUnsafeDisplayChanged(true, "Wireless Display", nowMs = 2_000L)
        assertEquals(CaptureThreatType.BOTH, both.state.threatType)
        assertFalse(both.state.canManualResume)

        // Recording stops, but Wireless Display is still active -> still locked!
        val stillBlocked = engine.onScreenRecordingChanged(false, nowMs = 3_000L)
        assertFalse(stillBlocked.state.canManualResume)
        assertFalse(stillBlocked.state.shouldAllowPlayback)
        assertEquals(CaptureThreatType.SCREEN_SHARING_DISPLAY, stillBlocked.state.threatType)

        // Now Wireless Display disconnects -> manual resume unlocks
        val readyForResume = engine.onUnsafeDisplayChanged(false, null, nowMs = 4_000L)
        assertTrue(readyForResume.state.canManualResume)
        assertFalse(readyForResume.state.shouldAllowPlayback)
    }

    @Test
    fun telemetryCooldownDeduplicatesRapidEventBursts() {
        val engine = ScreenProtectionEngine(androidApiLevel = 35, eventCooldownMs = 15_000L)

        val first = engine.onScreenRecordingChanged(true, nowMs = 1_000L)
        assertEquals("screen_recording_detected", first.telemetryEventType)

        engine.onScreenRecordingChanged(false, nowMs = 2_000L)

        // Rapid second recording toggle within 15s cooldown -> still pauses & blocks, but skips duplicate telemetry
        val second = engine.onScreenRecordingChanged(true, nowMs = 5_000L)
        assertTrue(second.shouldPausePlayer)
        assertFalse(second.state.shouldAllowPlayback)
        assertNull("Telemetry should be deduplicated inside cooldown window", second.telemetryEventType)

        // After cooldown elapses -> telemetry resumes reporting
        engine.onScreenRecordingChanged(false, nowMs = 6_000L)
        val third = engine.onScreenRecordingChanged(true, nowMs = 20_000L)
        assertEquals("screen_recording_detected", third.telemetryEventType)
    }

    @Test
    fun secondaryDisplayClassifierDistinguishesDefaultFromMiracastAndPresentation() {
        // Default phone screen must NEVER trigger false positive
        assertFalse(
            SecondaryDisplayClassifier.isUnsafeSecondaryDisplay(
                displayId = 0,
                state = 2,
                flags = 0,
                name = "Built-in Screen",
                defaultDisplayId = 0,
                stateOff = 1,
                flagPresentation = 8,
                flagPrivate = 4
            )
        )

        // Turned-off display must not trigger
        assertFalse(
            SecondaryDisplayClassifier.isUnsafeSecondaryDisplay(
                displayId = 2,
                state = 1,
                flags = 8,
                name = "HDMI",
                defaultDisplayId = 0,
                stateOff = 1,
                flagPresentation = 8,
                flagPrivate = 4
            )
        )

        // Miracast / Presentation display MUST trigger
        assertTrue(
            SecondaryDisplayClassifier.isUnsafeSecondaryDisplay(
                displayId = 2,
                state = 2,
                flags = 8,
                name = "Miracast Smart TV",
                defaultDisplayId = 0,
                stateOff = 1,
                flagPresentation = 8,
                flagPrivate = 4
            )
        )

        // Non-private external display MUST trigger
        assertTrue(
            SecondaryDisplayClassifier.isUnsafeSecondaryDisplay(
                displayId = 3,
                state = 2,
                flags = 0,
                name = "USB-C Monitor",
                defaultDisplayId = 0,
                stateOff = 1,
                flagPresentation = 8,
                flagPrivate = 4
            )
        )

        // Foldable phone secondary Built-in / Cover / Outer / Inner screens (non-presentation) must NOT false-positive
        for (foldableName in listOf(
            "Secondary Built-in Screen",
            "Cover Screen",
            "Outer Display",
            "Inner Display",
            "Sub Screen"
        )) {
            val res = SecondaryDisplayClassifier.classifySecondaryDisplay(
                displayId = 1,
                state = 2,
                flags = 0,
                name = foldableName,
                defaultDisplayId = 0,
                stateOff = 1,
                flagPresentation = 8,
                flagPrivate = 4
            )
            assertFalse("Foldable internal display '$foldableName' must not false-positive", res.isUnsafe)
            assertEquals("foldable_internal_display", res.reason)
        }

        // Chromecast, Wi-Fi Display, Wireless Display, HDMI, USB-C, DisplayPort, Virtual displays MUST trigger
        for (externalName in listOf(
            "Chromecast Living Room",
            "Miracast TV",
            "Wi-Fi Display",
            "Wireless Display",
            "HDMI Monitor",
            "USB-C Display",
            "DisplayPort External",
            "Virtual Screen Cast"
        )) {
            assertTrue(
                "External/cast display '$externalName' must be classified unsafe",
                SecondaryDisplayClassifier.isUnsafeSecondaryDisplay(
                    displayId = 4,
                    state = 2,
                    flags = 4, // even if marked private, known mirror/cast display must trigger
                    name = externalName,
                    defaultDisplayId = 0,
                    stateOff = 1,
                    flagPresentation = 8,
                    flagPrivate = 4
                )
            )
        }

        // Secondary display with FLAG_PRESENTATION MUST trigger regardless of name
        val presentationRes = SecondaryDisplayClassifier.classifySecondaryDisplay(
            displayId = 5,
            state = 2,
            flags = 8,
            name = "Secondary Display",
            defaultDisplayId = 0,
            stateOff = 1,
            flagPresentation = 8,
            flagPrivate = 4
        )
        assertTrue(presentationRes.isUnsafe)
        assertEquals("presentation_flag", presentationRes.reason)
    }

    @Test
    fun android14GracefullyEnforcesFlagSecureWithoutFalseRecordingWarning() {
        val engine = ScreenProtectionEngine(androidApiLevel = 34, screenSharingGuardEnabled = true)
        val initial = engine.snapshot()

        assertFalse("API 34 must report Android 15 recording callback unsupported", initial.detectionApiSupported)
        assertTrue("FLAG_SECURE remains enforced on Android 14", initial.flagSecureEnforced)
        assertFalse("Must not display a false warning simply because API 35 callback is unavailable", initial.isWarningVisible)
        assertTrue("Normal playback remains allowed on Android 14 when no external display is active", engine.shouldAllowPlayback())

        // External display protection still locks playback on Android 14 and requires manual resume
        val hdmiConnected = engine.onUnsafeDisplayChanged(true, "HDMI External Monitor", nowMs = 1_000L)
        assertTrue(hdmiConnected.shouldPausePlayer)
        assertFalse(hdmiConnected.state.shouldAllowPlayback)
        assertFalse(hdmiConnected.state.canManualResume)

        // Manual resume blocked while HDMI remains connected
        val rejected = engine.onManualResumeRequested(nowMs = 2_000L)
        assertFalse(rejected.state.shouldAllowPlayback)

        // HDMI disconnected -> stays paused (no auto-resume!) until manual Resume Lesson
        val hdmiRemoved = engine.onUnsafeDisplayChanged(false, null, nowMs = 3_000L)
        assertFalse(hdmiRemoved.state.shouldAllowPlayback)
        assertTrue(hdmiRemoved.state.canManualResume)

        val resumed = engine.onManualResumeRequested(nowMs = 4_000L)
        assertTrue(resumed.state.shouldAllowPlayback)
        assertEquals("playback_resumed_after_capture", resumed.telemetryEventType)
    }

    @Test
    fun syncsClearedStateWhenReturningToForegroundAfterRecordingStoppedInBackground() {
        val engine = ScreenProtectionEngine(androidApiLevel = 35, eventCooldownMs = 15_000L)
        val started = engine.onScreenRecordingChanged(true, nowMs = 1_000L)
        assertTrue(started.state.isScreenRecording)
        assertFalse(started.state.canManualResume)

        // Activity stops & restarts in onStart(): Android 15 addScreenRecordingCallback returns NOT_VISIBLE
        val synced = engine.onScreenRecordingChanged(false, nowMs = 3_000L)
        assertFalse(synced.state.isScreenRecording)
        assertTrue(synced.state.canManualResume)
        assertFalse("Playback stays paused until manual Resume after returning from background", synced.state.shouldAllowPlayback)
    }
}
