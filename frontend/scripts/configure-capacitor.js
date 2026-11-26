/**
 * Configures frontend/capacitor.config.json for either 'prod' (default, secure) or 'dev' (local testing).
 * Usage:
 *   node scripts/configure-capacitor.js prod
 *   node scripts/configure-capacitor.js dev
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = path.resolve(__dirname, '..', 'capacitor.config.json');

const mode = (process.argv[2] || 'prod').toLowerCase();
const isDev = mode === 'dev' || mode === 'development';

const config = {
  appId: 'in.class10lms.ssc',
  appName: 'Class 10 SSC LMS',
  webDir: 'dist',
  server: {
    androidScheme: isDev ? 'http' : 'https',
    hostname: isDev ? 'localhost' : 'app.class10lms.in',
    cleartext: isDev,
  },
  android: {
    allowMixedContent: isDev,
    captureInput: true,
    webContentsDebuggingEnabled: isDev,
    backgroundColor: '#0F172A',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1E3A8A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1E3A8A',
    },
  },
};

fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`[CAPACITOR CONFIG] Applied ${isDev ? 'DEVELOPMENT (localhost/cleartext)' : 'PRODUCTION (strict https/no-debugging)'} profile to capacitor.config.json`);
