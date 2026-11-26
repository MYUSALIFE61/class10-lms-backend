import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const createOrderSchema = z.object({
  planCode: z.string().min(3).max(64).optional(),
});

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(6).max(100),
  razorpayPaymentId: z.string().min(6).max(100),
  razorpaySignature: z.string().min(16).max(256),
});

export function createPaymentRoutes({ paymentService, requireAuth, paymentLimiter }) {
  const router = Router();

  router.post(
    '/create-order',
    requireAuth,
    paymentLimiter,
    validate({ body: createOrderSchema }),
    async (req, res, next) => {
      try {
        const order = await paymentService.createOrder({
          user: req.user,
          planCode: req.body.planCode,
        });
        res.status(201).json({ success: true, data: order });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/verify',
    requireAuth,
    paymentLimiter,
    validate({ body: verifyPaymentSchema }),
    async (req, res, next) => {
      try {
        const result = await paymentService.verifyPayment({
          userId: req.user.id,
          razorpayOrderId: req.body.razorpayOrderId,
          razorpayPaymentId: req.body.razorpayPaymentId,
          razorpaySignature: req.body.razorpaySignature,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // Server-to-server Razorpay webhook (verified via HMAC signature on rawBody)
  router.post('/webhook', async (req, res, next) => {
    try {
      const signature = req.get('x-razorpay-signature');
      const result = await paymentService.handleWebhook({
        rawBody: req.rawBody || JSON.stringify(req.body),
        signatureHeader: signature,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
