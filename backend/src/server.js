import 'dotenv/config';
import { loadEnv } from './config/env.js';
import { createSupabaseClients } from './config/supabase.js';
import { SupabaseDataStore } from './repositories/supabaseStore.js';
import { SupabaseAuthProvider } from './services/supabaseAuthProvider.js';
import { RazorpayGateway } from './services/paymentService.js';
import { GooglePlayIntegrityProvider } from './services/integrityService.js';
import { createApp } from './app.js';

process.on('unhandledRejection', (reason) => {
  console.error('[class10-lms-backend] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[class10-lms-backend] Uncaught Exception:', err);
  process.exit(1);
});

const config = loadEnv();
const { supabaseAdmin, supabaseAuth } = createSupabaseClients(config);
const store = new SupabaseDataStore(supabaseAdmin);
const authProvider = new SupabaseAuthProvider(supabaseAdmin, supabaseAuth);
const paymentGateway = new RazorpayGateway(config);
const integrityProvider = new GooglePlayIntegrityProvider(config);

const { app } = createApp({
  config,
  store,
  authProvider,
  paymentGateway,
  integrityProvider,
});

const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(config.PORT, HOST, () => {
  console.log(
    `[class10-lms-backend] Running on ${HOST}:${config.PORT} (${config.NODE_ENV})`
  );
});

server.on('error', (err) => {
  console.error('[class10-lms-backend] Fatal server error:', err);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`[class10-lms-backend] Received ${signal}, shutting down gracefully...`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

