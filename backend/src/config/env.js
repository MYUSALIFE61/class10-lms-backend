import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      'https://localhost,https://app.class10lms.in,http://localhost:5173,http://127.0.0.1:5173,http://10.0.2.2:5173,http://localhost:5174,http://127.0.0.1:5174'
    ),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid HTTPS URL'),
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  DEVICE_HASH_SECRET: z.string().min(32, 'DEVICE_HASH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),

  SUBSCRIPTION_PLAN_CODE: z.string().default('CLASS10_ANNUAL_499'),
  MAX_DEVICES_PER_STUDENT: z.coerce.number().int().min(1).max(5).default(1),
  CONCURRENT_SESSION_WINDOW_MINUTES: z.coerce.number().int().min(1).max(120).default(10),

  RAZORPAY_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z.string().min(8, 'RAZORPAY_KEY_ID is required'),
  RAZORPAY_KEY_SECRET: z.string().min(8, 'RAZORPAY_KEY_SECRET is required'),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(8, 'RAZORPAY_WEBHOOK_SECRET is required'),

  GOOGLE_PLAY_PACKAGE_NAME: z.string().default('in.class10lms.ssc'),
  GOOGLE_CLOUD_PROJECT_NUMBER: z.string().optional().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  INTEGRITY_DISTRIBUTION_MODE: z.enum(['sideload', 'play_store']).default('sideload'),
  INTEGRITY_ENFORCEMENT_MODE: z.enum(['monitor', 'enforce']).default('monitor'),

  // Optional Bunny Stream / CDN Token Signing for private_stream lessons (zero YouTube branding/redirects)
  PRIVATE_STREAM_TOKEN_KEY: z.string().optional().default(''),
  PRIVATE_STREAM_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(14400).default(1800),

  // Own-Player Video Storage Provider (server-local/self-hosted only; third-party cloud object storage prohibited):
  // - 'none': disabled
  // - 'pikpak_local': local personal testing adapter ONLY
  VIDEO_STORAGE_PROVIDER: z.enum(['none', 'pikpak_local']).default('none'),
  PIKPAK_CLI_PATH: z.string().optional().default(''),
  PUBLIC_API_BASE_URL: z.string().optional().default(''),
  STREAM_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(900),

  // Authorized Offline Video Source & Local Android Vault Policy:
  // Server source MUST remain private local disk (no R2 / S3 / Supabase Storage / Firebase Storage);
  // Student downloads live exclusively in Android `context.noBackupFilesDir/offline_lessons/`.
  OFFLINE_VIDEO_STORAGE_PROVIDER: z
    .enum(['persistent_disk', 'pikpak_local'])
    .default('persistent_disk'),
  OFFLINE_VIDEO_STORAGE_DIR: z.string().optional().default(''),
  OFFLINE_VIDEO_TEMP_DIR: z.string().optional().default(''),
  RESOURCES_UPLOAD_DIR: z.string().optional().default(''),
  OFFLINE_DOWNLOAD_TOKEN_TTL_SECONDS: z.coerce.number().int().min(120).max(14400).default(1800),
  OFFLINE_LEASE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  OFFLINE_MAX_UPLOAD_MB: z.coerce.number().int().min(10).max(4096).default(1024),
  OFFLINE_RETENTION_POLICY: z
    .enum(['wipe_on_logout', 'keep_encrypted_bound_to_student'])
    .default('wipe_on_logout'),
  FFMPEG_PATH: z.string().optional().default(''),
  FFPROBE_PATH: z.string().optional().default(''),
});

export function loadEnv(rawEnv = process.env) {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid backend environment configuration: ${details}`);
  }

  const data = parsed.data;
  return {
    ...data,
    allowedOrigins: data.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
