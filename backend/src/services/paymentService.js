import Razorpay from 'razorpay';
import { hmacSha256Hex, timingSafeEqualHex } from '../utils/crypto.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';

export class RazorpayGateway {
  constructor(config) {
    this.client = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }

  async createOrder({ amountPaise, currency = 'INR', receipt, notes }) {
    return this.client.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes,
    });
  }
}

export class SubscriptionService {
  constructor({ store }) {
    this.store = store;
  }

  async getStatus(userId) {
    const latest = await this.store.getLatestSubscription(userId);
    if (!latest) {
      return {
        hasSubscription: false,
        isActive: false,
        status: 'unpaid',
        startsAt: null,
        expiresAt: null,
        daysRemaining: 0,
      };
    }

    const now = Date.now();
    const expiresMs = latest.expires_at ? new Date(latest.expires_at).getTime() : 0;

    if (latest.status === 'active' && expiresMs <= now) {
      await this.store.updateSubscription(latest.id, { status: 'expired' });
      return {
        hasSubscription: true,
        isActive: false,
        status: 'expired',
        startsAt: latest.starts_at,
        expiresAt: latest.expires_at,
        daysRemaining: 0,
      };
    }

    const isActive = latest.status === 'active' && expiresMs > now;
    const daysRemaining = isActive ? Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24)) : 0;

    return {
      hasSubscription: true,
      isActive,
      status: latest.status,
      startsAt: latest.starts_at,
      expiresAt: latest.expires_at,
      daysRemaining,
    };
  }

  async assertActiveSubscription(userId) {
    const latest = await this.store.getLatestSubscription(userId);
    if (!latest) {
      throw new ForbiddenError(
        'An active Class 10 subscription (₹499) is required to access premium lessons.',
        'SUBSCRIPTION_REQUIRED'
      );
    }

    if (latest.status === 'revoked') {
      throw new ForbiddenError(
        'Your subscription has been revoked or refunded. Please contact support.',
        'SUBSCRIPTION_REVOKED'
      );
    }

    if (latest.status === 'pending') {
      throw new ForbiddenError(
        'Payment is still pending verification. Complete payment to unlock premium lessons.',
        'SUBSCRIPTION_UNPAID'
      );
    }

    const expiresMs = latest.expires_at ? new Date(latest.expires_at).getTime() : 0;
    if (latest.status === 'expired' || expiresMs <= Date.now()) {
      if (latest.status === 'active') {
        await this.store.updateSubscription(latest.id, { status: 'expired' });
      }
      throw new ForbiddenError(
        'Your Class 10 subscription has expired. Renew to continue watching premium lessons.',
        'SUBSCRIPTION_EXPIRED'
      );
    }

    // Verify linked payment transaction is captured
    if (latest.latest_payment_id) {
      const payment = await this.store.getPaymentById(latest.latest_payment_id);
      if (!payment || payment.status !== 'captured') {
        throw new ForbiddenError(
          'Subscription payment has not been verified as captured.',
          'PAYMENT_UNVERIFIED'
        );
      }
    } else {
      throw new ForbiddenError(
        'Subscription lacks a verified payment record.',
        'PAYMENT_UNVERIFIED'
      );
    }

    return latest;
  }
}

export class PaymentService {
  constructor({ store, paymentGateway, config }) {
    this.store = store;
    this.paymentGateway = paymentGateway;
    this.config = config;
  }

  async listPlans() {
    const plans = await this.store.listActivePlans();
    return plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      pricePaise: p.price_paise,
      priceRupees: Math.round(p.price_paise / 100),
      currency: p.currency,
      durationDays: p.duration_days,
    }));
  }

  async createOrder({ user, planCode }) {
    const code = planCode || this.config.SUBSCRIPTION_PLAN_CODE;
    const plan = await this.store.getPlanByCode(code);
    if (!plan) {
      throw new NotFoundError(`Subscription plan '${code}' not found`, 'PLAN_NOT_FOUND');
    }

    const receipt = `c10_${user.id.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 40);
    const rzpOrder = await this.paymentGateway.createOrder({
      amountPaise: plan.price_paise,
      currency: plan.currency,
      receipt,
      notes: {
        userId: user.id,
        studentCode: user.student_code,
        planCode: plan.code,
      },
    });

    const subscription = await this.store.createSubscription({
      user_id: user.id,
      plan_id: plan.id,
      status: 'pending',
      starts_at: null,
      expires_at: null,
    });

    const tx = await this.store.createPaymentTransaction({
      user_id: user.id,
      subscription_id: subscription.id,
      plan_id: plan.id,
      razorpay_order_id: rzpOrder.id,
      amount_paise: plan.price_paise,
      currency: plan.currency,
      status: 'created',
    });

    return {
      orderId: rzpOrder.id,
      transactionId: tx.id,
      subscriptionId: subscription.id,
      amountPaise: plan.price_paise,
      amountRupees: Math.round(plan.price_paise / 100),
      currency: plan.currency,
      razorpayKeyId: this.config.RAZORPAY_KEY_ID,
      plan: {
        code: plan.code,
        name: plan.name,
        durationDays: plan.duration_days,
      },
      prefill: {
        name: user.full_name,
        email: user.email,
        contact: user.phone || '',
      },
    };
  }

  async verifyPayment({ userId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    const tx = await this.store.getPaymentByOrderId(razorpayOrderId);
    if (!tx || tx.user_id !== userId) {
      throw new NotFoundError('Payment order not found for this student', 'ORDER_NOT_FOUND');
    }

    const expectedSignature = hmacSha256Hex(
      this.config.RAZORPAY_KEY_SECRET,
      `${razorpayOrderId}|${razorpayPaymentId}`
    );

    if (!timingSafeEqualHex(expectedSignature, razorpaySignature)) {
      await this.store.logSecurityEvent({
        user_id: userId,
        event_type: 'INVALID_PAYMENT_SIGNATURE',
        severity: 'critical',
        details_json: { razorpayOrderId, razorpayPaymentId },
      });
      throw new ValidationError('Invalid Razorpay payment signature');
    }

    // Idempotent activation
    if (tx.status === 'captured') {
      const sub = await this.store.getActiveSubscription(userId);
      return {
        verified: true,
        alreadyProcessed: true,
        subscription: sub,
      };
    }

    return this._activateFromPayment(tx, {
      razorpayPaymentId,
      razorpaySignature,
    });
  }

  async handleWebhook({ rawBody, signatureHeader }) {
    if (!signatureHeader) {
      throw new ValidationError('Missing X-Razorpay-Signature header');
    }

    const expected = hmacSha256Hex(this.config.RAZORPAY_WEBHOOK_SECRET, rawBody);
    if (!timingSafeEqualHex(expected, signatureHeader)) {
      throw new ForbiddenError('Invalid Razorpay webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    }

    const payload = JSON.parse(rawBody);
    const event = payload?.event;
    const paymentEntity = payload?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;

    if (!orderId) {
      return { handled: false, reason: 'no_order_id' };
    }

    const tx = await this.store.getPaymentByOrderId(orderId);
    if (!tx) {
      return { handled: false, reason: 'order_not_found' };
    }

    if (event === 'payment.captured') {
      if (tx.status === 'captured') {
        return { handled: true, idempotent: true };
      }
      await this._activateFromPayment(tx, {
        razorpayPaymentId: paymentEntity.id,
        webhookPayload: payload,
      });
      return { handled: true, action: 'activated' };
    }

    if (event === 'payment.failed') {
      await this.store.updatePaymentTransaction(tx.id, {
        status: 'failed',
        raw_webhook_payload: payload,
      });
      return { handled: true, action: 'marked_failed' };
    }

    if (event === 'refund.created' || event === 'payment.refunded') {
      await this.store.updatePaymentTransaction(tx.id, {
        status: 'refunded',
        raw_webhook_payload: payload,
      });
      if (tx.subscription_id) {
        await this.store.updateSubscription(tx.subscription_id, {
          status: 'revoked',
          revoked_reason: 'payment_refunded',
        });
      }
      return { handled: true, action: 'subscription_revoked' };
    }

    return { handled: false, event };
  }

  async _activateFromPayment(tx, { razorpayPaymentId, razorpaySignature = null, webhookPayload = null }) {
    const plans = await this.store.listActivePlans();
    const plan = plans.find((p) => p.id === tx.plan_id) || { duration_days: 365 };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

    const updatedTx = await this.store.updatePaymentTransaction(tx.id, {
      razorpay_payment_id: razorpayPaymentId,
      ...(razorpaySignature ? { razorpay_signature: razorpaySignature } : {}),
      ...(webhookPayload ? { raw_webhook_payload: webhookPayload } : {}),
      status: 'captured',
      verified_at: now.toISOString(),
    });

    let subscription;
    if (tx.subscription_id) {
      subscription = await this.store.updateSubscription(tx.subscription_id, {
        status: 'active',
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        latest_payment_id: updatedTx.id,
      });
    } else {
      subscription = await this.store.createSubscription({
        user_id: tx.user_id,
        plan_id: tx.plan_id,
        status: 'active',
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        latest_payment_id: updatedTx.id,
      });
    }

    return {
      verified: true,
      alreadyProcessed: false,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startsAt: subscription.starts_at,
        expiresAt: subscription.expires_at,
      },
    };
  }
}
