# Android Build, Signing & Deployment Instructions

## Prerequisites
- **Node.js:** v20+ (Verified on `v22.23.2`)
- **Java JDK:** OpenJDK 17 (Verified on `17.0.18`; `JAVA_HOME` set)
- **Android SDK:** Installed with `ANDROID_HOME` configured, platform `android-36`, and `build-tools` `35.0.0` / `36.0.0`

---

## 1. Configure Production Frontend Environment

Create `frontend/.env.production` (do NOT commit secrets; only public API URL is needed):

```env
VITE_API_BASE_URL=https://api.yourdomain.in/api/v1
VITE_APP_NAME=Class 10 SSC LMS
VITE_APP_VERSION=1.0.0
VITE_SUPPORT_EMAIL=support@yourdomain.in
```

---

## 2. Build React Web Bundle & Sync Capacitor

```powershell
cd "d:\Downloads\Android apk file\frontend"
npm install
npm run build
npx cap sync android
```

---

## 3. Build Debug APK (Testing)

```powershell
cd "d:\Downloads\Android apk file\frontend\android"
.\gradlew.bat assembleDebug
```

Output path:
`frontend\android\app\build\outputs\apk\debug\app-debug.apk`

Install onto a connected USB-debugging Android phone or emulator:
```powershell
adb install -r "app\build\outputs\apk\debug\app-debug.apk"
```

---

## 4. Generate a Production Release Keystore (One-Time)

> [!CAUTION]
> Back up `release-upload.jks` and its passwords in a secure password manager / offline vault. Never commit them to Git. Losing the keystore prevents updating the installed app on student phones.

```powershell
keytool -genkeypair -v `
  -keystore "d:\Downloads\Android apk file\frontend\android\app\release-upload.jks" `
  -alias class10lms-release `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=Class 10 SSC LMS, OU=Education, O=Class10LMS, L=Hyderabad, ST=Telangana, C=IN"
```

Create `frontend\android\keystore.properties` (gitignored):
```properties
storeFile=release-upload.jks
storePassword=YOUR_STRONG_STORE_PASSWORD
keyAlias=class10lms-release
keyPassword=YOUR_STRONG_KEY_PASSWORD
```

---

## 5. Build & Verify Signed Release APK

```powershell
cd "d:\Downloads\Android apk file\frontend\android"
.\gradlew.bat assembleRelease
```

Output path:
`frontend\android\app\build\outputs\apk\release\app-release.apk`

Verify APK signature (v2/v3 signing schemes):
```powershell
& "$env:ANDROID_HOME\build-tools\35.0.0\apksigner.bat" verify --verbose --print-certs "app\build\outputs\apk\release\app-release.apk"
```
