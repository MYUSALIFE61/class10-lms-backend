import 'dotenv/config';
import { loadEnv } from './config/env.js';
import { createSupabaseClients } from './config/supabase.js';
import { SupabaseDataStore } from './repositories/supabaseStore.js';
import { SupabaseAuthProvider } from './services/supabaseAuthProvider.js';
import { RazorpayGateway } from './services/paymentService.js';
import { GooglePlayIntegrityProvider } from './services/integrityService.js';
import { createApp } from './app.js';

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

const server = app.listen(config.PORT, () => {
  console.log(
    `[class10-lms-backend] Running on port ${config.PORT} (${config.NODE_ENV})`
  );
});

function shutdown(signal) {
  console.log(`[class10-lms-backend] Received ${signal}, shutting down gracefully...`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
