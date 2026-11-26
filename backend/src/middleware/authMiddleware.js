import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors.js';

export function createAuthMiddleware({ store, config }) {
  return async function requireAuth(req, _res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing Bearer authentication token', 'MISSING_TOKEN');
      }

      const token = authHeader.slice(7).trim();
      let payload;
      try {
        payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
      } catch {
        throw new UnauthorizedError('Access token is invalid or expired', 'TOKEN_EXPIRED');
      }

      if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
        throw new UnauthorizedError('Malformed access token', 'INVALID_TOKEN');
      }

      const session = await store.getSessionById(payload.sid);
      if (!session || session.user_id !== payload.sub) {
        throw new UnauthorizedError('Session does not exist', 'SESSION_NOT_FOUND');
      }
      if (session.is_revoked) {
        throw new UnauthorizedError('Session has been logged out or revoked', 'SESSION_REVOKED');
      }
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedError('Session expired. Please log in again.', 'SESSION_EXPIRED');
      }
      if (session.token_jti !== payload.jti) {
        throw new UnauthorizedError('Access token superseded by newer session rotation', 'TOKEN_SUPERSEDED');
      }

      // Check bound device is still active
      if (session.device_id) {
        const device = await store.getDeviceById(session.device_id);
        if (!device || !device.is_active) {
          throw new UnauthorizedError('Registered device was revoked', 'DEVICE_REVOKED');
        }
        req.device = device;
      }

      const profile = await store.getProfileById(payload.sub);
      if (!profile || !profile.is_active) {
        throw new UnauthorizedError('Student account is unavailable', 'ACCOUNT_DISABLED');
      }

      req.user = profile;
      req.session = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}
