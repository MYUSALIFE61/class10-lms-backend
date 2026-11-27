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

const failurePaymentSchema = z.object({
  razorpayOrderId: z.string().min(6).max(100),
  razorpayPaymentId: z.string().max(100).optional().nullable(),
  errorCode: z.string().max(100).optional().nullable(),
  errorDescription: z.string().max(400).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  method: z.string().max(40).optional().nullable(),
});

export function createPaymentRoutes({ paymentService, requireAuth, paymentLimiter }) {
  const router = Router();

  router.get('/history', requireAuth, async (req, res, next) => {
    try {
      const transactions = await paymentService.listHistory(req.user.id);
      res.json({ success: true, data: { transactions } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/:orderId/status', requireAuth, async (req, res, next) => {
    try {
      const result = await paymentService.getOrderStatus({
        userId: req.user.id,
        orderId: req.params.orderId,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

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

  router.post(
    '/failure',
    requireAuth,
    paymentLimiter,
    validate({ body: failurePaymentSchema }),
    async (req, res, next) => {
      try {
        const result = await paymentService.recordFailure({
          userId: req.user.id,
          ...req.body,
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
      const eventIdHeader = req.get('x-razorpay-event-id') || null;
      const result = await paymentService.handleWebhook({
        rawBody: req.rawBody || JSON.stringify(req.body),
        signatureHeader: signature,
        eventIdHeader,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
