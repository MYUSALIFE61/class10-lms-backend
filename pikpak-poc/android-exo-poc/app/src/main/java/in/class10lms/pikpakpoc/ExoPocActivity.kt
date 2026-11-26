package `in`.class10lms.pikpakpoc

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import java.util.Locale

/**
 * Isolated Android Media3 ExoPlayer PoC Activity (Phase 4).
 *
 * - Streams strictly from the localhost proxy (10.0.2.2:4555 or 127.0.0.1:4555 via adb reverse).
 * - Never receives, stores, or logs any PikPak credential or signed PikPak URL.
 * - Keeps playback strictly inside this branded Android activity (never launches PikPak or VLC).
 */
class ExoPocActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PikPakExoPoc"
        private const val EMULATOR_PROXY_URL = "http://10.0.2.2:4555/api/pikpak-poc/stream"
        private const val USB_REVERSE_PROXY_URL = "http://127.0.0.1:4555/api/pikpak-poc/stream"
        private const val SEEK_STEP_MS = 5_000L
    }

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private lateinit var headerBar: View
    private lateinit var diagnosticsPanel: View
    private lateinit var videoStage: FrameLayout
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var errorOverlay: View
    private lateinit var txtErrorMessage: TextView
    private lateinit var txtStateBadge: TextView
    private lateinit var txtCurrentTime: TextView
    private lateinit var txtDuration: TextView
    private lateinit var txtTelemetry: TextView
    private lateinit var seekBar: SeekBar
    private lateinit var btnPlayPause: Button
    private lateinit var btnFullscreen: Button

    private var activeProxyUrl: String = EMULATOR_PROXY_URL
    private var isFullscreen: Boolean = false
    private var isUserSeeking: Boolean = false
    private var playbackStartElapsedMs: Long = 0L
    private var timeToFirstFrameMs: Long = -1L
    private var bufferingCount: Int = 0
    private var seekCount: Int = 0
    private var videoResolution: String = "pending"
    private var lastErrorSummary: String = "none"

    private val uiHandler = Handler(Looper.getMainLooper())
    private val progressTicker = object : Runnable {
        override fun run() {
            updateProgressUi()
            uiHandler.postDelayed(this, 500L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Enable FLAG_SECURE screen capture protection
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContentView(R.layout.activity_exo_poc)

        bindViews()
        setupControls()

        // Allow optional localhost proxy URL override via ADB intent extra (never external hosts)
        val extraUrl = intent?.getStringExtra("proxy_url")
        if (extraUrl != null && (extraUrl.startsWith("http://10.0.2.2:") || extraUrl.startsWith("http://127.0.0.1:"))) {
            activeProxyUrl = extraUrl
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isFullscreen) {
                    toggleFullscreen(false)
                } else {
                    finish()
                }
            }
        })

        initializePlayer(startPositionMs = 0L, autoPlay = true)
    }

    private fun bindViews() {
        playerView = findViewById(R.id.playerView)
        headerBar = findViewById(R.id.headerBar)
        diagnosticsPanel = findViewById(R.id.diagnosticsPanel)
        videoStage = findViewById(R.id.videoStage)
        loadingSpinner = findViewById(R.id.loadingSpinner)
        errorOverlay = findViewById(R.id.errorOverlay)
        txtErrorMessage = findViewById(R.id.txtErrorMessage)
        txtStateBadge = findViewById(R.id.txtStateBadge)
        txtCurrentTime = findViewById(R.id.txtCurrentTime)
        txtDuration = findViewById(R.id.txtDuration)
        txtTelemetry = findViewById(R.id.txtTelemetry)
        seekBar = findViewById(R.id.seekBar)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        btnFullscreen = findViewById(R.id.btnFullscreen)
    }

    private fun setupControls() {
        btnPlayPause.setOnClickListener {
            val p = player ?: return@setOnClickListener
            if (p.isPlaying) {
                p.pause()
            } else {
                if (p.playbackState == Player.STATE_ENDED) {
                    p.seekTo(0L)
                }
                p.play()
            }
        }

        findViewById<Button>(R.id.btnRewind).setOnClickListener {
            val p = player ?: return@setOnClickListener
            val target = (p.currentPosition - SEEK_STEP_MS).coerceAtLeast(0L)
            seekCount += 1
            p.seekTo(target)
            Log.i(TAG, "SEEK_BACKWARD targetMs=$target")
            renderTelemetry()
        }

        findViewById<Button>(R.id.btnForward).setOnClickListener {
            val p = player ?: return@setOnClickListener
            val dur = p.duration.coerceAtLeast(0L)
            val target = if (dur > 0) (p.currentPosition + SEEK_STEP_MS).coerceAtMost(dur) else p.currentPosition + SEEK_STEP_MS
            seekCount += 1
            p.seekTo(target)
            Log.i(TAG, "SEEK_FORWARD targetMs=$target")
            renderTelemetry()
        }

        btnFullscreen.setOnClickListener {
            toggleFullscreen(!isFullscreen)
        }

        findViewById<Button>(R.id.btnRetry).setOnClickListener {
            val resumePos = player?.currentPosition ?: 0L
            initializePlayer(startPositionMs = resumePos, autoPlay = true)
        }

        findViewById<Button>(R.id.btnModeEmulator).setOnClickListener {
            activeProxyUrl = EMULATOR_PROXY_URL
            initializePlayer(startPositionMs = 0L, autoPlay = true)
        }

        findViewById<Button>(R.id.btnModeUsb).setOnClickListener {
            activeProxyUrl = USB_REVERSE_PROXY_URL
            initializePlayer(startPositionMs = 0L, autoPlay = true)
        }

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    txtCurrentTime.text = formatTimeMs(progress.toLong())
                }
            }

            override fun onStartTrackingTouch(sb: SeekBar?) {
                isUserSeeking = true
            }

            override fun onStopTrackingTouch(sb: SeekBar?) {
                isUserSeeking = false
                val target = (sb?.progress ?: 0).toLong()
                seekCount += 1
                player?.seekTo(target)
                Log.i(TAG, "SEEK_BAR targetMs=$target")
                renderTelemetry()
            }
        })
    }

    private fun initializePlayer(startPositionMs: Long, autoPlay: Boolean) {
        releasePlayer()

        errorOverlay.visibility = View.GONE
        loadingSpinner.visibility = View.VISIBLE
        lastErrorSummary = "none"
        timeToFirstFrameMs = -1L
        playbackStartElapsedMs = SystemClock.elapsedRealtime()

        val exo = ExoPlayer.Builder(this).build()
        player = exo
        playerView.player = exo

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                val label = when (playbackState) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> {
                        bufferingCount += 1
                        loadingSpinner.visibility = View.VISIBLE
                        "BUFFERING"
                    }
                    Player.STATE_READY -> {
                        loadingSpinner.visibility = View.GONE
                        if (timeToFirstFrameMs < 0) {
                            timeToFirstFrameMs = SystemClock.elapsedRealtime() - playbackStartElapsedMs
                            Log.i(TAG, "PLAYBACK_READY ttffMs=$timeToFirstFrameMs durationMs=${exo.duration}")
                        }
                        if (exo.isPlaying) "PLAYING" else "READY"
                    }
                    Player.STATE_ENDED -> {
                        loadingSpinner.visibility = View.GONE
                        "ENDED"
                    }
                    else -> "UNKNOWN"
                }
                txtStateBadge.text = label
                btnPlayPause.text = if (exo.isPlaying) "Pause" else "Play"
                Log.i(TAG, "STATE=$label posMs=${exo.currentPosition} durMs=${exo.duration}")
                renderTelemetry()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                btnPlayPause.text = if (isPlaying) "Pause" else "Play"
                if (exo.playbackState == Player.STATE_READY) {
                    txtStateBadge.text = if (isPlaying) "PLAYING" else "PAUSED"
                }
                renderTelemetry()
            }

            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    videoResolution = "${videoSize.width}x${videoSize.height}"
                    Log.i(TAG, "VIDEO_SIZE=$videoResolution")
                    renderTelemetry()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                loadingSpinner.visibility = View.GONE
                lastErrorSummary = "${error.errorCodeName}: ${error.message ?: "Stream error"}"
                txtStateBadge.text = "ERROR"
                txtErrorMessage.text = "Playback error (${error.errorCodeName}). Ensure localhost proxy is running on port 4555."
                errorOverlay.visibility = View.VISIBLE
                Log.e(TAG, "EXO_ERROR code=${error.errorCodeName} msg=${error.message}")
                renderTelemetry()
            }
        })

        val mediaItem = MediaItem.Builder()
            .setUri(activeProxyUrl)
            .setMimeType(MimeTypes.VIDEO_MP4)
            .build()

        exo.setMediaItem(mediaItem, startPositionMs)
        exo.playWhenReady = autoPlay
        exo.prepare()

        uiHandler.removeCallbacks(progressTicker)
        uiHandler.post(progressTicker)
        renderTelemetry()
    }

    private fun updateProgressUi() {
        val p = player ?: return
        val dur = p.duration.coerceAtLeast(0L)
        val pos = p.currentPosition.coerceAtLeast(0L)
        if (dur > 0) {
            seekBar.max = dur.toInt()
            txtDuration.text = formatTimeMs(dur)
        }
        if (!isUserSeeking) {
            seekBar.progress = pos.toInt()
            txtCurrentTime.text = formatTimeMs(pos)
        }
        renderTelemetry()
    }

    private fun toggleFullscreen(enable: Boolean) {
        isFullscreen = enable
        headerBar.visibility = if (enable) View.GONE else View.VISIBLE
        diagnosticsPanel.visibility = if (enable) View.GONE else View.VISIBLE
        btnFullscreen.text = if (enable) "Exit" else "Full"

        val params = videoStage.layoutParams as LinearLayout.LayoutParams
        if (enable) {
            params.height = 0
            params.weight = 1f
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            params.height = (240 * resources.displayMetrics.density).toInt()
            params.weight = 0f
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        videoStage.layoutParams = params

        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (enable) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun renderTelemetry() {
        val p = player
        val pos = p?.currentPosition?.coerceAtLeast(0L) ?: 0L
        val dur = p?.duration?.coerceAtLeast(0L) ?: 0L
        val buf = p?.bufferedPercentage ?: 0
        txtTelemetry.text = buildString {
            appendLine("Proxy Endpoint : $activeProxyUrl")
            appendLine("Player Engine  : AndroidX Media3 ExoPlayer 1.5.1")
            appendLine("State          : ${txtStateBadge.text} (playing=${p?.isPlaying == true})")
            appendLine("Position / Dur : ${formatTimeMs(pos)} / ${formatTimeMs(dur)} (buffered=$buf%)")
            appendLine("Resolution     : $videoResolution")
            appendLine("Time to Ready  : ${if (timeToFirstFrameMs >= 0) "${timeToFirstFrameMs} ms" else "measuring..."}")
            appendLine("Buffers / Seeks: $bufferingCount / $seekCount")
            appendLine("Last Error     : $lastErrorSummary")
        }
    }

    private fun formatTimeMs(ms: Long): String {
        val totalSec = (ms / 1000L).coerceAtLeast(0L)
        val mins = totalSec / 60L
        val secs = totalSec % 60L
        return String.format(Locale.US, "%02d:%02d", mins, secs)
    }

    private fun releasePlayer() {
        uiHandler.removeCallbacks(progressTicker)
        player?.release()
        player = null
    }

    override fun onStop() {
        super.onStop()
        player?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        releasePlayer()
    }
}
