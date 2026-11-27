package `in`.class10lms.ssc

import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import java.util.Locale

/**
 * Own Branded Class 10 SSC LMS Native Android Media3 ExoPlayer Activity.
 *
 * Protected Playback Architecture (Phase 10):
 * - Unconditional WindowManager.LayoutParams.FLAG_SECURE across all lifecycle states & fullscreen
 * - Android 15+ (API 35) WindowManager.addScreenRecordingCallback() via ScreenCaptureProtectionManager
 * - DisplayManager secondary / wireless / presentation display protection
 * - Native dark-navy warning overlay with yellow shield, orange active indicator & manual-only Resume
 * - Strictly prevents playback or auto-resume while capture is detected or awaiting student interaction
 * - Preserves Media3 controls, moving student watermark, speed, seek, fullscreen & backend security logging
 */
class LmsMedia3PlayerActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "Class10Media3"
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_DESCRIPTION = "description"
        const val EXTRA_NOTES = "notesText"
        const val EXTRA_WATERMARK = "watermarkText"
        const val EXTRA_START_POSITION_MS = "startPositionMs"
        const val EXTRA_COMPLETED = "completed"
        const val EXTRA_LESSON_ID = "lessonId"
        const val EXTRA_API_BASE_URL = "apiBaseUrl"
        const val EXTRA_ACCESS_TOKEN = "accessToken"
        const val EXTRA_DEVICE_ID = "deviceId"
        const val EXTRA_WARNING_HEADING = "warningHeading"
        const val EXTRA_WARNING_MESSAGE = "warningMessage"
        const val EXTRA_WATERMARK_ENABLED = "watermarkEnabled"
        const val EXTRA_SCREEN_SHARING_PROTECTION = "screenSharingProtection"
        const val EXTRA_SECURITY_EVENT_LOGGING = "securityEventLogging"
        const val EXTRA_OFFLINE_LESSON_ID = "offlineLessonId"
        const val EXTRA_STUDENT_ID = "studentId"

        const val RESULT_LAST_POSITION_MS = "lastPositionMs"
        const val RESULT_DURATION_MS = "durationMs"
        const val RESULT_COMPLETED = "completed"

        const val DEFAULT_WARNING_HEADING = "SCREEN RECORDING DETECTED!"
        const val DEFAULT_WARNING_MESSAGE =
            "For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson."

        private val SPEED_STEPS = floatArrayOf(0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
        private const val SEEK_STEP_MS = 10_000L
    }

    private var player: ExoPlayer? = null
    private lateinit var protectionManager: ScreenCaptureProtectionManager
    private lateinit var securityReporter: SecurityEventReporter

    private lateinit var playerView: PlayerView
    private lateinit var videoStage: FrameLayout
    private lateinit var headerBar: View
    private lateinit var fsTopOverlay: View
    private lateinit var controlsDeck: View
    private lateinit var lessonDetailsContainer: View
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var errorOverlay: View
    private lateinit var txtErrorMessage: TextView
    private lateinit var txtWatermark: TextView
    private lateinit var txtTimeDisplay: TextView
    private lateinit var txtSectionHeading: TextView
    private lateinit var txtSectionBody: TextView
    private lateinit var txtTabInfo: TextView
    private lateinit var txtTabNotes: TextView
    private lateinit var txtTabQA: TextView
    private lateinit var indTabInfo: View
    private lateinit var indTabNotes: View
    private lateinit var indTabQA: View
    private lateinit var seekBar: SeekBar
    private lateinit var btnPlayPause: ImageButton
    private lateinit var btnRewind: TextView
    private lateinit var btnForward: TextView
    private lateinit var btnVolume: ImageButton
    private lateinit var btnFullscreen: ImageButton
    private lateinit var btnSpeed: TextView
    private lateinit var btnMarkComplete: Button

    // Native Screen Capture Protection Overlay views
    private lateinit var screenProtectionOverlay: View
    private lateinit var txtProtectionHeading: TextView
    private lateinit var txtProtectionMessage: TextView
    private lateinit var badgeProtectionWarning: TextView
    private lateinit var btnProtectionResume: Button

    private var streamUrl: String = ""
    private var offlineLessonId: String = ""
    private var offlineStudentId: String = ""
    private var isOfflineMode: Boolean = false
    private var offlineVault: OfflineVideoVault? = null
    private var lessonDescription: String = ""
    private var lessonNotesText: String = ""
    private var configuredWarningHeading: String = DEFAULT_WARNING_HEADING
    private var configuredWarningMessage: String = DEFAULT_WARNING_MESSAGE
    private var watermarkEnabled: Boolean = true
    private var speedIndex: Int = 1 // 1.0x
    private var isMuted: Boolean = false
    private var isFullscreen: Boolean = false
    private var fsControlsVisible: Boolean = false
    private var isUserSeeking: Boolean = false
    private var watermarkCornerIndex: Int = 0
    private var reachedCompletion: Boolean = false
    private var lastKnownPosMs: Long = 0L
    private var lastKnownDurMs: Long = 0L

    private val uiHandler = Handler(Looper.getMainLooper())
    private val autoHideFsControls = Runnable {
        if (isFullscreen) {
            fsControlsVisible = false
            fsTopOverlay.visibility = View.GONE
            controlsDeck.visibility = View.GONE
        }
    }
    private val progressTicker = object : Runnable {
        override fun run() {
            updateProgressUi()
            uiHandler.postDelayed(this, 500L)
        }
    }
    private val watermarkShifter = object : Runnable {
        override fun run() {
            val gravities = intArrayOf(
                Gravity.TOP or Gravity.END,
                Gravity.TOP or Gravity.START,
                Gravity.CENTER_VERTICAL or Gravity.END,
                Gravity.CENTER_VERTICAL or Gravity.START
            )
            val lp = txtWatermark.layoutParams as FrameLayout.LayoutParams
            lp.gravity = gravities[watermarkCornerIndex % gravities.size]
            txtWatermark.layoutParams = lp
            watermarkCornerIndex += 1
            uiHandler.postDelayed(this, 12_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Mandatory screenshot & non-secure virtual display protection before inflating content
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContentView(R.layout.activity_lms_media3_player)

        streamUrl = intent.getStringExtra(EXTRA_URL).orEmpty().trim()
        offlineLessonId = intent.getStringExtra(EXTRA_OFFLINE_LESSON_ID).orEmpty().trim()
        offlineStudentId = intent.getStringExtra(EXTRA_STUDENT_ID).orEmpty().trim()
        isOfflineMode = offlineLessonId.isNotEmpty() && offlineStudentId.isNotEmpty()
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Class 10 SSC Lesson" }
        lessonDescription = intent.getStringExtra(EXTRA_DESCRIPTION).orEmpty().ifBlank {
            "Watch this Class 10 SSC lesson carefully in our protected player and mark it complete once finished."
        }
        lessonNotesText = intent.getStringExtra(EXTRA_NOTES).orEmpty().ifBlank {
            "Key revision points and textbook formulas for this lesson are available in your subject notes panel."
        }
        val watermark = intent.getStringExtra(EXTRA_WATERMARK).orEmpty().ifBlank { "Class 10 SSC LMS" }
        val startPosMs = intent.getLongExtra(EXTRA_START_POSITION_MS, 0L).coerceAtLeast(0L)
        reachedCompletion = intent.getBooleanExtra(EXTRA_COMPLETED, false)

        val lessonId = intent.getStringExtra(EXTRA_LESSON_ID).orEmpty().trim()
        val apiBaseUrl = intent.getStringExtra(EXTRA_API_BASE_URL).orEmpty().trim()
        val accessToken = intent.getStringExtra(EXTRA_ACCESS_TOKEN).orEmpty().trim()
        val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID).orEmpty().trim()
        configuredWarningHeading =
            intent.getStringExtra(EXTRA_WARNING_HEADING).orEmpty().trim().ifBlank { DEFAULT_WARNING_HEADING }
        configuredWarningMessage =
            intent.getStringExtra(EXTRA_WARNING_MESSAGE).orEmpty().trim().ifBlank { DEFAULT_WARNING_MESSAGE }
        watermarkEnabled = intent.getBooleanExtra(EXTRA_WATERMARK_ENABLED, true)
        val screenSharingProtection = intent.getBooleanExtra(EXTRA_SCREEN_SHARING_PROTECTION, true)
        val securityEventLogging = intent.getBooleanExtra(EXTRA_SECURITY_EVENT_LOGGING, true)

        bindViews()
        findViewById<TextView>(R.id.txtTitle).text = title
        findViewById<TextView>(R.id.txtFsTitle).text = title
        txtWatermark.text = watermark
        txtWatermark.visibility = if (watermarkEnabled) View.VISIBLE else View.GONE
        selectTab(0)
        renderCompleteButton()

        securityReporter = SecurityEventReporter(
            apiBaseUrl = apiBaseUrl,
            accessToken = accessToken,
            deviceId = deviceId,
            lessonId = lessonId,
            enabled = securityEventLogging
        )

        protectionManager = ScreenCaptureProtectionManager(
            activity = this,
            screenSharingGuardEnabled = screenSharingProtection,
            onTransition = { transition -> handleProtectionTransition(transition) }
        )

        setupControls()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isFullscreen) {
                    toggleFullscreen(false)
                } else {
                    finishWithPlaybackResult()
                }
            }
        })

        // Register protection callbacks BEFORE starting playback so pre-existing recording/casting is caught immediately
        protectionManager.register()
        renderProtectionOverlay(protectionManager.currentState())

        var effectiveStartPosMs = startPosMs
        if (isOfflineMode) {
            val vault = OfflineVideoVault(this)
            offlineVault = vault
            val verified = vault.verifyRecord(offlineStudentId, offlineLessonId, deepVerifyChecksum = false)
            if (verified == null || verified.status != OfflineVideoVault.STATUS_DOWNLOADED) {
                showError("Downloaded offline lesson file is missing or not verified. Please re-download.")
                return
            }
            val (leaseValid, leaseErrorMsg) = vault.checkOfflineLeaseValid(offlineStudentId, offlineLessonId)
            if (!leaseValid) {
                showError(leaseErrorMsg)
                return
            }
            if (effectiveStartPosMs == 0L && verified.lastPositionMs > 0L) {
                effectiveStartPosMs = verified.lastPositionMs
            }
            if (verified.completed) {
                reachedCompletion = true
                renderCompleteButton()
            }
        } else if (!isAllowedStreamUrl(streamUrl)) {
            showError("Invalid or insecure lesson stream URL.")
            return
        }

        initializePlayer(effectiveStartPosMs)
        if (watermarkEnabled) {
            uiHandler.post(watermarkShifter)
        }
    }

    override fun onStart() {
        super.onStart()
        if (::protectionManager.isInitialized) {
            protectionManager.register()
            val state = protectionManager.currentState()
            if (!state.shouldAllowPlayback) {
                player?.pause()
                player?.playWhenReady = false
            }
            renderProtectionOverlay(state)
        }
    }

    override fun onResume() {
        super.onResume()
        protectionManager.enforceFlagSecure()
        val state = protectionManager.currentState()
        if (!state.shouldAllowPlayback) {
            player?.pause()
            player?.playWhenReady = false
        }
        renderProtectionOverlay(state)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && ::protectionManager.isInitialized) {
            protectionManager.enforceFlagSecure()
        }
    }

    private fun isAllowedStreamUrl(url: String): Boolean {
        if (url.startsWith("https://")) return true
        if (BuildConfig.DEBUG && (
                url.startsWith("http://localhost:") ||
                url.startsWith("http://127.0.0.1:") ||
                url.startsWith("http://10.0.2.2:")
            )
        ) {
            return true
        }
        return false
    }

    private fun bindViews() {
        playerView = findViewById(R.id.playerView)
        videoStage = findViewById(R.id.videoStage)
        headerBar = findViewById(R.id.headerBar)
        fsTopOverlay = findViewById(R.id.fsTopOverlay)
        controlsDeck = findViewById(R.id.controlsDeck)
        lessonDetailsContainer = findViewById(R.id.lessonDetailsContainer)
        loadingSpinner = findViewById(R.id.loadingSpinner)
        errorOverlay = findViewById(R.id.errorOverlay)
        txtErrorMessage = findViewById(R.id.txtErrorMessage)
        txtWatermark = findViewById(R.id.txtWatermark)
        txtTimeDisplay = findViewById(R.id.txtTimeDisplay)
        txtSectionHeading = findViewById(R.id.txtSectionHeading)
        txtSectionBody = findViewById(R.id.txtSectionBody)
        txtTabInfo = findViewById(R.id.txtTabInfo)
        txtTabNotes = findViewById(R.id.txtTabNotes)
        txtTabQA = findViewById(R.id.txtTabQA)
        indTabInfo = findViewById(R.id.indTabInfo)
        indTabNotes = findViewById(R.id.indTabNotes)
        indTabQA = findViewById(R.id.indTabQA)
        seekBar = findViewById(R.id.seekBar)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        btnRewind = findViewById(R.id.btnRewind)
        btnForward = findViewById(R.id.btnForward)
        btnVolume = findViewById(R.id.btnVolume)
        btnFullscreen = findViewById(R.id.btnFullscreen)
        btnSpeed = findViewById(R.id.btnSpeed)
        btnMarkComplete = findViewById(R.id.btnMarkComplete)

        screenProtectionOverlay = findViewById(R.id.screenProtectionOverlay)
        txtProtectionHeading = findViewById(R.id.txtProtectionHeading)
        txtProtectionMessage = findViewById(R.id.txtProtectionMessage)
        badgeProtectionWarning = findViewById(R.id.badgeProtectionWarning)
        btnProtectionResume = findViewById(R.id.btnProtectionResume)
    }

    private fun setupControls() {
        // In fullscreen, video occupies 100% of display; tapping video reveals Exit & controls for 3.5s
        playerView.setOnClickListener {
            if (!protectionManager.shouldAllowPlayback()) return@setOnClickListener
            if (isFullscreen) {
                fsControlsVisible = !fsControlsVisible
                uiHandler.removeCallbacks(autoHideFsControls)
                fsTopOverlay.visibility = if (fsControlsVisible) View.VISIBLE else View.GONE
                controlsDeck.visibility = if (fsControlsVisible) View.VISIBLE else View.GONE
                if (fsControlsVisible) {
                    uiHandler.postDelayed(autoHideFsControls, 3_500L)
                }
            } else {
                val nextVisible = controlsDeck.visibility != View.VISIBLE
                controlsDeck.visibility = if (nextVisible) View.VISIBLE else View.GONE
            }
        }

        findViewById<ImageButton>(R.id.btnClose).setOnClickListener {
            finishWithPlaybackResult()
        }

        findViewById<ImageButton>(R.id.btnCastInfo).setOnClickListener {
            Toast.makeText(
                this,
                "Protected Class 10 Playback: Screenshots, screen recording & casting are blocked.",
                Toast.LENGTH_SHORT
            ).show()
        }

        findViewById<Button>(R.id.btnFsExit).setOnClickListener {
            toggleFullscreen(false)
        }

        btnPlayPause.setOnClickListener {
            if (!protectionManager.shouldAllowPlayback()) {
                player?.pause()
                return@setOnClickListener
            }
            val p = player ?: return@setOnClickListener
            if (p.isPlaying) {
                p.pause()
            } else {
                if (p.playbackState == Player.STATE_ENDED) {
                    p.seekTo(0L)
                }
                p.play()
            }
            resetFsHideTimer()
        }

        btnRewind.setOnClickListener {
            if (!protectionManager.shouldAllowPlayback()) return@setOnClickListener
            val p = player ?: return@setOnClickListener
            p.seekTo((p.currentPosition - SEEK_STEP_MS).coerceAtLeast(0L))
            resetFsHideTimer()
        }

        btnForward.setOnClickListener {
            if (!protectionManager.shouldAllowPlayback()) return@setOnClickListener
            val p = player ?: return@setOnClickListener
            val dur = p.duration.coerceAtLeast(0L)
            val target = if (dur > 0) (p.currentPosition + SEEK_STEP_MS).coerceAtMost(dur) else p.currentPosition + SEEK_STEP_MS
            p.seekTo(target)
            resetFsHideTimer()
        }

        btnSpeed.setOnClickListener {
            if (!protectionManager.shouldAllowPlayback()) return@setOnClickListener
            speedIndex = (speedIndex + 1) % SPEED_STEPS.size
            val rate = SPEED_STEPS[speedIndex]
            player?.setPlaybackSpeed(rate)
            btnSpeed.text = if (rate == 1.0f) "1x" else "${rate}x"
            resetFsHideTimer()
        }

        btnVolume.setOnClickListener {
            if (!protectionManager.shouldAllowPlayback()) return@setOnClickListener
            isMuted = !isMuted
            player?.volume = if (isMuted) 0f else 1f
            btnVolume.setImageResource(if (isMuted) R.drawable.ic_lms_volume_off else R.drawable.ic_lms_volume_on)
            resetFsHideTimer()
        }

        btnFullscreen.setOnClickListener {
            toggleFullscreen(!isFullscreen)
        }

        findViewById<Button>(R.id.btnRetry).setOnClickListener {
            initializePlayer(lastKnownPosMs)
        }

        // Manual-only Resume after screen recording or external display stops
        btnProtectionResume.setOnClickListener {
            if (protectionManager.requestManualResume()) {
                Log.i(TAG, "MEDIA3_MANUAL_RESUME_CONFIRMED posMs=${player?.currentPosition ?: lastKnownPosMs}")
                player?.let { exo ->
                    if (exo.playbackState == Player.STATE_ENDED) {
                        exo.seekTo(0L)
                    }
                    exo.play()
                }
            }
        }

        findViewById<View>(R.id.tabLessonInfo).setOnClickListener { selectTab(0) }
        findViewById<View>(R.id.tabNotes).setOnClickListener { selectTab(1) }
        findViewById<View>(R.id.tabQA).setOnClickListener { selectTab(2) }

        btnMarkComplete.setOnClickListener {
            reachedCompletion = true
            renderCompleteButton()
        }

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser && protectionManager.shouldAllowPlayback()) {
                    val dur = player?.duration?.coerceAtLeast(0L) ?: lastKnownDurMs
                    txtTimeDisplay.text = "${formatTimeMs(progress.toLong())} / ${formatTimeMs(dur)}"
                }
            }

            override fun onStartTrackingTouch(sb: SeekBar?) {
                if (!protectionManager.shouldAllowPlayback()) return
                isUserSeeking = true
            }

            override fun onStopTrackingTouch(sb: SeekBar?) {
                isUserSeeking = false
                if (!protectionManager.shouldAllowPlayback()) return
                player?.seekTo((sb?.progress ?: 0).toLong())
                resetFsHideTimer()
            }
        })
    }

    private fun handleProtectionTransition(transition: ProtectionTransition) {
        if (transition.shouldPausePlayer || !transition.state.shouldAllowPlayback) {
            player?.pause()
            player?.playWhenReady = false
            Log.i(
                TAG,
                "MEDIA3_PROTECTION_LOCKED isRecording=${transition.state.isScreenRecording} isUnsafeDisplay=${transition.state.isUnsafeDisplayActive} canManualResume=${transition.state.canManualResume} threat=${transition.state.threatType}"
            )
        }

        transition.telemetryEventType?.let { eventType ->
            securityReporter.report(
                eventType = eventType,
                protectionAction = transition.protectionAction ?: "playback_paused"
            )
        }

        renderProtectionOverlay(transition.state)
    }

    private fun renderProtectionOverlay(state: ScreenProtectionState) {
        if (state.isCaptureActive) {
            // Active recording or unsafe secondary display -> lock playback & show warning overlay
            player?.pause()
            player?.playWhenReady = false
            loadingSpinner.visibility = View.GONE
            uiHandler.removeCallbacks(autoHideFsControls)
            controlsDeck.visibility = View.GONE
            fsTopOverlay.visibility = View.GONE
            setPlaybackControlsEnabled(false)

            txtProtectionHeading.text = when (state.threatType) {
                CaptureThreatType.SCREEN_SHARING_DISPLAY -> "SCREEN SHARING DETECTED!"
                else -> configuredWarningHeading
            }
            txtProtectionMessage.text = configuredWarningMessage
            badgeProtectionWarning.text = when (state.threatType) {
                CaptureThreatType.SCREEN_SHARING_DISPLAY -> "● Screen Sharing / External Display Active"
                CaptureThreatType.BOTH -> "● Screen Recording & Display Sharing Active"
                else -> "● Screen Recording Active — Playback Locked"
            }
            badgeProtectionWarning.visibility = View.VISIBLE

            // Resume button MUST NOT be available while capture is active
            btnProtectionResume.isEnabled = false
            btnProtectionResume.visibility = View.GONE
            screenProtectionOverlay.visibility = View.VISIBLE
            screenProtectionOverlay.bringToFront()
        } else if (state.awaitingManualResume && state.canManualResume) {
            // Capture stopped -> remove active recording warning, keep paused, reveal manual Resume button
            player?.pause()
            player?.playWhenReady = false
            controlsDeck.visibility = View.GONE
            fsTopOverlay.visibility = View.GONE
            setPlaybackControlsEnabled(false)

            txtProtectionHeading.text = "Playback Paused"
            txtProtectionMessage.text =
                "Screen recording or screen sharing has stopped.\n\nTap Resume Lesson below whenever you are ready to continue watching."
            badgeProtectionWarning.visibility = View.GONE

            btnProtectionResume.visibility = View.VISIBLE
            btnProtectionResume.isEnabled = true
            screenProtectionOverlay.visibility = View.VISIBLE
            screenProtectionOverlay.bringToFront()
        } else {
            // Normal protected playback state
            screenProtectionOverlay.visibility = View.GONE
            btnProtectionResume.visibility = View.GONE
            btnProtectionResume.isEnabled = false
            setPlaybackControlsEnabled(true)
            if (!isFullscreen) {
                controlsDeck.visibility = View.VISIBLE
            }
        }
    }

    private fun setPlaybackControlsEnabled(enabled: Boolean) {
        btnPlayPause.isEnabled = enabled
        btnRewind.isEnabled = enabled
        btnForward.isEnabled = enabled
        btnSpeed.isEnabled = enabled
        btnVolume.isEnabled = enabled
        seekBar.isEnabled = enabled
    }

    private fun selectTab(tabIndex: Int) {
        val activeColor = Color.parseColor("#1152D4")
        val mutedColor = Color.parseColor("#586C91")
        txtTabInfo.setTextColor(if (tabIndex == 0) activeColor else mutedColor)
        txtTabNotes.setTextColor(if (tabIndex == 1) activeColor else mutedColor)
        txtTabQA.setTextColor(if (tabIndex == 2) activeColor else mutedColor)
        indTabInfo.visibility = if (tabIndex == 0) View.VISIBLE else View.INVISIBLE
        indTabNotes.visibility = if (tabIndex == 1) View.VISIBLE else View.INVISIBLE
        indTabQA.visibility = if (tabIndex == 2) View.VISIBLE else View.INVISIBLE

        when (tabIndex) {
            0 -> {
                txtSectionHeading.text = "About this Lesson"
                txtSectionBody.text = lessonDescription
                btnMarkComplete.visibility = View.VISIBLE
            }
            1 -> {
                txtSectionHeading.text = "Lesson Revision Notes"
                txtSectionBody.text = lessonNotesText
                btnMarkComplete.visibility = View.GONE
            }
            else -> {
                txtSectionHeading.text = "Lesson Q&A & Practice"
                txtSectionBody.text =
                    "Tap the Back arrow at the top-left to open the interactive Class 10 MCQs and submit answers for instant scoring."
                btnMarkComplete.visibility = View.GONE
            }
        }
    }

    private fun renderCompleteButton() {
        if (reachedCompletion) {
            btnMarkComplete.setBackgroundResource(R.drawable.bg_lms_pill_completed)
            btnMarkComplete.text = "✓   Lesson Completed"
        } else {
            btnMarkComplete.setBackgroundResource(R.drawable.bg_lms_pill_primary)
            btnMarkComplete.text = "✓   Mark as Complete"
        }
    }

    private fun resetFsHideTimer() {
        if (isFullscreen && fsControlsVisible) {
            uiHandler.removeCallbacks(autoHideFsControls)
            uiHandler.postDelayed(autoHideFsControls, 3_500L)
        }
    }

    @OptIn(UnstableApi::class)
    private fun initializePlayer(startPositionMs: Long) {
        releasePlayer()
        errorOverlay.visibility = View.GONE
        loadingSpinner.visibility = if (protectionManager.shouldAllowPlayback()) View.VISIBLE else View.GONE

        val exo = if (isOfflineMode) {
            val dataSourceFactory = EncryptedOfflineDataSource.Factory(
                context = this,
                studentId = offlineStudentId,
                expectedLessonId = offlineLessonId
            )
            ExoPlayer.Builder(this)
                .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
                .build()
        } else {
            ExoPlayer.Builder(this).build()
        }
        player = exo
        playerView.player = exo

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> {
                        if (protectionManager.shouldAllowPlayback()) {
                            loadingSpinner.visibility = View.VISIBLE
                        }
                    }
                    Player.STATE_READY -> {
                        loadingSpinner.visibility = View.GONE
                        if (!protectionManager.shouldAllowPlayback()) {
                            exo.pause()
                            exo.playWhenReady = false
                        }
                        Log.i(TAG, "MEDIA3_READY offline=$isOfflineMode durationMs=${exo.duration}")
                    }
                    Player.STATE_ENDED -> {
                        loadingSpinner.visibility = View.GONE
                        reachedCompletion = true
                        renderCompleteButton()
                        persistOfflinePositionIfNeeded(exo.currentPosition, exo.duration, true)
                        Log.i(TAG, "MEDIA3_ENDED posMs=${exo.currentPosition}")
                    }
                    else -> Unit
                }
                updatePlayIcon(exo.isPlaying)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Defensive lock: block Bluetooth/media-key/audio-focus resume while capture warning is active
                if (isPlaying && !protectionManager.shouldAllowPlayback()) {
                    exo.pause()
                    exo.playWhenReady = false
                    updatePlayIcon(false)
                    return
                }
                updatePlayIcon(isPlaying)
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "MEDIA3_ERROR offline=$isOfflineMode code=${error.errorCodeName}")
                val msg = if (isOfflineMode) {
                    "Offline video playback error (${error.errorCodeName}). The local file may need to be re-downloaded."
                } else {
                    "Playback error (${error.errorCodeName}). Check network and tap Retry."
                }
                showError(msg)
            }
        })

        val mediaItem = if (isOfflineMode) {
            MediaItem.Builder()
                .setUri(EncryptedOfflineDataSource.buildInternalUri(offlineLessonId))
                .setMimeType(MimeTypes.VIDEO_MP4)
                .build()
        } else {
            val mediaBuilder = MediaItem.Builder().setUri(streamUrl)
            if (!streamUrl.contains(".m3u8", ignoreCase = true) && !streamUrl.contains(".mkv", ignoreCase = true)) {
                mediaBuilder.setMimeType(MimeTypes.VIDEO_MP4)
            }
            mediaBuilder.build()
        }

        exo.setMediaItem(mediaItem, startPositionMs)
        exo.setPlaybackSpeed(SPEED_STEPS[speedIndex])
        exo.volume = if (isMuted) 0f else 1f
        // Never autoplay if screen recording or external display is already active
        exo.playWhenReady = protectionManager.shouldAllowPlayback()
        exo.prepare()

        uiHandler.removeCallbacks(progressTicker)
        uiHandler.post(progressTicker)
    }

    private fun persistOfflinePositionIfNeeded(posMs: Long, durMs: Long, completedFlag: Boolean) {
        if (!isOfflineMode) return
        val done = completedFlag || reachedCompletion || (durMs > 0L && posMs >= (durMs * 9L) / 10L)
        offlineVault?.updatePlaybackProgress(
            studentId = offlineStudentId,
            lessonId = offlineLessonId,
            lastPositionMs = posMs.coerceAtLeast(0L),
            completed = done
        )
    }

    private fun updatePlayIcon(playing: Boolean) {
        btnPlayPause.setImageResource(if (playing) R.drawable.ic_lms_pause else R.drawable.ic_lms_play)
    }

    private fun showError(msg: String) {
        loadingSpinner.visibility = View.GONE
        txtErrorMessage.text = msg
        errorOverlay.visibility = View.VISIBLE
    }

    private fun updateProgressUi() {
        val p = player ?: return
        val dur = p.duration.coerceAtLeast(0L)
        val pos = p.currentPosition.coerceAtLeast(0L)
        if (dur > 0) {
            lastKnownDurMs = dur
            seekBar.max = dur.toInt()
        }
        lastKnownPosMs = pos
        if (!isUserSeeking) {
            seekBar.progress = pos.toInt()
            txtTimeDisplay.text = "${formatTimeMs(pos)} / ${formatTimeMs(dur)}"
        }
    }

    private fun toggleFullscreen(enable: Boolean) {
        isFullscreen = enable
        fsControlsVisible = false
        uiHandler.removeCallbacks(autoHideFsControls)

        headerBar.visibility = if (enable) View.GONE else View.VISIBLE
        lessonDetailsContainer.visibility = if (enable) View.GONE else View.VISIBLE
        fsTopOverlay.visibility = View.GONE
        controlsDeck.visibility = if (enable || !protectionManager.shouldAllowPlayback()) View.GONE else View.VISIBLE
        btnFullscreen.setImageResource(if (enable) R.drawable.ic_lms_fullscreen_exit else R.drawable.ic_lms_fullscreen)

        val stageParams = videoStage.layoutParams as LinearLayout.LayoutParams
        if (enable) {
            stageParams.height = 0
            stageParams.weight = 1f
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            stageParams.height = (238 * resources.displayMetrics.density).toInt()
            stageParams.weight = 0f
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        videoStage.layoutParams = stageParams
        protectionManager.enforceFlagSecure()

        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (enable) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun finishWithPlaybackResult() {
        val pos = player?.currentPosition?.coerceAtLeast(0L) ?: lastKnownPosMs
        val dur = player?.duration?.coerceAtLeast(0L) ?: lastKnownDurMs
        val isDone = reachedCompletion || (dur > 0 && pos >= (dur * 9L) / 10L)
        persistOfflinePositionIfNeeded(pos, dur, isDone)
        val data = Intent().apply {
            putExtra(RESULT_LAST_POSITION_MS, pos)
            putExtra(RESULT_DURATION_MS, dur)
            putExtra(RESULT_COMPLETED, isDone)
        }
        setResult(Activity.RESULT_OK, data)
        finish()
    }

    private fun formatTimeMs(ms: Long): String {
        val totalSec = (ms / 1000L).coerceAtLeast(0L)
        val mins = totalSec / 60L
        val secs = totalSec % 60L
        return String.format(Locale.US, "%02d:%02d", mins, secs)
    }

    private fun releasePlayer() {
        uiHandler.removeCallbacks(progressTicker)
        player?.let {
            lastKnownPosMs = it.currentPosition.coerceAtLeast(0L)
            lastKnownDurMs = it.duration.coerceAtLeast(0L)
            it.release()
        }
        player = null
    }

    override fun onStop() {
        super.onStop()
        val pos = player?.currentPosition?.coerceAtLeast(0L) ?: lastKnownPosMs
        val dur = player?.duration?.coerceAtLeast(0L) ?: lastKnownDurMs
        persistOfflinePositionIfNeeded(pos, dur, reachedCompletion)
        player?.pause()
        if (::protectionManager.isInitialized) {
            // Re-registering in onStart() ensures fresh Android 15 initial screen-recording state on return
            protectionManager.unregister()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::protectionManager.isInitialized) {
            protectionManager.unregister()
        }
        uiHandler.removeCallbacks(watermarkShifter)
        uiHandler.removeCallbacks(autoHideFsControls)
        releasePlayer()
    }
}
