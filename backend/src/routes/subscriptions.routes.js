import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const selectPlanSchema = z.object({
  planCode: z.string().trim().min(3).max(64),
});

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

  router.post(
    '/select-plan',
    requireAuth,
    validate({ body: selectPlanSchema }),
    async (req, res, next) => {
      try {
        const result = await subscriptionService.selectPendingPlan({
          userId: req.user.id,
          planCode: req.body.planCode,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
