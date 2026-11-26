import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 1: Auth, Session Revocation & Device Limits', () => {
  let app;
  let store;
  let authProvider;
  let config;

  const deviceA = {
    deviceId: 'android-device-pixel-0001',
    deviceName: 'Redmi Note 12',
    manufacturer: 'Xiaomi',
    osVersion: '13',
    appVersion: '1.0.0',
    platform: 'android',
  };

  const deviceB = {
    deviceId: 'android-device-samsung-0002',
    deviceName: 'Galaxy M34',
    manufacturer: 'Samsung',
    osVersion: '14',
    appVersion: '1.0.0',
    platform: 'android',
  };

  beforeEach(() => {
    config = makeTestConfig({ MAX_DEVICES_PER_STUDENT: 1 });
    store = new InMemoryDataStore();
    authProvider = new InMemoryAuthProvider();
    ({ app } = createApp({ config, store, authProvider, disableRateLimit: true }));
  });

  it('health endpoint responds with ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('registers student, logs in successfully, and fetches /me profile', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'ravi.ap10@example.com',
      password: 'StrongPassword123',
      fullName: 'Ravi Kumar',
      phone: '9876543210',
      board: 'AP',
      device: deviceA,
    });

    expect(reg.status).toBe(201);
    expect(reg.body.success).toBe(true);
    expect(reg.body.data.user.board).toBe('AP');
    expect(reg.body.data.tokens.accessToken).toBeTruthy();
    expect(reg.body.data.tokens.refreshToken).toBeTruthy();

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'ravi.ap10@example.com',
      password: 'StrongPassword123',
      device: deviceA,
    });
    expect(login.status).toBe(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.fullName).toBe('Ravi Kumar');
    expect(me.body.data.subscription.isActive).toBe(false);
  });

  it('rejects incorrect login credentials with 401', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'anitha.ts10@example.com',
      password: 'CorrectPassword99',
      fullName: 'Anitha Reddy',
      board: 'TS',
      device: deviceA,
    });

    const bad = await request(app).post('/api/v1/auth/login').send({
      email: 'anitha.ts10@example.com',
      password: 'WrongPassword00',
      device: deviceA,
    });

    expect(bad.status).toBe(401);
    expect(bad.body.success).toBe(false);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('enforces MAX_DEVICES_PER_STUDENT=1 and permits login after revoking old device', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'suresh.ap@example.com',
      password: 'Password1234',
      fullName: 'Suresh Babu',
      board: 'AP',
      device: deviceA,
    });
    const tokenA = reg.body.data.tokens.accessToken;
    const deviceAId = reg.body.data.device.id;

    // Second device blocked by device cap
    const blocked = await request(app).post('/api/v1/auth/login').send({
      email: 'suresh.ap@example.com',
      password: 'Password1234',
      device: deviceB,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('DEVICE_LIMIT_REACHED');
    expect(store.securityEvents.some((e) => e.event_type === 'DEVICE_LIMIT_EXCEEDED')).toBe(true);

    // Revoke device A
    const revokeRes = await request(app)
      .delete(`/api/v1/devices/${deviceAId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(revokeRes.status).toBe(200);

    // Token A must immediately stop working after device A is revoked
    const staleMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(staleMe.status).toBe(401);

    // Device B can now register & log in cleanly
    const loginB = await request(app).post('/api/v1/auth/login').send({
      email: 'suresh.ap@example.com',
      password: 'Password1234',
      device: deviceB,
    });
    expect(loginB.status).toBe(200);
    expect(loginB.body.data.device.deviceName).toBe('Galaxy M34');
  });

  it('rotates refresh token and revokes session on refresh token reuse attack', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'lakshmi@example.com',
      password: 'Password1234',
      fullName: 'Lakshmi Devi',
      board: 'TS',
      device: deviceA,
    });

    const firstRefresh = reg.body.data.tokens.refreshToken;
    const rotated = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: firstRefresh,
      deviceId: deviceA.deviceId,
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.tokens.refreshToken).not.toBe(firstRefresh);

    // Reusing old refresh token must fail and revoke session
    const replay = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: firstRefresh,
      deviceId: deviceA.deviceId,
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // Even the newly rotated access token is now invalid because session was revoked
    const afterReuse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotated.body.data.tokens.accessToken}`);
    expect(afterReuse.status).toBe(401);
  });

  it('logout invalidates current session token immediately', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'kiran@example.com',
      password: 'Password1234',
      fullName: 'Kiran Sai',
      board: 'AP',
      device: deviceA,
    });

    const token = reg.body.data.tokens.accessToken;
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(logout.status).toBe(200);

    const afterLogout = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error.code).toBe('SESSION_REVOKED');
  });

  it('flags suspicious concurrent logins when MAX_DEVICES_PER_STUDENT=2', async () => {
    config = makeTestConfig({ MAX_DEVICES_PER_STUDENT: 2 });
    ({ app } = createApp({ config, store, authProvider, disableRateLimit: true }));

    await request(app).post('/api/v1/auth/register').send({
      email: 'dual@example.com',
      password: 'Password1234',
      fullName: 'Dual Device Student',
      board: 'AP',
      device: deviceA,
    });

    const loginB = await request(app).post('/api/v1/auth/login').send({
      email: 'dual@example.com',
      password: 'Password1234',
      device: deviceB,
    });
    expect(loginB.status).toBe(200);
    expect(loginB.body.data.securityNotice).toContain('Another active session');
    expect(store.securityEvents.some((e) => e.event_type === 'SUSPICIOUS_CONCURRENT_LOGIN')).toBe(true);
  });
});
