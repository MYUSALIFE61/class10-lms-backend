import crypto from 'node:crypto';
import { ForbiddenError } from '../utils/errors.js';

export const ADMIN_ROLES = [
  {
    code: 'super_admin',
    name: 'Super Admin',
    description: 'Complete system access including roles, settings and audit logs.',
    permissions: ['*'],
  },
  {
    code: 'admin',
    name: 'Admin',
    description: 'Student management, full content management, reports, notifications and subscriptions.',
    permissions: [
      'dashboard:view',
      'students:read',
      'students:write',
      'academic:read',
      'academic:write',
      'content:read',
      'content:write',
      'content:publish',
      'videos:manage',
      'resources:manage',
      'questions:read',
      'questions:write',
      'quizzes:manage',
      'exams:manage',
      'exams:grade',
      'progress:read',
      'notifications:manage',
      'subscriptions:manage',
      'config:manage',
      'audit:read',
    ],
  },
  {
    code: 'content_manager',
    name: 'Content Manager',
    description: 'Manage subjects, chapters, topics, lessons, videos and study materials.',
    permissions: [
      'dashboard:view',
      'academic:read',
      'academic:write',
      'content:read',
      'content:write',
      'content:publish',
      'videos:manage',
      'resources:manage',
    ],
  },
  {
    code: 'subject_manager',
    name: 'Subject Manager',
    description: 'Manage chapters, topics, lessons, videos and notes for assigned subjects only.',
    permissions: [
      'dashboard:view',
      'academic:read',
      'academic:write',
      'content:read',
      'content:write',
      'videos:manage',
      'resources:manage',
    ],
  },
  {
    code: 'teacher',
    name: 'Teacher',
    description: 'Manage assigned lessons, question creation, practice quizzes and student progress.',
    permissions: [
      'dashboard:view',
      'academic:read',
      'content:read',
      'content:write',
      'questions:read',
      'questions:write',
      'quizzes:manage',
      'progress:read',
    ],
  },
  {
    code: 'question_bank_manager',
    name: 'Question Bank Manager',
    description: 'Create, validate, bulk-import and publish question bank items.',
    permissions: [
      'dashboard:view',
      'academic:read',
      'questions:read',
      'questions:write',
      'quizzes:manage',
    ],
  },
  {
    code: 'exam_controller',
    name: 'Exam Controller',
    description: 'Schedule, manage, evaluate examinations and publish exam results.',
    permissions: [
      'dashboard:view',
      'academic:read',
      'questions:read',
      'quizzes:manage',
      'exams:manage',
      'exams:grade',
      'progress:read',
      'notifications:manage',
    ],
  },
  {
    code: 'student_support',
    name: 'Student Support',
    description: 'Inspect student profiles, learning history, account status and send notifications.',
    permissions: [
      'dashboard:view',
      'students:read',
      'students:write',
      'progress:read',
      'notifications:manage',
    ],
  },
];

const ROLE_MAP = new Map(ADMIN_ROLES.map((r) => [r.code, r]));

export function getRoleDefinition(roleCode) {
  return ROLE_MAP.get(roleCode) || null;
}

export function getPermissionsForRole(roleCode) {
  return ROLE_MAP.get(roleCode)?.permissions || [];
}

export function hasPermission(roleCode, requiredPermission) {
  const perms = getPermissionsForRole(roleCode);
  if (perms.includes('*')) return true;
  if (!requiredPermission) return true;
  if (Array.isArray(requiredPermission)) {
    return requiredPermission.some((p) => perms.includes(p));
  }
  return perms.includes(requiredPermission);
}

export function assertSubjectScope(adminUser, subjectId) {
  if (!subjectId) return;
  if (adminUser.role_code === 'subject_manager' || adminUser.role_code === 'teacher') {
    const allowed = Array.isArray(adminUser.assigned_subject_ids)
      ? adminUser.assigned_subject_ids
      : [];
    if (allowed.length > 0 && !allowed.includes(subjectId)) {
      throw new ForbiddenError(
        'Your role is restricted to your assigned subjects only.',
        'SUBJECT_SCOPE_FORBIDDEN'
      );
    }
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hex] = parts;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
