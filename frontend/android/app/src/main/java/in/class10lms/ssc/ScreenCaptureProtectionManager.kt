package `in`.class10lms.ssc

import android.app.Activity
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import android.view.WindowManager
import java.util.concurrent.CopyOnWriteArraySet
import java.util.function.Consumer

/**
 * Pure JVM-testable state machine for Android screen recording & secondary/virtual display protection.
 *
 * Security invariants enforced regardless of remote configuration:
 * 1. When screen recording OR an unsafe secondary/virtual presentation display is detected:
 *    - Playback MUST pause immediately.
 *    - Warning overlay MUST become visible and stay visible while capture remains active.
 *    - Manual resume MUST remain disabled until capture clears.
 * 2. When capture stops (SCREEN_RECORDING_STATE_NOT_VISIBLE & no unsafe display):
 *    - Playback MUST remain PAUSED (never auto-resume!).
 *    - Manual Resume button becomes enabled so the student explicitly resumes.
 * 3. On Android <= 14 (API < 35), `detectionApiSupported` is honestly `false` (no fake detection);
 *    FLAG_SECURE + DisplayManager secondary-display guard still protect content.
 */
enum class CaptureThreatType {
    NONE,
    SCREEN_RECORDING,
    SCREEN_SHARING_DISPLAY,
    BOTH
}

data class ScreenProtectionState(
    val isScreenRecording: Boolean = false,
    val isUnsafeDisplayActive: Boolean = false,
    val unsafeDisplayName: String? = null,
    val isWarningVisible: Boolean = false,
    val awaitingManualResume: Boolean = false,
    val canManualResume: Boolean = false,
    val detectionApiSupported: Boolean = false,
    val androidApiLevel: Int = 0,
    val flagSecureEnforced: Boolean = true,
    val threatType: CaptureThreatType = CaptureThreatType.NONE
) {
    val isCaptureActive: Boolean
        get() = isScreenRecording || isUnsafeDisplayActive

    val shouldAllowPlayback: Boolean
        get() = !isCaptureActive && !isWarningVisible && !awaitingManualResume
}

data class ProtectionTransition(
    val state: ScreenProtectionState,
    val shouldPausePlayer: Boolean = false,
    val shouldNotifyRecordingStarted: Boolean = false,
    val shouldNotifyRecordingStopped: Boolean = false,
    val telemetryEventType: String? = null,
    val protectionAction: String? = null
)

class ScreenProtectionEngine(
    private val androidApiLevel: Int,
    private val screenSharingGuardEnabled: Boolean = true,
    private val eventCooldownMs: Long = 15_000L
) {
    companion object {
        const val API_ANDROID_15 = 35 // Build.VERSION_CODES.VANILLA_ICE_CREAM
    }

    private var currentState = ScreenProtectionState(
        detectionApiSupported = androidApiLevel >= API_ANDROID_15,
        androidApiLevel = androidApiLevel,
        flagSecureEnforced = true
    )

    private val lastEventTimestampByType = mutableMapOf<String, Long>()

    fun snapshot(): ScreenProtectionState = currentState

    fun shouldAllowPlayback(): Boolean = currentState.shouldAllowPlayback

    fun onScreenRecordingChanged(isVisible: Boolean, nowMs: Long = System.currentTimeMillis()): ProtectionTransition {
        val prev = currentState
        if (prev.isScreenRecording == isVisible) {
            return ProtectionTransition(state = currentState)
        }

        return if (isVisible) {
            val nextThreat = resolveThreat(recording = true, unsafeDisplay = prev.isUnsafeDisplayActive)
            currentState = prev.copy(
                isScreenRecording = true,
                isWarningVisible = true,
                awaitingManualResume = true,
                canManualResume = false,
                threatType = nextThreat
            )
            val eventType = "screen_recording_detected"
            val shouldLog = shouldEmitTelemetry(eventType, nowMs)
            ProtectionTransition(
                state = currentState,
                shouldPausePlayer = true,
                shouldNotifyRecordingStarted = true,
                telemetryEventType = if (shouldLog) eventType else null,
                protectionAction = "playback_paused_overlay_shown"
            )
        } else {
            val stillThreatened = prev.isUnsafeDisplayActive
            val nextThreat = resolveThreat(recording = false, unsafeDisplay = stillThreatened)
            // Keep video paused! If no other capture threat remains, reveal manual Resume button.
            currentState = prev.copy(
                isScreenRecording = false,
                isWarningVisible = prev.awaitingManualResume || stillThreatened,
                canManualResume = prev.awaitingManualResume && !stillThreatened,
                threatType = nextThreat
            )
            val eventType = "screen_recording_stopped"
            val shouldLog = shouldEmitTelemetry(eventType, nowMs)
            ProtectionTransition(
                state = currentState,
                shouldPausePlayer = false,
                shouldNotifyRecordingStopped = true,
                telemetryEventType = if (shouldLog) eventType else null,
                protectionAction = if (stillThreatened) "external_display_still_blocking" else "manual_resume_available"
            )
        }
    }

    fun onUnsafeDisplayChanged(
        unsafeDisplayPresent: Boolean,
        displayName: String? = null,
        nowMs: Long = System.currentTimeMillis()
    ): ProtectionTransition {
        if (!screenSharingGuardEnabled) {
            return ProtectionTransition(state = currentState)
        }
        val prev = currentState
        if (prev.isUnsafeDisplayActive == unsafeDisplayPresent) {
            return ProtectionTransition(state = currentState)
        }

        return if (unsafeDisplayPresent) {
            val nextThreat = resolveThreat(recording = prev.isScreenRecording, unsafeDisplay = true)
            currentState = prev.copy(
                isUnsafeDisplayActive = true,
                unsafeDisplayName = displayName?.take(80),
                isWarningVisible = true,
                awaitingManualResume = true,
                canManualResume = false,
                threatType = nextThreat
            )
            val eventType = "screen_sharing_display_detected"
            val shouldLog = shouldEmitTelemetry(eventType, nowMs)
            ProtectionTransition(
                state = currentState,
                shouldPausePlayer = true,
                shouldNotifyRecordingStarted = !prev.isScreenRecording,
                telemetryEventType = if (shouldLog) eventType else null,
                protectionAction = "playback_paused_external_display"
            )
        } else {
            val stillRecording = prev.isScreenRecording
            val nextThreat = resolveThreat(recording = stillRecording, unsafeDisplay = false)
            currentState = prev.copy(
                isUnsafeDisplayActive = false,
                unsafeDisplayName = null,
                isWarningVisible = prev.awaitingManualResume || stillRecording,
                canManualResume = prev.awaitingManualResume && !stillRecording,
                threatType = nextThreat
            )
            val eventType = "screen_sharing_display_stopped"
            val shouldLog = shouldEmitTelemetry(eventType, nowMs)
            ProtectionTransition(
                state = currentState,
                shouldPausePlayer = false,
                shouldNotifyRecordingStopped = !stillRecording,
                telemetryEventType = if (shouldLog) eventType else null,
                protectionAction = if (stillRecording) "screen_recording_still_blocking" else "manual_resume_available"
            )
        }
    }

    /**
     * Explicit student tap on "Resume Lesson".
     * Rejected whenever recording or unsafe display is still active.
     */
    fun onManualResumeRequested(nowMs: Long = System.currentTimeMillis()): ProtectionTransition {
        val prev = currentState
        if (prev.isCaptureActive || !prev.canManualResume) {
            return ProtectionTransition(state = currentState)
        }
        currentState = prev.copy(
            isWarningVisible = false,
            awaitingManualResume = false,
            canManualResume = false,
            threatType = CaptureThreatType.NONE
        )
        val eventType = "playback_resumed_after_capture"
        val shouldLog = shouldEmitTelemetry(eventType, nowMs)
        return ProtectionTransition(
            state = currentState,
            shouldPausePlayer = false,
            telemetryEventType = if (shouldLog) eventType else null,
            protectionAction = "manual_resume_confirmed"
        )
    }

    private fun resolveThreat(recording: Boolean, unsafeDisplay: Boolean): CaptureThreatType =
        when {
            recording && unsafeDisplay -> CaptureThreatType.BOTH
            recording -> CaptureThreatType.SCREEN_RECORDING
            unsafeDisplay -> CaptureThreatType.SCREEN_SHARING_DISPLAY
            else -> CaptureThreatType.NONE
        }

    private fun shouldEmitTelemetry(eventType: String, nowMs: Long): Boolean {
        val last = lastEventTimestampByType[eventType]
        if (last != null && (nowMs - last) < eventCooldownMs) {
            return false
        }
        lastEventTimestampByType[eventType] = nowMs
        return true
    }
}

data class DisplayClassification(
    val isUnsafe: Boolean,
    val reason: String
)

/**
 * Pure JVM-testable secondary display classifier.
 * Identifies external presentation monitors, Miracast/Wi-Fi displays, Chromecast presentation routes,
 * HDMI/USB-C monitors, and non-private virtual displays without requiring surveillance or accessibility permissions,
 * while preventing false positives on foldable devices' built-in cover/inner screens and normal rotation.
 */
object SecondaryDisplayClassifier {
    private val FOLDABLE_INTERNAL_TOKENS = listOf(
        "built-in",
        "cover screen",
        "cover display",
        "outer screen",
        "outer display",
        "inner screen",
        "inner display",
        "main screen",
        "sub screen"
    )

    private val EXTERNAL_OR_CAST_TOKENS = listOf(
        "miracast",
        "chromecast",
        "wireless",
        "wifi display",
        "wi-fi display",
        "wfd",
        "screen cast",
        "smart mirroring",
        "smart view",
        "cast",
        "virtual",
        "overlay",
        "hdmi",
        "displayport",
        "usb-c",
        "external",
        "presentation"
    )

    fun classifySecondaryDisplay(
        displayId: Int,
        state: Int,
        flags: Int,
        name: String?,
        defaultDisplayId: Int = Display.DEFAULT_DISPLAY,
        stateOff: Int = Display.STATE_OFF,
        flagPresentation: Int = Display.FLAG_PRESENTATION,
        flagPrivate: Int = Display.FLAG_PRIVATE
    ): DisplayClassification {
        if (displayId == defaultDisplayId) {
            return DisplayClassification(false, "default_display")
        }
        if (state == stateOff) {
            return DisplayClassification(false, "display_off")
        }

        val isPresentation = (flags and flagPresentation) != 0
        val isPrivate = (flags and flagPrivate) != 0
        val lowered = (name ?: "").lowercase()
        val isKnownMirrorOrCast = EXTERNAL_OR_CAST_TOKENS.any { lowered.contains(it) }
        val isFoldableInternal = FOLDABLE_INTERNAL_TOKENS.any { lowered.contains(it) }

        // Never false-positive on foldable/dual-screen built-in panels unless flagged as presentation or cast/external
        if (isFoldableInternal && !isPresentation && !isKnownMirrorOrCast) {
            return DisplayClassification(false, "foldable_internal_display")
        }

        if (isPresentation) {
            return DisplayClassification(true, "presentation_flag")
        }
        if (isKnownMirrorOrCast) {
            return DisplayClassification(true, "external_or_cast_display")
        }
        if (!isPrivate) {
            return DisplayClassification(true, "public_secondary_display")
        }
        return DisplayClassification(false, "private_internal_display")
    }

    fun isUnsafeSecondaryDisplay(
        displayId: Int,
        state: Int,
        flags: Int,
        name: String?,
        defaultDisplayId: Int = Display.DEFAULT_DISPLAY,
        stateOff: Int = Display.STATE_OFF,
        flagPresentation: Int = Display.FLAG_PRESENTATION,
        flagPrivate: Int = Display.FLAG_PRIVATE
    ): Boolean = classifySecondaryDisplay(
        displayId = displayId,
        state = state,
        flags = flags,
        name = name,
        defaultDisplayId = defaultDisplayId,
        stateOff = stateOff,
        flagPresentation = flagPresentation,
        flagPrivate = flagPrivate
    ).isUnsafe
}

/**
 * In-process event bus connecting native Android protection activities (LmsMedia3PlayerActivity,
 * MainActivity) with Capacitor's Class10SecurityPlugin so JS receives live status notifications.
 */
object ScreenProtectionEventBus {
    interface Listener {
        fun onProtectionTransition(transition: ProtectionTransition)
    }

    @Volatile
    var latestState: ScreenProtectionState = ScreenProtectionState(
        detectionApiSupported = Build.VERSION.SDK_INT >= ScreenProtectionEngine.API_ANDROID_15,
        androidApiLevel = Build.VERSION.SDK_INT,
        flagSecureEnforced = true
    )
        private set

    private val listeners = CopyOnWriteArraySet<Listener>()

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun publish(transition: ProtectionTransition) {
        latestState = transition.state
        for (listener in listeners) {
            try {
                listener.onProtectionTransition(transition)
            } catch (_: Exception) {
                // Never allow listener errors to disrupt native protection enforcement
            }
        }
    }
}

/**
 * Centralized Android Screen Capture, Recording & Screen Sharing Protection Manager.
 *
 * Manages:
 * 1. WindowManager.LayoutParams.FLAG_SECURE enforcement across lifecycle events.
 * 2. Android 15+ (API 35) WindowManager.addScreenRecordingCallback() registration & teardown.
 * 3. DisplayManager.DisplayListener monitoring for wireless/presentation/virtual displays.
 * 4. Event emission to the host Activity, Capacitor bridge event bus, and backend reporter.
 */
class ScreenCaptureProtectionManager(
    private val activity: Activity,
    screenSharingGuardEnabled: Boolean = true,
    private val onTransition: (ProtectionTransition) -> Unit
) {
    companion object {
        private const val TAG = "Class10ScreenProtect"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val engine = ScreenProtectionEngine(
        androidApiLevel = Build.VERSION.SDK_INT,
        screenSharingGuardEnabled = screenSharingGuardEnabled
    )

    private var registered = false
    private var recordingCallback: Consumer<Int>? = null
    private var displayManager: DisplayManager? = null
    private var displayListener: DisplayManager.DisplayListener? = null

    fun currentState(): ScreenProtectionState = engine.snapshot()

    fun shouldAllowPlayback(): Boolean = engine.shouldAllowPlayback()

    /**
     * Re-asserts FLAG_SECURE on the activity window so screenshots, non-secure virtual displays,
     * and Android Recent Apps thumbnails cannot expose protected lesson content.
     */
    fun enforceFlagSecure() {
        activity.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    fun register() {
        enforceFlagSecure()
        if (registered) {
            evaluateActiveDisplays()
            return
        }
        registered = true

        // 1. Android 15+ (API 35) Official Screen Recording Callback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            try {
                val wm = activity.windowManager
                val callback = Consumer<Int> { state ->
                    val isVisible = state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
                    Log.i(TAG, "Android 15 ScreenRecordingCallback fired: state=$state isVisible=$isVisible")
                    mainHandler.post {
                        dispatchTransition(engine.onScreenRecordingChanged(isVisible))
                    }
                }
                recordingCallback = callback
                val initialState = wm.addScreenRecordingCallback(activity.mainExecutor, callback)
                val initialVisible = initialState == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
                Log.i(TAG, "Registered Android 15+ ScreenRecordingCallback (initialVisible=$initialVisible)")
                val prevState = engine.snapshot()
                val initialTransition = engine.onScreenRecordingChanged(initialVisible)
                if (initialTransition.state != prevState) {
                    dispatchTransition(initialTransition)
                }
            } catch (ex: SecurityException) {
                Log.w(TAG, "DETECT_SCREEN_RECORDING permission check failed: ${ex.message}")
            } catch (ex: Exception) {
                Log.w(TAG, "Failed to register ScreenRecordingCallback: ${ex.message}")
            }
        } else {
            Log.i(
                TAG,
                "Android API ${Build.VERSION.SDK_INT} < 35: addScreenRecordingCallback unavailable; enforcing FLAG_SECURE + DisplayManager guard."
            )
        }

        // 2. DisplayManager Secondary / Presentation / Wireless Display Monitoring (API 24+)
        try {
            val dm = activity.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            displayManager = dm
            if (dm != null) {
                val listener = object : DisplayManager.DisplayListener {
                    override fun onDisplayAdded(displayId: Int) = evaluateActiveDisplays()
                    override fun onDisplayRemoved(displayId: Int) = evaluateActiveDisplays()
                    override fun onDisplayChanged(displayId: Int) = evaluateActiveDisplays()
                }
                displayListener = listener
                dm.registerDisplayListener(listener, mainHandler)
                evaluateActiveDisplays()
            }
        } catch (ex: Exception) {
            Log.w(TAG, "DisplayManager listener registration skipped: ${ex.message}")
        }
    }

    fun requestManualResume(): Boolean {
        val transition = engine.onManualResumeRequested()
        val resumed = transition.state.shouldAllowPlayback && transition.protectionAction == "manual_resume_confirmed"
        if (resumed) {
            dispatchTransition(transition)
        }
        return resumed
    }

    fun unregister() {
        if (!registered) return
        registered = false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            recordingCallback?.let { cb ->
                try {
                    activity.windowManager.removeScreenRecordingCallback(cb)
                } catch (ex: Exception) {
                    Log.w(TAG, "Failed to unregister ScreenRecordingCallback: ${ex.message}")
                }
            }
        }
        recordingCallback = null

        displayListener?.let { listener ->
            try {
                displayManager?.unregisterDisplayListener(listener)
            } catch (ex: Exception) {
                Log.w(TAG, "Failed to unregister DisplayListener: ${ex.message}")
            }
        }
        displayListener = null
        displayManager = null
    }

    private fun evaluateActiveDisplays() {
        val dm = displayManager ?: return
        var unsafeReason = ""
        val unsafeDisplay = try {
            val combined = LinkedHashMap<Int, Display>()
            for (d in dm.displays) {
                combined[d.displayId] = d
            }
            for (d in dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
                combined[d.displayId] = d
            }
            combined.values.firstOrNull { display ->
                val result = SecondaryDisplayClassifier.classifySecondaryDisplay(
                    displayId = display.displayId,
                    state = display.state,
                    flags = display.flags,
                    name = display.name
                )
                if (result.isUnsafe) {
                    unsafeReason = result.reason
                }
                result.isUnsafe
            }
        } catch (ex: Exception) {
            Log.w(TAG, "Unable to inspect displays: ${ex.message}")
            null
        }

        val prevState = engine.snapshot()
        val transition = engine.onUnsafeDisplayChanged(
            unsafeDisplayPresent = unsafeDisplay != null,
            displayName = unsafeDisplay?.name
        )
        if (transition.state != prevState) {
            if (unsafeDisplay != null) {
                Log.i(
                    TAG,
                    "Unsafe secondary/presentation display detected: id=${unsafeDisplay.displayId} reason=$unsafeReason"
                )
            } else {
                Log.i(TAG, "Unsafe secondary/presentation display disconnected; manual resume required")
            }
            dispatchTransition(transition)
        }
    }

    private fun dispatchTransition(transition: ProtectionTransition) {
        ScreenProtectionEventBus.publish(transition)
        onTransition(transition)
    }
}
