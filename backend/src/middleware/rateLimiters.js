import rateLimit from 'express-rate-limit';

export function createRateLimiters({ disabled = false } = {}) {
  const passThrough = (_req, _res, next) => next();
  if (disabled) {
    return {
      generalLimiter: passThrough,
      authLimiter: passThrough,
      playbackLimiter: passThrough,
      paymentLimiter: passThrough,
    };
  }

  const makeLimiter = ({ windowMs, max, code, message }) =>
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.id || req.ip,
      handler: (_req, res) => {
        res.status(429).json({
          success: false,
          error: { code, message },
        });
      },
    });

  return {
    generalLimiter: makeLimiter({
      windowMs: 60 * 1000,
      max: 120,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again shortly.',
    }),
    authLimiter: makeLimiter({
      windowMs: 15 * 60 * 1000,
      max: 20,
      code: 'AUTH_RATE_LIMIT',
      message: 'Too many authentication attempts. Please wait 15 minutes.',
    }),
    playbackLimiter: makeLimiter({
      windowMs: 60 * 1000,
      max: 30,
      code: 'PLAYBACK_RATE_LIMIT',
      message: 'Too many playback authorization requests. Please wait a moment.',
    }),
    paymentLimiter: makeLimiter({
      windowMs: 15 * 60 * 1000,
      max: 15,
      code: 'PAYMENT_RATE_LIMIT',
      message: 'Too many payment requests. Please try again shortly.',
    }),
  };
}
