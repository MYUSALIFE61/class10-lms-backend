import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { hasPermission } from '../services/adminRbac.js';

export function createAdminAuthMiddleware({ store, adminAuthService }) {
  async function requireAdmin(req, _res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing Admin Bearer authentication token', 'ADMIN_MISSING_TOKEN');
      }

      const token = authHeader.slice(7).trim();
      const payload = adminAuthService.verifyAccessToken(token);

      const session = await store.getAdminSessionById(payload.sid);
      if (!session || session.admin_id !== payload.sub || session.is_revoked) {
        throw new UnauthorizedError('Admin session revoked or invalid', 'ADMIN_SESSION_REVOKED');
      }
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedError('Admin session expired', 'ADMIN_SESSION_EXPIRED');
      }
      if (session.token_jti !== payload.jti) {
        throw new UnauthorizedError('Admin token superseded', 'ADMIN_TOKEN_SUPERSEDED');
      }

      const admin = await store.getAdminById(payload.sub);
      if (!admin || !admin.is_active) {
        throw new ForbiddenError('Administrator account is disabled', 'ADMIN_ACCOUNT_DISABLED');
      }

      req.admin = admin;
      req.adminSession = session;
      next();
    } catch (err) {
      next(err);
    }
  }

  function requirePermission(permission) {
    return function checkAdminPermission(req, _res, next) {
      try {
        if (!req.admin) {
          throw new UnauthorizedError('Admin authentication required', 'ADMIN_UNAUTHORIZED');
        }
        if (!hasPermission(req.admin.role_code, permission)) {
          throw new ForbiddenError(
            `Role '${req.admin.role_code}' lacks required permission '${Array.isArray(permission) ? permission.join(' | ') : permission}'`,
            'ADMIN_PERMISSION_DENIED'
          );
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  return { requireAdmin, requirePermission };
}
