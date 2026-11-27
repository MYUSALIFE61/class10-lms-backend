import jwt from 'jsonwebtoken';
import {
  generateRandomId,
  generateStudentCode,
  sha256Hex,
} from '../utils/crypto.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { buildSubscriptionSummary } from './paymentService.js';

export function formatStudentProfileDto(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    fullName: profile.full_name,
    username: profile.username || null,
    email: profile.email,
    phone: profile.phone,
    state: profile.state || (profile.board === 'TS' ? 'Telangana' : 'Andhra Pradesh'),
    district: profile.district || '',
    schoolName: profile.school || '',
    className: profile.class_name || 'Class 10',
    board: profile.board,
    studentCode: profile.student_code,
    role: profile.role,
  };
}

export class AuthService {
  constructor({ store, authProvider, deviceService, config }) {
    this.store = store;
    this.authProvider = authProvider;
    this.deviceService = deviceService;
    this.config = config;
  }

  issueTokens({ userId, sessionId, deviceId, role }) {
    const jti = generateRandomId(16);
    const accessToken = jwt.sign(
      { sub: userId, sid: sessionId, did: deviceId, role, jti, typ: 'access' },
      this.config.JWT_ACCESS_SECRET,
      { expiresIn: this.config.JWT_ACCESS_TTL }
    );

    const refreshToken = jwt.sign(
      { sub: userId, sid: sessionId, did: deviceId, jti: generateRandomId(16), typ: 'refresh' },
      this.config.JWT_REFRESH_SECRET,
      { expiresIn: `${this.config.JWT_REFRESH_TTL_DAYS}d` }
    );

    return { accessToken, refreshToken, jti };
  }

  async detectConcurrentSessions({ userId, currentDeviceId, currentIp }) {
    const activeSessions = await this.store.listActiveSessionsForUser(userId);
    const windowMs = this.config.CONCURRENT_SESSION_WINDOW_MINUTES * 60 * 1000;
    const cutoff = Date.now() - windowMs;

    const conflicting = activeSessions.filter((s) => {
      const lastAct = new Date(s.last_activity_at || s.created_at).getTime();
      const differentDevice = s.device_id && currentDeviceId && s.device_id !== currentDeviceId;
      return differentDevice && lastAct >= cutoff;
    });

    if (conflicting.length > 0) {
      await this.store.logSecurityEvent({
        user_id: userId,
        device_id: currentDeviceId,
        event_type: 'SUSPICIOUS_CONCURRENT_LOGIN',
        severity: 'warning',
        ip_address: currentIp,
        details_json: {
          conflictingSessionCount: conflicting.length,
          conflictingDeviceIds: [...new Set(conflicting.map((c) => c.device_id))],
        },
      });
      return true;
    }
    return false;
  }

  async register({
    email,
    password,
    fullName,
    username = null,
    phone = null,
    state = null,
    district = '',
    schoolName = '',
    className = 'Class 10',
    board = 'AP',
    device,
    ipAddress = null,
    userAgent = null,
  }) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username ? username.trim().toLowerCase() : null;
    const normalizedPhone = phone ? phone.replace(/[\s\-]/g, '').trim() : null;
    const resolvedState = state?.trim() || (board === 'TS' ? 'Telangana' : 'Andhra Pradesh');

    if (normalizedUsername && this.store.getProfileByUsername) {
      const existingUsername = await this.store.getProfileByUsername(normalizedUsername);
      if (existingUsername) {
        throw new ConflictError('Username is already taken. Please choose another.', 'USERNAME_EXISTS');
      }
    }

    const authUser = await this.authProvider.signUp({
      email: normalizedEmail,
      password,
      fullName: fullName.trim(),
    });

    let profile = await this.store.getProfileById(authUser.id);
    if (!profile) {
      try {
        profile = await this.store.createProfile({
          id: authUser.id,
          full_name: fullName.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          phone: normalizedPhone,
          board,
          state: resolvedState,
          district: district.trim(),
          school: schoolName.trim(),
          class_name: className.trim() || 'Class 10',
          student_code: generateStudentCode(board),
          role: 'student',
          is_active: true,
        });
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('username')) {
          throw new ConflictError('Username is already taken. Please choose another.', 'USERNAME_EXISTS');
        }
        if (msg.includes('phone')) {
          throw new ConflictError('An account with this mobile number already exists.', 'PHONE_EXISTS');
        }
        throw err;
      }
    }

    return this._createAuthenticatedSession({
      profile,
      device,
      ipAddress,
      userAgent,
    });
  }

  async login({ email, password, device, ipAddress = null, userAgent = null }) {
    let resolvedEmail = email.trim().toLowerCase();
    if (!resolvedEmail.includes('@') && typeof this.store.getProfileByUsername === 'function') {
      const byUsername = await this.store.getProfileByUsername(resolvedEmail);
      if (byUsername?.email) {
        resolvedEmail = byUsername.email.trim().toLowerCase();
      }
    }
    const authUser = await this.authProvider.verifyCredentials({
      email: resolvedEmail,
      password,
    });

    let profile = await this.store.getProfileById(authUser.id);
    if (!profile) {
      profile = await this.store.createProfile({
        id: authUser.id,
        full_name: normalizedEmail.split('@')[0],
        email: normalizedEmail,
        board: 'AP',
        student_code: generateStudentCode('AP'),
        role: 'student',
        is_active: true,
      });
    }

    if (!profile.is_active) {
      throw new ForbiddenError('Student account is deactivated. Contact support.', 'ACCOUNT_DISABLED');
    }

    return this._createAuthenticatedSession({
      profile,
      device,
      ipAddress,
      userAgent,
    });
  }

  async _createAuthenticatedSession({ profile, device, ipAddress, userAgent }) {
    const registeredDevice = await this.deviceService.registerOrTouchDevice({
      userId: profile.id,
      rawDeviceId: device.deviceId,
      deviceName: device.deviceName,
      manufacturer: device.manufacturer,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      platform: device.platform || 'android',
      ipAddress,
    });

    const concurrentDetected = await this.detectConcurrentSessions({
      userId: profile.id,
      currentDeviceId: registeredDevice.id,
      currentIp: ipAddress,
    });

    const expiresAt = new Date(
      Date.now() + this.config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const placeholderJti = generateRandomId(16);
    const placeholderRefreshHash = sha256Hex(generateRandomId(24));

    const session = await this.store.createSession({
      user_id: profile.id,
      device_id: registeredDevice.id,
      token_jti: placeholderJti,
      refresh_token_hash: placeholderRefreshHash,
      ip_address: ipAddress,
      user_agent: userAgent,
      is_revoked: false,
      last_activity_at: new Date().toISOString(),
      expires_at: expiresAt,
    });

    const { accessToken, refreshToken, jti } = this.issueTokens({
      userId: profile.id,
      sessionId: session.id,
      deviceId: registeredDevice.id,
      role: profile.role,
    });

    await this.store.updateSession(session.id, {
      token_jti: jti,
      refresh_token_hash: sha256Hex(refreshToken),
    });

    // Enforce single active session per device (keeps session table tidy)
    if (concurrentDetected && this.config.MAX_DEVICES_PER_STUDENT === 1) {
      await this.store.revokeAllSessionsForUser(profile.id, 'concurrent_login_replaced', {
        exceptSessionId: session.id,
      });
    }

    const latestSub = await this.store.getLatestSubscription(profile.id);
    const subscription = buildSubscriptionSummary(latestSub);

    return {
      user: formatStudentProfileDto(profile),
      device: {
        id: registeredDevice.id,
        deviceName: registeredDevice.device_name,
      },
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: this.config.JWT_ACCESS_TTL,
      },
      subscription,
      securityNotice: concurrentDetected
        ? 'Another active session was detected and flagged for account safety.'
        : null,
    };
  }

  async refresh({ refreshToken, rawDeviceId, ipAddress = null }) {
    let payload;
    try {
      payload = jwt.verify(refreshToken, this.config.JWT_REFRESH_SECRET);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    if (payload.typ !== 'refresh' || !payload.sid || !payload.sub) {
      throw new UnauthorizedError('Malformed refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const session = await this.store.getSessionById(payload.sid);
    if (!session || session.user_id !== payload.sub) {
      throw new UnauthorizedError('Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.is_revoked || new Date(session.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedError('Session has been revoked or expired', 'SESSION_REVOKED');
    }

    const incomingHash = sha256Hex(refreshToken);
    if (session.refresh_token_hash !== incomingHash) {
      // Refresh token reuse attack detected — revoke entire session immediately!
      await this.store.updateSession(session.id, {
        is_revoked: true,
        revoked_reason: 'refresh_token_reuse_detected',
      });
      await this.store.logSecurityEvent({
        user_id: session.user_id,
        device_id: session.device_id,
        event_type: 'REFRESH_TOKEN_REUSE',
        severity: 'critical',
        ip_address: ipAddress,
        details_json: { sessionId: session.id },
      });
      throw new UnauthorizedError(
        'Refresh token reuse detected. Please log in again.',
        'TOKEN_REUSE_DETECTED'
      );
    }

    // Verify bound device is still active
    if (rawDeviceId) {
      await this.deviceService.verifyDeviceActive({
        userId: session.user_id,
        rawDeviceId,
        boundDeviceId: session.device_id,
      });
    } else if (session.device_id) {
      const dev = await this.store.getDeviceById(session.device_id);
      if (!dev || !dev.is_active) {
        throw new UnauthorizedError('Registered device was revoked', 'DEVICE_REVOKED');
      }
    }

    const profile = await this.store.getProfileById(session.user_id);
    if (!profile || !profile.is_active) {
      throw new UnauthorizedError('Account unavailable', 'ACCOUNT_DISABLED');
    }

    const { accessToken, refreshToken: newRefreshToken, jti } = this.issueTokens({
      userId: profile.id,
      sessionId: session.id,
      deviceId: session.device_id,
      role: profile.role,
    });

    const newExpiresAt = new Date(
      Date.now() + this.config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    await this.store.updateSession(session.id, {
      token_jti: jti,
      refresh_token_hash: sha256Hex(newRefreshToken),
      ip_address: ipAddress || session.ip_address,
      last_activity_at: new Date().toISOString(),
      expires_at: newExpiresAt,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.JWT_ACCESS_TTL,
    };
  }

  async logout({ sessionId, userId, allDevices = false }) {
    if (allDevices) {
      await this.store.revokeAllSessionsForUser(userId, 'user_logout_all');
    } else if (sessionId) {
      await this.store.updateSession(sessionId, {
        is_revoked: true,
        revoked_reason: 'user_logout',
      });
    }
    return { loggedOut: true };
  }
}
