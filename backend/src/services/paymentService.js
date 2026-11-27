import Razorpay from 'razorpay';
import { hmacSha256Hex, timingSafeEqualHex } from '../utils/crypto.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';

export function formatPlanDto(plan) {
  if (!plan) return null;
  let features = [];
  if (Array.isArray(plan.features_json)) {
    features = plan.features_json;
  } else if (typeof plan.features_json === 'string') {
    try {
      const parsed = JSON.parse(plan.features_json);
      if (Array.isArray(parsed)) features = parsed;
    } catch {
      features = [];
    }
  }
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    pricePaise: plan.price_paise,
    priceRupees: Math.round(plan.price_paise / 100),
    currency: plan.currency || 'INR',
    durationDays: plan.duration_days,
    durationLabel: plan.duration_label || `${plan.duration_days} Days`,
    features,
    displayOrder: plan.display_order ?? 10,
    isRecommended: Boolean(plan.is_recommended),
  };
}

export function buildSubscriptionSummary(latest) {
  if (!latest) {
    return {
      hasSubscription: false,
      isActive: false,
      status: 'unpaid',
      startsAt: null,
      expiresAt: null,
      daysRemaining: 0,
      selectedPlanCode: null,
      selectedPlanName: null,
    };
  }

  const now = Date.now();
  const expiresMs = latest.expires_at ? new Date(latest.expires_at).getTime() : 0;
  const planMeta = latest.subscription_plans || null;
  const isExpiredActive = latest.status === 'active' && expiresMs <= now;
  const isActive = latest.status === 'active' && expiresMs > now;
  const status = isExpiredActive ? 'expired' : latest.status;
  const daysRemaining = isActive ? Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24)) : 0;

  return {
    id: latest.id,
    hasSubscription: true,
    isActive,
    status,
    startsAt: latest.starts_at,
    expiresAt: latest.expires_at,
    daysRemaining,
    selectedPlanCode: planMeta?.code || null,
    selectedPlanName: planMeta?.name || null,
  };
}

export function formatPaymentTxDto(tx, planOverride = null) {
  if (!tx) return null;
  const planMeta = planOverride || tx.subscription_plans || null;
  const payload = tx.raw_webhook_payload && typeof tx.raw_webhook_payload === 'object'
    ? tx.raw_webhook_payload
    : {};
  const failure = payload.failure && typeof payload.failure === 'object' ? payload.failure : {};
  const gatewayPayment = payload.payload?.payment?.entity || payload.payment || {};

  return {
    id: tx.id,
    orderId: tx.razorpay_order_id,
    paymentId: tx.razorpay_payment_id || null,
    amountPaise: tx.amount_paise,
    amountRupees: Math.round(tx.amount_paise / 100),
    currency: tx.currency || 'INR',
    status: tx.status,
    planCode: planMeta?.code || null,
    planName: planMeta?.name || 'Class 10 SSC Subscription',
    durationDays: planMeta?.duration_days || null,
    method: payload.method || gatewayPayment.method || null,
    failureCode: failure.code || null,
    failureReason: failure.description || failure.reason || null,
    verifiedAt: tx.verified_at || null,
    createdAt: tx.created_at,
  };
}

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

  async fetchPayment(paymentId) {
    return this.client.payments.fetch(paymentId);
  }

  async fetchOrderPayments(orderId) {
    return this.client.orders.fetchPayments(orderId);
  }

  async capturePayment(paymentId, amountPaise, currency = 'INR') {
    return this.client.payments.capture(paymentId, amountPaise, currency);
  }
}

export class SubscriptionService {
  constructor({ store }) {
    this.store = store;
  }

  async getStatus(userId) {
    const latest = await this.store.getLatestSubscription(userId);
    const summary = buildSubscriptionSummary(latest);
    if (latest && latest.status === 'active' && summary.status === 'expired') {
      await this.store.updateSubscription(latest.id, { status: 'expired' });
    }
    return summary;
  }

  async selectPendingPlan({ userId, planCode }) {
    const active = await this.store.getActiveSubscription(userId);
    if (active) {
      throw new ConflictError(
        'You already have an active subscription pass.',
        'SUBSCRIPTION_ALREADY_ACTIVE'
      );
    }

    const plan = await this.store.getPlanByCode(planCode, { activeOnly: true });
    if (!plan) {
      throw new NotFoundError(`Subscription plan '${planCode}' not found`, 'PLAN_NOT_FOUND');
    }

    const latest = await this.store.getLatestSubscription(userId);
    if (latest && latest.status === 'pending') {
      await this.store.updateSubscription(latest.id, {
        plan_id: plan.id,
        starts_at: null,
        expires_at: null,
      });
    } else {
      await this.store.createSubscription({
        user_id: userId,
        plan_id: plan.id,
        status: 'pending',
        starts_at: null,
        expires_at: null,
      });
    }

    const updated = await this.store.getLatestSubscription(userId);
    return {
      plan: formatPlanDto(plan),
      subscription: {
        ...buildSubscriptionSummary(updated),
        selectedPlanCode: plan.code,
        selectedPlanName: plan.name,
      },
    };
  }

  async assertActiveSubscription(userId) {
    const latest = await this.store.getLatestSubscription(userId);
    if (!latest) {
      throw new ForbiddenError(
        'An active Class 10 SSC subscription is required to access premium lessons.',
        'SUBSCRIPTION_REQUIRED'
      );
    }

    if (latest.status === 'revoked') {
      throw new ForbiddenError(
        'Your subscription has been revoked or refunded. Please contact support.',
        'SUBSCRIPTION_REVOKED'
      );
    }

    if (['pending', 'cancelled', 'failed'].includes(latest.status)) {
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
    return plans.map(formatPlanDto);
  }

  async createOrder({ user, planCode }) {
    const mode = this.config.RAZORPAY_MODE || 'test';
    const keyId = String(this.config.RAZORPAY_KEY_ID || '');
    const isTestKey = keyId.startsWith('rzp_test_');
    if (mode !== 'live' && !isTestKey) {
      throw new ForbiddenError(
        'Live payment transactions are disabled while RAZORPAY_MODE=test. Configure rzp_test_ API keys.',
        'TEST_MODE_ONLY'
      );
    }

    const code = planCode || this.config.SUBSCRIPTION_PLAN_CODE;
    const plan = await this.store.getPlanByCode(code, {
      activeOnly: Boolean(planCode),
    });
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
      isTestMode: isTestKey,
      mode,
      supportedMethods: ['upi', 'card'],
      plan: {
        code: plan.code,
        name: plan.name,
        durationDays: plan.duration_days,
        durationLabel: plan.duration_label || `${plan.duration_days} Days`,
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

    if (tx.status === 'refunded') {
      throw new ConflictError('This payment order has already been refunded.', 'PAYMENT_REFUNDED');
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

    const plan = this.store.getPlanById ? await this.store.getPlanById(tx.plan_id) : null;

    // Idempotent activation if already captured
    if (tx.status === 'captured') {
      const sub = await this.store.getLatestSubscription(userId);
      return {
        verified: true,
        alreadyProcessed: true,
        status: 'captured',
        transaction: formatPaymentTxDto(tx, plan),
        subscription: buildSubscriptionSummary(sub),
      };
    }

    // Dual verification with Razorpay Payments API when gateway adapter supports fetchPayment
    let paymentMethod = null;
    if (typeof this.paymentGateway?.fetchPayment === 'function') {
      let gwPayment = await this.paymentGateway.fetchPayment(razorpayPaymentId);
      if (gwPayment) {
        if (gwPayment.order_id && gwPayment.order_id !== razorpayOrderId) {
          await this.store.logSecurityEvent({
            user_id: userId,
            event_type: 'PAYMENT_ORDER_MISMATCH',
            severity: 'critical',
            details_json: { expectedOrderId: razorpayOrderId, gatewayOrderId: gwPayment.order_id },
          });
          throw new ValidationError('Gateway payment order mismatch');
        }
        if (gwPayment.amount != null && Number(gwPayment.amount) !== Number(tx.amount_paise)) {
          await this.store.logSecurityEvent({
            user_id: userId,
            event_type: 'PAYMENT_AMOUNT_TAMPERING',
            severity: 'critical',
            details_json: { expectedAmount: tx.amount_paise, gatewayAmount: gwPayment.amount },
          });
          throw new ValidationError('Gateway payment amount mismatch');
        }

        paymentMethod = gwPayment.method || null;
        if (
          gwPayment.status === 'authorized' &&
          typeof this.paymentGateway.capturePayment === 'function'
        ) {
          gwPayment = await this.paymentGateway.capturePayment(
            razorpayPaymentId,
            tx.amount_paise,
            tx.currency || 'INR'
          );
        }

        if (gwPayment.status === 'failed') {
          await this.recordFailure({
            userId,
            razorpayOrderId,
            razorpayPaymentId,
            errorCode: gwPayment.error_code || 'GATEWAY_FAILED',
            errorDescription: gwPayment.error_description || 'Payment failed at gateway.',
            reason: gwPayment.error_reason || 'gateway_failed',
            method: paymentMethod,
          });
          throw new ValidationError(
            gwPayment.error_description || 'Payment failed at Razorpay gateway.'
          );
        }

        if (gwPayment.status !== 'captured') {
          const updatedPendingTx = await this.store.updatePaymentTransaction(tx.id, {
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature,
            status: 'authorized',
            raw_webhook_payload: {
              ...(tx.raw_webhook_payload && typeof tx.raw_webhook_payload === 'object'
                ? tx.raw_webhook_payload
                : {}),
              method: paymentMethod,
              gatewayStatus: gwPayment.status || 'authorized',
            },
          });
          if (tx.subscription_id) {
            await this.store.updateSubscription(tx.subscription_id, { status: 'pending' });
          }
          const latestSub = await this.store.getLatestSubscription(userId);
          return {
            verified: false,
            pending: true,
            alreadyProcessed: false,
            status: 'pending',
            transaction: formatPaymentTxDto(updatedPendingTx, plan),
            subscription: buildSubscriptionSummary(latestSub),
          };
        }
      }
    }

    return this._activateFromPayment(tx, {
      razorpayPaymentId,
      razorpaySignature,
      method: paymentMethod,
      webhookPayload: tx.raw_webhook_payload || null,
    });
  }

  async recordFailure({
    userId,
    razorpayOrderId,
    razorpayPaymentId = null,
    errorCode = null,
    errorDescription = null,
    reason = null,
    method = null,
  }) {
    const tx = await this.store.getPaymentByOrderId(razorpayOrderId);
    if (!tx || tx.user_id !== userId) {
      throw new NotFoundError('Payment order not found for this student', 'ORDER_NOT_FOUND');
    }

    const plan = this.store.getPlanById ? await this.store.getPlanById(tx.plan_id) : null;

    if (tx.status === 'captured') {
      const sub = await this.store.getLatestSubscription(userId);
      return {
        recorded: false,
        alreadyCaptured: true,
        status: 'captured',
        transaction: formatPaymentTxDto(tx, plan),
        subscription: buildSubscriptionSummary(sub),
      };
    }

    const existingPayload =
      tx.raw_webhook_payload && typeof tx.raw_webhook_payload === 'object'
        ? tx.raw_webhook_payload
        : {};

    const updatedTx = await this.store.updatePaymentTransaction(tx.id, {
      status: 'failed',
      ...(razorpayPaymentId ? { razorpay_payment_id: razorpayPaymentId } : {}),
      raw_webhook_payload: {
        ...existingPayload,
        method: method || existingPayload.method || null,
        failure: {
          code: errorCode || 'PAYMENT_FAILED',
          description: errorDescription || 'Payment was unsuccessful or cancelled.',
          reason: reason || 'payment_failed',
          recordedAt: new Date().toISOString(),
        },
      },
    });

    if (tx.subscription_id) {
      await this.store.updateSubscription(tx.subscription_id, { status: 'failed' });
    }

    await this.store.logSecurityEvent({
      user_id: userId,
      event_type: 'PAYMENT_FAILED',
      severity: 'info',
      details_json: {
        razorpayOrderId,
        razorpayPaymentId: razorpayPaymentId || null,
        errorCode: errorCode || null,
      },
    });

    const latestSub = await this.store.getLatestSubscription(userId);
    return {
      recorded: true,
      alreadyCaptured: false,
      status: 'failed',
      transaction: formatPaymentTxDto(updatedTx, plan),
      subscription: buildSubscriptionSummary(latestSub),
    };
  }

  async getOrderStatus({ userId, orderId }) {
    const tx = await this.store.getPaymentByOrderId(orderId);
    if (!tx || tx.user_id !== userId) {
      throw new NotFoundError('Payment order not found for this student', 'ORDER_NOT_FOUND');
    }

    const plan = this.store.getPlanById ? await this.store.getPlanById(tx.plan_id) : null;

    if (
      (tx.status === 'created' || tx.status === 'authorized') &&
      typeof this.paymentGateway?.fetchOrderPayments === 'function'
    ) {
      try {
        const res = await this.paymentGateway.fetchOrderPayments(orderId);
        const items = Array.isArray(res) ? res : res?.items || [];
        const captured = items.find(
          (p) =>
            p.status === 'captured' &&
            Number(p.amount) === Number(tx.amount_paise)
        );
        if (captured) {
          const activated = await this._activateFromPayment(tx, {
            razorpayPaymentId: captured.id,
            method: captured.method || null,
            webhookPayload: {
              ...(tx.raw_webhook_payload && typeof tx.raw_webhook_payload === 'object'
                ? tx.raw_webhook_payload
                : {}),
              method: captured.method || null,
              source: 'gateway_poll',
            },
          });
          return {
            status: 'captured',
            transaction: activated.transaction,
            subscription: activated.subscription,
          };
        }
        const failed = items.find((p) => p.status === 'failed');
        if (failed && tx.status === 'created') {
          return this.recordFailure({
            userId,
            razorpayOrderId: orderId,
            razorpayPaymentId: failed.id,
            errorCode: failed.error_code,
            errorDescription: failed.error_description,
            reason: failed.error_reason,
            method: failed.method,
          });
        }
      } catch {
        // Non-fatal gateway poll error; return current persisted ledger state
      }
    }

    const latestSub = await this.store.getLatestSubscription(userId);
    const uiStatus =
      tx.status === 'captured'
        ? 'captured'
        : tx.status === 'failed'
          ? 'failed'
          : tx.status === 'refunded'
            ? 'refunded'
            : 'pending';

    return {
      status: uiStatus,
      transaction: formatPaymentTxDto(tx, plan),
      subscription: buildSubscriptionSummary(latestSub),
    };
  }

  async listHistory(userId) {
    const rows = this.store.listPaymentsByUser
      ? await this.store.listPaymentsByUser(userId)
      : [];
    return rows.map((row) => formatPaymentTxDto(row));
  }

  async handleWebhook({ rawBody, signatureHeader, eventIdHeader = null }) {
    if (!signatureHeader) {
      throw new ValidationError('Missing X-Razorpay-Signature header');
    }

    const expected = hmacSha256Hex(this.config.RAZORPAY_WEBHOOK_SECRET, rawBody);
    if (!timingSafeEqualHex(expected, signatureHeader)) {
      throw new ForbiddenError('Invalid Razorpay webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new ValidationError('Invalid Razorpay webhook JSON payload');
    }

    const event = payload?.event;
    const eventId = eventIdHeader || payload?.id || payload?.event_id || null;
    if (eventId && this.store.getPaymentByWebhookEventId) {
      const seen = await this.store.getPaymentByWebhookEventId(eventId);
      if (seen) {
        return { handled: true, idempotent: true, action: 'duplicate_event_ignored' };
      }
    }

    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;

    if (!orderId) {
      return { handled: false, reason: 'no_order_id' };
    }

    const tx = await this.store.getPaymentByOrderId(orderId);
    if (!tx) {
      return { handled: false, reason: 'order_not_found' };
    }

    const existingPayload =
      tx.raw_webhook_payload && typeof tx.raw_webhook_payload === 'object'
        ? tx.raw_webhook_payload
        : {};
    const processedEventIds = Array.isArray(existingPayload.processedEventIds)
      ? existingPayload.processedEventIds
      : [];

    if (eventId && (tx.webhook_event_id === eventId || processedEventIds.includes(eventId))) {
      return { handled: true, idempotent: true, action: 'duplicate_event_ignored' };
    }

    const nextPayload = {
      ...existingPayload,
      method: paymentEntity?.method || existingPayload.method || null,
      lastWebhookEvent: event,
      processedEventIds: eventId ? [...processedEventIds, eventId] : processedEventIds,
      payload: payload.payload,
    };

    if (event === 'payment.captured' || event === 'order.paid') {
      if (tx.status === 'captured') {
        return { handled: true, idempotent: true, action: 'already_captured' };
      }
      await this._activateFromPayment(tx, {
        razorpayPaymentId: paymentEntity?.id || tx.razorpay_payment_id,
        method: paymentEntity?.method || null,
        webhookEventId: eventId,
        webhookPayload: nextPayload,
      });
      return { handled: true, action: 'activated' };
    }

    if (event === 'payment.authorized') {
      if (tx.status === 'captured') {
        return { handled: true, idempotent: true, action: 'already_captured' };
      }
      await this.store.updatePaymentTransaction(tx.id, {
        status: 'authorized',
        razorpay_payment_id: paymentEntity?.id || tx.razorpay_payment_id,
        raw_webhook_payload: nextPayload,
      });
      if (tx.subscription_id) {
        await this.store.updateSubscription(tx.subscription_id, { status: 'pending' });
      }
      return { handled: true, action: 'marked_pending_authorized' };
    }

    if (event === 'payment.failed') {
      if (tx.status === 'captured') {
        return { handled: true, idempotent: true, action: 'ignored_failure_after_capture' };
      }
      await this.store.updatePaymentTransaction(tx.id, {
        status: 'failed',
        razorpay_payment_id: paymentEntity?.id || tx.razorpay_payment_id,
        ...(eventId ? { webhook_event_id: eventId } : {}),
        raw_webhook_payload: {
          ...nextPayload,
          failure: {
            code: paymentEntity?.error_code || 'PAYMENT_FAILED',
            description: paymentEntity?.error_description || 'Payment failed',
            reason: paymentEntity?.error_reason || 'webhook_failed',
            recordedAt: new Date().toISOString(),
          },
        },
      });
      if (tx.subscription_id) {
        await this.store.updateSubscription(tx.subscription_id, { status: 'failed' });
      }
      return { handled: true, action: 'marked_failed' };
    }

    if (event === 'refund.created' || event === 'payment.refunded') {
      await this.store.updatePaymentTransaction(tx.id, {
        status: 'refunded',
        ...(eventId ? { webhook_event_id: eventId } : {}),
        raw_webhook_payload: nextPayload,
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

  async _activateFromPayment(
    tx,
    {
      razorpayPaymentId,
      razorpaySignature = null,
      method = null,
      webhookEventId = null,
      webhookPayload = null,
    }
  ) {
    const directPlan = this.store.getPlanById ? await this.store.getPlanById(tx.plan_id) : null;
    const plans = directPlan ? [] : await this.store.listActivePlans();
    const plan = directPlan || plans.find((p) => p.id === tx.plan_id) || { duration_days: 365 };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

    const existingPayload =
      tx.raw_webhook_payload && typeof tx.raw_webhook_payload === 'object'
        ? tx.raw_webhook_payload
        : {};
    const mergedPayload = {
      ...existingPayload,
      ...(webhookPayload && typeof webhookPayload === 'object' ? webhookPayload : {}),
      ...(method ? { method } : {}),
    };

    const updatedTx = await this.store.updatePaymentTransaction(tx.id, {
      razorpay_payment_id: razorpayPaymentId,
      ...(razorpaySignature ? { razorpay_signature: razorpaySignature } : {}),
      ...(webhookEventId ? { webhook_event_id: webhookEventId } : {}),
      raw_webhook_payload: mergedPayload,
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
      status: 'captured',
      transaction: formatPaymentTxDto(updatedTx, plan),
      subscription: {
        id: subscription.id,
        hasSubscription: true,
        isActive: true,
        status: subscription.status,
        startsAt: subscription.starts_at,
        expiresAt: subscription.expires_at,
        daysRemaining: plan.duration_days,
        selectedPlanCode: plan.code || null,
        selectedPlanName: plan.name || null,
      },
    };
  }
}
