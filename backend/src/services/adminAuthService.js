import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  ADMIN_ROLES,
  getPermissionsForRole,
  getRoleDefinition,
  hashPassword,
  verifyPassword,
} from './adminRbac.js';
import { generateRandomId } from '../utils/crypto.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.js';

export class AdminAuthService {
  constructor({ store, config }) {
    this.store = store;
    this.config = config;
  }

  _getAdminSecret() {
    return `${this.config.JWT_ACCESS_SECRET}:admin_portal_v1`;
  }

  async login({ email, password, ipAddress = null, userAgent = null }) {
    const normalized = String(email || '').trim().toLowerCase();
    const admin = await this.store.getAdminByEmail(normalized);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      throw new UnauthorizedError('Invalid administrator email or password', 'ADMIN_INVALID_CREDENTIALS');
    }
    if (!admin.is_active) {
      throw new ForbiddenError('Administrator account is deactivated', 'ADMIN_ACCOUNT_DISABLED');
    }

    const jti = generateRandomId(16);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const session = await this.store.createAdminSession({
      admin_id: admin.id,
      token_jti: jti,
      ip_address: ipAddress,
      user_agent: userAgent,
      is_revoked: false,
      expires_at: expiresAt,
    });

    await this.store.updateAdminUser(admin.id, { last_login_at: new Date().toISOString() });

    const accessToken = jwt.sign(
      {
        sub: admin.id,
        sid: session.id,
        role: admin.role_code,
        jti,
        typ: 'admin_access',
      },
      this._getAdminSecret(),
      { expiresIn: '12h' }
    );

    await this.recordAudit({
      admin,
      action: 'admin.login',
      entityType: 'admin_session',
      entityId: session.id,
      summary: `${admin.email} logged into Admin Portal`,
      ipAddress,
    });

    return {
      admin: this.sanitizeAdmin(admin),
      tokens: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: '12h',
      },
    };
  }

  verifyAccessToken(token) {
    try {
      const payload = jwt.verify(token, this._getAdminSecret());
      if (payload.typ !== 'admin_access' || !payload.sub || !payload.sid) {
        throw new UnauthorizedError('Malformed admin token', 'INVALID_ADMIN_TOKEN');
      }
      return payload;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Admin session expired or invalid', 'ADMIN_TOKEN_EXPIRED');
    }
  }

  async logout({ sessionId, admin, ipAddress = null }) {
    if (sessionId) {
      await this.store.revokeAdminSession(sessionId);
    }
    if (admin) {
      await this.recordAudit({
        admin,
        action: 'admin.logout',
        entityType: 'admin_session',
        entityId: sessionId || null,
        summary: `${admin.email} logged out`,
        ipAddress,
      });
    }
    return { loggedOut: true };
  }

  async listAdmins() {
    const rows = await this.store.listAdminUsers();
    return rows.map((a) => this.sanitizeAdmin(a));
  }

  listRoles() {
    return ADMIN_ROLES;
  }

  async createAdmin({ actor, fullName, email, password, roleCode, assignedSubjectIds = [], ipAddress = null }) {
    if (!getRoleDefinition(roleCode)) {
      throw new ValidationError(`Invalid admin role: ${roleCode}`);
    }
    const normalized = String(email).trim().toLowerCase();
    const existing = await this.store.getAdminByEmail(normalized);
    if (existing) {
      throw new ConflictError('An administrator with this email already exists', 'ADMIN_EMAIL_EXISTS');
    }

    const created = await this.store.createAdminUser({
      id: crypto.randomUUID(),
      full_name: fullName.trim(),
      email: normalized,
      password_hash: hashPassword(password),
      role_code: roleCode,
      assigned_subject_ids: Array.isArray(assignedSubjectIds) ? assignedSubjectIds : [],
      is_active: true,
    });

    await this.recordAudit({
      admin: actor,
      action: 'admin.create',
      entityType: 'admin_user',
      entityId: created.id,
      summary: `Created admin ${created.email} (${created.role_code})`,
      ipAddress,
    });

    return this.sanitizeAdmin(created);
  }

  async updateAdmin({ actor, adminId, patch, ipAddress = null }) {
    const existing = await this.store.getAdminById(adminId);
    if (!existing) throw new NotFoundError('Administrator not found', 'ADMIN_NOT_FOUND');

    const dbPatch = {};
    if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName.trim();
    if (patch.roleCode !== undefined) {
      if (!getRoleDefinition(patch.roleCode)) {
        throw new ValidationError(`Invalid role: ${patch.roleCode}`);
      }
      dbPatch.role_code = patch.roleCode;
    }
    if (patch.assignedSubjectIds !== undefined) {
      dbPatch.assigned_subject_ids = patch.assignedSubjectIds;
    }
    if (patch.isActive !== undefined) {
      dbPatch.is_active = Boolean(patch.isActive);
    }
    if (patch.password) {
      dbPatch.password_hash = hashPassword(patch.password);
    }

    const updated = await this.store.updateAdminUser(adminId, dbPatch);
    await this.recordAudit({
      admin: actor,
      action: 'admin.update',
      entityType: 'admin_user',
      entityId: adminId,
      summary: `Updated admin ${updated.email}`,
      metadata: { fields: Object.keys(dbPatch).filter((k) => k !== 'password_hash') },
      ipAddress,
    });
    return this.sanitizeAdmin(updated);
  }

  async recordAudit({ admin, action, entityType, entityId = null, summary = '', metadata = {}, ipAddress = null }) {
    try {
      await this.store.createAdminAuditLog({
        admin_id: admin?.id || null,
        admin_email: admin?.email || 'system',
        admin_role: admin?.role_code || 'system',
        action,
        entity_type: entityType,
        entity_id: entityId ? String(entityId) : null,
        summary,
        metadata_json: metadata,
        ip_address: ipAddress,
      });
    } catch {
      // Never crash mutation if audit log write fails
    }
  }

  sanitizeAdmin(admin) {
    return {
      id: admin.id,
      fullName: admin.full_name,
      email: admin.email,
      roleCode: admin.role_code,
      roleName: getRoleDefinition(admin.role_code)?.name || admin.role_code,
      permissions: getPermissionsForRole(admin.role_code),
      assignedSubjectIds: Array.isArray(admin.assigned_subject_ids)
        ? admin.assigned_subject_ids
        : [],
      isActive: Boolean(admin.is_active),
      lastLoginAt: admin.last_login_at || null,
      createdAt: admin.created_at || null,
    };
  }
}
