$ErrorActionPreference = "Continue"
$apk = "d:\Downloads\Android apk file\pikpak-poc\android-exo-poc\app\build\outputs\apk\debug\app-debug.apk"

Write-Output "=== 1. WAITING FOR ANDROID 34 EMULATOR BOOT ==="
$booted = $false
for ($i = 0; $i -lt 90; $i++) {
  $dev = adb devices 2>&1 | Out-String
  if ($dev -match "emulator-\d+\s+device") {
    $prop = (adb shell getprop sys.boot_completed 2>&1 | Out-String).Trim()
    if ($prop -eq "1") {
      $booted = $true
      Write-Output "EMULATOR_BOOTED after $($i * 2)s"
      break
    }
  }
  Start-Sleep -Seconds 2
}

if (-not $booted) {
  Write-Output "EMULATOR_BOOT_TIMEOUT"
  adb devices 2>&1
  exit 2
}

# Dismiss keyguard & keep screen awake
adb shell wm dismiss-keyguard 2>&1 | Out-Null
adb shell input keyevent 82 2>&1 | Out-Null

Write-Output "=== 2. INSTALLING MEDIA3 EXOPLAYER POC APK ==="
adb install -r "$apk" 2>&1

Write-Output "=== 3. LAUNCHING EXOPLAYER POC AGAINST 10.0.2.2:4555 ==="
adb logcat -c
adb shell am start -n in.class10lms.pikpakpoc/.ExoPocActivity --es proxy_url "http://10.0.2.2:4555/api/pikpak-poc/stream" 2>&1

# Wait for initial load & playback
Start-Sleep -Seconds 10

function Tap-UiButton {
  param([string]$TextLabel)
  adb shell uiautomator dump /sdcard/ui.xml 2>&1 | Out-Null
  $xmlStr = (adb shell cat /sdcard/ui.xml 2>&1 | Out-String)
  $escaped = [regex]::Escape($TextLabel)
  $m = [regex]::Match($xmlStr, "text=`"$escaped`"[^>]*bounds=`"\[(\d+),(\d+)\]\[(\d+),(\d+)\]`"")
  if ($m.Success) {
    $cx = [int](([int]$m.Groups[1].Value + [int]$m.Groups[3].Value) / 2)
    $cy = [int](([int]$m.Groups[2].Value + [int]$m.Groups[4].Value) / 2)
    Write-Output "TAP [$TextLabel] at ($cx, $cy)"
    adb shell input tap $cx $cy 2>&1 | Out-Null
    return $true
  }
  Write-Output "BTN_NOT_FOUND: $TextLabel"
  return $false
}

Write-Output "=== 4. EXERCISING SEEK, PAUSE, RESUME, AND FULLSCREEN ROTATION ==="
Tap-UiButton "+5s" | Out-Null
Start-Sleep -Seconds 2
Tap-UiButton "-5s" | Out-Null
Start-Sleep -Seconds 2
Tap-UiButton "Pause" | Out-Null
Start-Sleep -Seconds 2
Tap-UiButton "Play" | Out-Null
Start-Sleep -Seconds 2
Tap-UiButton "Full" | Out-Null
Start-Sleep -Seconds 2

Write-Output "=== 5. VERIFY TOP ACTIVITY STAYS INSIDE POC APP (NO VLC/PIKPAK LAUNCH) ==="
adb shell dumpsys activity activities 2>&1 | Select-String -Pattern "topResumedActivity|mResumedActivity|ResumedActivity" | Select-Object -First 4

# Exit fullscreen via Android Back
adb shell input keyevent 4 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Output "=== 6. CAPTURE PLAYBACK TELEMETRY LOGCAT ==="
adb logcat -d -s PikPakExoPoc:I PikPakExoPoc:E 2>&1

Write-Output "=== 7. TEST ERROR HANDLING (UNREACHABLE LOCALHOST PORT 4559) ==="
adb logcat -c
adb shell am force-stop in.class10lms.pikpakpoc 2>&1 | Out-Null
adb shell am start -n in.class10lms.pikpakpoc/.ExoPocActivity --es proxy_url "http://10.0.2.2:4559/api/pikpak-poc/stream" 2>&1
Start-Sleep -Seconds 4
adb logcat -d -s PikPakExoPoc:I PikPakExoPoc:E 2>&1

Write-Output "=== 8. PROXY HEALTH & STREAM STATS ==="
(Invoke-RestMethod -Uri "http://127.0.0.1:4555/api/pikpak-poc/health" -UseBasicParsing) | ConvertTo-Json -Depth 4
