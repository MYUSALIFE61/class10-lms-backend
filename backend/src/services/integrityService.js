import { GoogleAuth } from 'google-auth-library';
import { generateRandomId } from '../utils/crypto.js';
import { ForbiddenError } from '../utils/errors.js';
import { TtlCache } from '../utils/cache.js';

/**
 * Production Google Play Integrity token decoder using Google Play Integrity REST API.
 */
export class GooglePlayIntegrityProvider {
  constructor(config) {
    this.packageName = config.GOOGLE_PLAY_PACKAGE_NAME;
    this.serviceAccountJson = config.GOOGLE_SERVICE_ACCOUNT_JSON;
    this.auth = null;
  }

  isConfigured() {
    return Boolean(this.serviceAccountJson && this.packageName);
  }

  async decodeToken(integrityToken) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        appRecognitionVerdict: 'UNCONFIGURED',
        deviceRecognitionVerdict: [],
        nonce: null,
      };
    }

    if (!this.auth) {
      const credentials = JSON.parse(this.serviceAccountJson);
      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/playintegrity'],
      });
    }

    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

    const url = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(
      this.packageName
    )}:decodeIntegrityToken`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrity_token: integrityToken }),
    });

    if (!response.ok) {
      throw new Error(`Play Integrity decode failed with HTTP ${response.status}`);
    }

    const body = await response.json();
    const payload = body?.tokenPayloadExternal || {};
    return {
      configured: true,
      nonce: payload?.requestDetails?.nonce || null,
      requestPackageName: payload?.requestDetails?.requestPackageName || null,
      appRecognitionVerdict: payload?.appIntegrity?.appRecognitionVerdict || 'UNKNOWN',
      deviceRecognitionVerdict: payload?.deviceIntegrity?.deviceRecognitionVerdict || [],
      accountLicensingVerdict: payload?.accountDetails?.appLicensingVerdict || 'UNKNOWN',
    };
  }
}

export class IntegrityService {
  constructor({ store, integrityProvider, config }) {
    this.store = store;
    this.integrityProvider = integrityProvider;
    this.config = config;
    this.nonceCache = new TtlCache({ maxEntries: 2000, defaultTtlMs: 5 * 60 * 1000 });
  }

  issueNonce({ userId, deviceId }) {
    const nonce = generateRandomId(24);
    this.nonceCache.set(nonce, { userId, deviceId, issuedAt: Date.now() });
    return {
      nonce,
      cloudProjectNumber: this.config.GOOGLE_CLOUD_PROJECT_NUMBER || null,
      expiresInSeconds: 300,
    };
  }

  async verifyIntegrityToken({ userId, deviceId, integrityToken, ipAddress = null }) {
    const decoded = await this.integrityProvider.decodeToken(integrityToken);

    if (!decoded.configured) {
      return {
        verified: true,
        verdict: 'NOT_CONFIGURED',
        mode: this.config.INTEGRITY_DISTRIBUTION_MODE,
        note: 'Play Integrity credentials not configured on server yet; running in pass-through mode.',
      };
    }

    // Validate single-use nonce bound to user & device
    const expectedNonce = decoded.nonce ? this.nonceCache.get(decoded.nonce) : null;
    if (!expectedNonce || expectedNonce.userId !== userId || expectedNonce.deviceId !== deviceId) {
      await this._recordFailure({
        userId,
        deviceId,
        ipAddress,
        verdict: 'NONCE_MISMATCH',
        decoded,
      });
      return this._handlePolicyOutcome({
        passed: false,
        verdict: 'NONCE_MISMATCH',
      });
    }
    this.nonceCache.delete(decoded.nonce);

    const deviceVerdicts = decoded.deviceRecognitionVerdict || [];
    const meetsDevice =
      deviceVerdicts.includes('MEETS_STRONG_INTEGRITY') ||
      deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY');
    const meetsBasic = meetsDevice || deviceVerdicts.includes('MEETS_BASIC_INTEGRITY');
    const isPlayRecognized = decoded.appRecognitionVerdict === 'PLAY_RECOGNIZED';

    let passed = false;
    let verdict = 'FAILED';

    if (this.config.INTEGRITY_DISTRIBUTION_MODE === 'play_store') {
      passed = isPlayRecognized && meetsDevice;
      verdict = passed ? 'PLAY_VERIFIED' : 'PLAY_POLICY_FAILED';
    } else {
      // Sideloaded APK mode: appRecognitionVerdict is expected to be UNRECOGNIZED_VERSION;
      // rely honestly on device integrity signals rather than locking out direct-APK students.
      passed = meetsBasic;
      verdict = meetsDevice
        ? 'SIDELOAD_DEVICE_INTEGRITY'
        : meetsBasic
          ? 'SIDELOAD_BASIC_INTEGRITY'
          : 'DEVICE_COMPROMISED';
    }

    if (deviceId) {
      await this.store.updateDevice(deviceId, {
        integrity_verdict: verdict,
        last_integrity_check_at: new Date().toISOString(),
      });
    }

    if (!passed) {
      await this._recordFailure({ userId, deviceId, ipAddress, verdict, decoded });
    }

    return this._handlePolicyOutcome({ passed, verdict });
  }

  async _recordFailure({ userId, deviceId, ipAddress, verdict, decoded }) {
    await this.store.logSecurityEvent({
      user_id: userId,
      device_id: deviceId,
      event_type: 'PLAY_INTEGRITY_RISK',
      severity: 'warning',
      ip_address: ipAddress,
      details_json: {
        verdict,
        distributionMode: this.config.INTEGRITY_DISTRIBUTION_MODE,
        appRecognitionVerdict: decoded.appRecognitionVerdict,
        deviceRecognitionVerdict: decoded.deviceRecognitionVerdict,
      },
    });
  }

  _handlePolicyOutcome({ passed, verdict }) {
    if (!passed && this.config.INTEGRITY_ENFORCEMENT_MODE === 'enforce') {
      throw new ForbiddenError(
        'Device security verification failed. Please use an unmodified Android device.',
        'PLAY_INTEGRITY_FAILED',
        { verdict }
      );
    }
    return {
      verified: passed,
      verdict,
      enforcementMode: this.config.INTEGRITY_ENFORCEMENT_MODE,
      distributionMode: this.config.INTEGRITY_DISTRIBUTION_MODE,
    };
  }
}
