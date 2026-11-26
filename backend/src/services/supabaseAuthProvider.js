import { UnauthorizedError, ConflictError, AppError } from '../utils/errors.js';

/**
 * Production Supabase Auth adapter.
 * Credentials are verified against Supabase Auth; LMS sessions are tracked in PostgreSQL.
 */
export class SupabaseAuthProvider {
  constructor(supabaseAdmin, supabaseAuth) {
    this.admin = supabaseAdmin;
    this.auth = supabaseAuth;
  }

  async signUp({ email, password, fullName }) {
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      if (error.message?.toLowerCase().includes('already')) {
        throw new ConflictError('An account with this email already exists', 'EMAIL_EXISTS');
      }
      throw new AppError(`Registration failed: ${error.message}`, 400, 'AUTH_SIGNUP_FAILED');
    }
    return { id: data.user.id, email: data.user.email };
  }

  async verifyCredentials({ email, password }) {
    const { data, error } = await this.auth.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data?.user) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    return { id: data.user.id, email: data.user.email };
  }
}
