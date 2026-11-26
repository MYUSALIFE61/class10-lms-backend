import { hmacSha256Hex } from '../utils/crypto.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

export class DeviceService {
  constructor({ store, config }) {
    this.store = store;
    this.config = config;
  }

  hashDeviceId(rawDeviceId) {
    return hmacSha256Hex(this.config.DEVICE_HASH_SECRET, rawDeviceId.trim());
  }

  async registerOrTouchDevice({
    userId,
    rawDeviceId,
    deviceName,
    manufacturer = null,
    osVersion = null,
    appVersion = null,
    platform = 'android',
    ipAddress = null,
  }) {
    const deviceIdHash = this.hashDeviceId(rawDeviceId);
    const existing = await this.store.getDeviceByUserAndHash(userId, deviceIdHash);
    const nowIso = new Date().toISOString();

    if (existing && existing.is_active) {
      return this.store.updateDevice(existing.id, {
        device_name: deviceName || existing.device_name,
        manufacturer: manufacturer ?? existing.manufacturer,
        os_version: osVersion ?? existing.os_version,
        app_version: appVersion ?? existing.app_version,
        last_seen_at: nowIso,
      });
    }

    const activeDevices = await this.store.listUserDevices(userId, { activeOnly: true });
    if (activeDevices.length >= this.config.MAX_DEVICES_PER_STUDENT) {
      await this.store.logSecurityEvent({
        user_id: userId,
        device_id: existing?.id || null,
        event_type: 'DEVICE_LIMIT_EXCEEDED',
        severity: 'warning',
        ip_address: ipAddress,
        details_json: {
          maxAllowed: this.config.MAX_DEVICES_PER_STUDENT,
          activeDeviceCount: activeDevices.length,
          attemptedDeviceName: deviceName,
        },
      });
      throw new ForbiddenError(
        `Device limit reached (${this.config.MAX_DEVICES_PER_STUDENT} active device allowed). Revoke an existing device from Profile Settings first.`,
        'DEVICE_LIMIT_REACHED',
        {
          maxDevices: this.config.MAX_DEVICES_PER_STUDENT,
          activeDevices: activeDevices.map((d) => ({
            id: d.id,
            deviceName: d.device_name,
            lastSeenAt: d.last_seen_at,
          })),
        }
      );
    }

    if (existing && !existing.is_active) {
      return this.store.updateDevice(existing.id, {
        is_active: true,
        revoked_at: null,
        device_name: deviceName || existing.device_name,
        manufacturer: manufacturer ?? existing.manufacturer,
        os_version: osVersion ?? existing.os_version,
        app_version: appVersion ?? existing.app_version,
        last_seen_at: nowIso,
      });
    }

    return this.store.upsertDevice({
      user_id: userId,
      device_id_hash: deviceIdHash,
      device_name: deviceName || 'Android Device',
      manufacturer,
      os_version: osVersion,
      app_version: appVersion,
      platform,
      is_active: true,
      registered_at: nowIso,
      last_seen_at: nowIso,
    });
  }

  async listDevices(userId) {
    const devices = await this.store.listUserDevices(userId);
    return devices.map((d) => ({
      id: d.id,
      deviceName: d.device_name,
      manufacturer: d.manufacturer,
      osVersion: d.os_version,
      appVersion: d.app_version,
      platform: d.platform,
      isActive: d.is_active,
      integrityVerdict: d.integrity_verdict,
      registeredAt: d.registered_at,
      lastSeenAt: d.last_seen_at,
      revokedAt: d.revoked_at,
    }));
  }

  async revokeDevice({ userId, deviceId, ipAddress = null }) {
    const device = await this.store.getDeviceById(deviceId);
    if (!device || device.user_id !== userId) {
      throw new NotFoundError('Device not found', 'DEVICE_NOT_FOUND');
    }

    const updated = await this.store.updateDevice(device.id, {
      is_active: false,
      revoked_at: new Date().toISOString(),
    });
    await this.store.revokeSessionsByDevice(userId, device.id, 'device_revoked');
    await this.store.logSecurityEvent({
      user_id: userId,
      device_id: device.id,
      event_type: 'DEVICE_REVOKED',
      severity: 'info',
      ip_address: ipAddress,
      details_json: { deviceName: device.device_name },
    });
    return updated;
  }

  async verifyDeviceActive({ userId, rawDeviceId, boundDeviceId = null }) {
    const deviceIdHash = this.hashDeviceId(rawDeviceId);
    const device = await this.store.getDeviceByUserAndHash(userId, deviceIdHash);
    if (!device || !device.is_active) {
      throw new ForbiddenError(
        'This device is not registered or has been revoked.',
        'DEVICE_NOT_REGISTERED'
      );
    }
    if (boundDeviceId && device.id !== boundDeviceId) {
      throw new ForbiddenError(
        'Session token is bound to a different registered device.',
        'DEVICE_MISMATCH'
      );
    }
    return device;
  }
}
