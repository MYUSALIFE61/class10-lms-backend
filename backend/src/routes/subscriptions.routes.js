import { Router } from 'express';

export function createSubscriptionRoutes({ subscriptionService, paymentService, requireAuth }) {
  const router = Router();

  router.get('/plans', requireAuth, async (_req, res, next) => {
    try {
      const plans = await paymentService.listPlans();
      res.json({ success: true, data: { plans } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/status', requireAuth, async (req, res, next) => {
    try {
      const status = await subscriptionService.getStatus(req.user.id);
      res.json({ success: true, data: { subscription: status } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
