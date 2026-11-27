import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { AppRoutes } from '../App.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { clearTokens, saveTokens } from '../services/apiClient.js';

const PLANS = [
  {
    id: 'p1',
    code: 'CLASS10_MONTHLY_200',
    name: 'Monthly Plan',
    description: '30 days access',
    pricePaise: 20000,
    priceRupees: 200,
    currency: 'INR',
    durationDays: 30,
    durationLabel: '1 Month',
  },
  {
    id: 'p2',
    code: 'CLASS10_HALFYEAR_500',
    name: 'Half-Yearly Plan',
    description: '180 days access',
    pricePaise: 50000,
    priceRupees: 500,
    currency: 'INR',
    durationDays: 180,
    durationLabel: '6 Months',
  },
  {
    id: 'p3',
    code: 'CLASS10_ANNUAL_799',
    name: 'Annual Plan',
    description: '365 days access',
    pricePaise: 79900,
    priceRupees: 799,
    currency: 'INR',
    durationDays: 365,
    durationLabel: '12 Months',
    isRecommended: true,
  },
];

function renderAt(entries) {
  return render(
    <NetworkProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={entries}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </NetworkProvider>
  );
}

describe('Phase 3: Razorpay Checkout (Test Mode), Result Screens & Payment History', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearTokens();
    await saveTokens({ accessToken: 'acc-p3', refreshToken: 'ref-p3' });
  });

  afterEach(() => {
    delete window.Razorpay;
  });

  it('opens Razorpay Test Mode Checkout for UPI/Card, verifies signature on backend, shows Payment Success with Login CTA', async () => {
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u1', fullName: 'Surya AP', email: 'surya@ap10.in', board: 'AP' },
      device: { id: 'd1', deviceName: 'iQOO Z7s' },
      subscription: { status: 'unpaid', isActive: false },
    });
    vi.spyOn(lmsApi, 'getPlans').mockResolvedValue({ plans: PLANS });
    const createOrderSpy = vi.spyOn(lmsApi, 'createPaymentOrder').mockResolvedValue({
      orderId: 'order_test_9911',
      amountPaise: 50000,
      amountRupees: 500,
      currency: 'INR',
      razorpayKeyId: 'rzp_test_demo_public',
      isTestMode: true,
      plan: { code: 'CLASS10_HALFYEAR_500', name: 'Half-Yearly Plan', durationDays: 180 },
      prefill: { name: 'Surya AP', email: 'surya@ap10.in', contact: '9848012345' },
    });
    const verifySpy = vi.spyOn(lmsApi, 'verifyPayment').mockResolvedValue({
      verified: true,
      alreadyProcessed: false,
      status: 'captured',
      transaction: {
        orderId: 'order_test_9911',
        paymentId: 'pay_test_upi_01',
        amountRupees: 500,
        method: 'upi',
        planName: 'Half-Yearly Plan',
        status: 'captured',
      },
      subscription: {
        status: 'active',
        isActive: true,
        startsAt: '2026-11-27T00:00:00Z',
        expiresAt: '2027-05-26T00:00:00Z',
      },
    });
    const logoutSpy = vi.spyOn(lmsApi, 'logout').mockResolvedValue({ loggedOut: true });

    let rzpOptions = null;
    window.Razorpay = vi.fn((opts) => {
      rzpOptions = opts;
      return {
        on: vi.fn(),
        open: vi.fn(() => {
          opts.handler({
            razorpay_order_id: 'order_test_9911',
            razorpay_payment_id: 'pay_test_upi_01',
            razorpay_signature: 'sig_valid_hmac_hex',
          });
        }),
      };
    });

    renderAt(['/checkout/CLASS10_HALFYEAR_500']);

    expect(await screen.findByText('Half-Yearly Plan')).toBeInTheDocument();
    expect(screen.getByText('NO REAL CHARGE')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /UPI Payment/i }));
    fireEvent.click(screen.getByRole('button', { name: /Pay ₹500 \(Razorpay Test Mode\)/i }));

    await waitFor(() => {
      expect(createOrderSpy).toHaveBeenCalledWith('CLASS10_HALFYEAR_500');
      expect(verifySpy).toHaveBeenCalledWith({
        razorpayOrderId: 'order_test_9911',
        razorpayPaymentId: 'pay_test_upi_01',
        razorpaySignature: 'sig_valid_hmac_hex',
      });
    });

    expect(rzpOptions.key).toBe('rzp_test_demo_public');
    expect(await screen.findByText(/Thank You!/i)).toBeInTheDocument();
    expect(screen.getByText('pay_test_upi_01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Login to Start Learning/i }));
    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Sign In Securely/i })).toBeInTheDocument();
    });
  });

  it('shows Payment Failure screen with retry on declined card transaction', async () => {
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u2', fullName: 'Ravi TS', email: 'ravi@ts10.in', board: 'TS' },
      device: { id: 'd2', deviceName: 'Pixel' },
      subscription: { status: 'unpaid', isActive: false },
    });
    vi.spyOn(lmsApi, 'getPlans').mockResolvedValue({ plans: PLANS });
    vi.spyOn(lmsApi, 'createPaymentOrder').mockResolvedValue({
      orderId: 'order_test_fail_1',
      amountPaise: 20000,
      amountRupees: 200,
      currency: 'INR',
      razorpayKeyId: 'rzp_test_demo_public',
      plan: { code: 'CLASS10_MONTHLY_200', name: 'Monthly Plan', durationDays: 30 },
      prefill: { name: 'Ravi TS', email: 'ravi@ts10.in', contact: '' },
    });
    const recordFailSpy = vi.spyOn(lmsApi, 'recordPaymentFailure').mockResolvedValue({
      recorded: true,
      status: 'failed',
    });

    const listeners = {};
    window.Razorpay = vi.fn(() => ({
      on: vi.fn((evt, cb) => {
        listeners[evt] = cb;
      }),
      open: vi.fn(() => {
        listeners['payment.failed']({
          error: {
            code: 'BAD_REQUEST_ERROR',
            description: 'Card 3D-Secure verification declined.',
            reason: 'authentication_failed',
            metadata: { payment_id: 'pay_fail_01' },
          },
        });
      }),
    }));

    renderAt(['/checkout/CLASS10_MONTHLY_200']);
    fireEvent.click(await screen.findByRole('radio', { name: /Credit \/ Debit Card/i }));
    fireEvent.click(screen.getByRole('button', { name: /Pay ₹200 \(Razorpay Test Mode\)/i }));

    await waitFor(() => {
      expect(recordFailSpy).toHaveBeenCalled();
    });
    expect(await screen.findByText(/Payment Could Not Be Completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Card 3D-Secure verification declined/i)).toBeInTheDocument();

    // Retry Payment returns cleanly to Checkout
    fireEvent.click(screen.getByRole('button', { name: /Retry Payment/i }));
    expect(await screen.findByText(/Secure Checkout/i)).toBeInTheDocument();
  });

  it('shows Pending Verification screen and transitions to Success once gateway captures', async () => {
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u2b', fullName: 'Ravi TS', email: 'ravi@ts10.in', board: 'TS' },
      device: { id: 'd2b', deviceName: 'Pixel' },
      subscription: { status: 'pending', isActive: false },
    });
    vi.spyOn(lmsApi, 'getPaymentOrderStatus').mockResolvedValue({
      status: 'captured',
      transaction: {
        orderId: 'order_test_pend_2',
        paymentId: 'pay_pend_captured_2',
        amountRupees: 799,
        planCode: 'CLASS10_ANNUAL_799',
        planName: 'Annual Plan',
        durationDays: 365,
        method: 'upi',
      },
      subscription: {
        status: 'active',
        isActive: true,
        expiresAt: '2027-11-27T00:00:00Z',
      },
    });

    renderAt(['/payment/pending?orderId=order_test_pend_2']);
    expect(await screen.findByRole('heading', { name: /Payment Pending Verification/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Check Payment Status/i }));
    expect(await screen.findByText(/Thank You!/i)).toBeInTheDocument();
  });

  it('renders Payment Transaction History screen with captured and failed entries cleanly', async () => {
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u3', fullName: 'Meena AP', board: 'AP' },
      device: { id: 'd3', deviceName: 'Moto' },
      subscription: { status: 'active', isActive: true, expiresAt: '2027-11-27T00:00:00Z' },
    });
    vi.spyOn(lmsApi, 'getPaymentHistory').mockResolvedValue({
      transactions: [
        {
          id: 'tx-1',
          orderId: 'order_hist_1',
          paymentId: 'pay_hist_1',
          amountRupees: 799,
          status: 'captured',
          planCode: 'CLASS10_ANNUAL_799',
          planName: 'Annual Plan',
          method: 'card',
          verifiedAt: '2026-11-27T08:00:00Z',
          createdAt: '2026-11-27T08:00:00Z',
        },
        {
          id: 'tx-2',
          orderId: 'order_hist_2',
          paymentId: null,
          amountRupees: 200,
          status: 'failed',
          planCode: 'CLASS10_MONTHLY_200',
          planName: 'Monthly Plan',
          failureReason: 'UPI request timed out',
          createdAt: '2026-11-26T10:00:00Z',
        },
      ],
    });

    renderAt(['/payments/history']);
    expect(await screen.findByText('Annual Plan')).toBeInTheDocument();
    expect(screen.getByText('Monthly Plan')).toBeInTheDocument();
    expect(screen.getByText('order_hist_1')).toBeInTheDocument();
    expect(screen.getByText(/UPI request timed out/i)).toBeInTheDocument();
  });
});
