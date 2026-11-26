import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

export function applySecurityMiddleware(app, config) {
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Mobile native requests or server-to-server webhooks may omit Origin
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not permitted by CORS policy`));
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Range',
        'X-Device-Id',
        'X-App-Version',
        'X-Play-Integrity-Token',
        'X-File-Name',
        'X-Quality-Label',
        'X-Download-Token',
      ],
      exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'X-Content-SHA256'],
    })
  );

  app.use(
    compression({
      filter: (req, res) => {
        // Never compress or buffer binary video byte-range streams
        if (
          req.path &&
          (req.path.includes('/playback/stream/') ||
            (req.path.includes('/downloads/') && req.path.endsWith('/stream')))
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );
}
