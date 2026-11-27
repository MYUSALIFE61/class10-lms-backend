import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { AppRoutes } from '../App.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { clearTokens, saveTokens } from '../services/apiClient.js';

const MOCK_THREE_PLANS = [
  {
    id: 'p1',
    code: 'CLASS10_MONTHLY_200',
    name: 'Monthly Plan',
    description: 'Flexible 30-day access',
    pricePaise: 20000,
    priceRupees: 200,
    currency: 'INR',
    durationDays: 30,
    durationLabel: '1 Month',
    features: ['30 Days Validity'],
    isRecommended: false,
  },
  {
    id: 'p2',
    code: 'CLASS10_HALFYEAR_500',
    name: 'Half-Yearly Plan',
    description: 'Term & Pre-Final prep access',
    pricePaise: 50000,
    priceRupees: 500,
    currency: 'INR',
    durationDays: 180,
    durationLabel: '6 Months',
    features: ['180 Days Validity'],
    isRecommended: false,
  },
  {
    id: 'p3',
    code: 'CLASS10_ANNUAL_799',
    name: 'Annual Plan',
    description: 'Full Class 10 board year access',
    pricePaise: 79900,
    priceRupees: 799,
    currency: 'INR',
    durationDays: 365,
    durationLabel: '12 Months',
    features: ['365 Days Validity'],
    isRecommended: true,
  },
];

function renderApp(initialEntries = ['/']) {
  return render(
    <NetworkProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </NetworkProvider>
  );
}

describe('Phase 2: Welcome, Complete Signup, Legal Pages & Subscription Plan Routing', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearTokens();
  });

  it('renders Welcome Screen on / with Sign Up, Sign In, Terms & Privacy navigation', async () => {
    renderApp(['/']);

    expect(await screen.findByText(/Class 10 SSC LMS/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Terms & Conditions/i }));
    expect(await screen.findByText(/Eligibility & Student Account Registration/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Privacy Policy/i }));
    expect(await screen.findByText(/Information We Collect/i)).toBeInTheDocument();
  });

  it('validates registration form, checks username availability, and routes from /signup to /subscription (3 plans)', async () => {
    const checkUsernameSpy = vi
      .spyOn(lmsApi, 'checkUsername')
      .mockResolvedValueOnce({
        available: true,
        valid: true,
        normalizedUsername: 'kiran.ssc10',
        message: 'Username is available.',
      });

    const registerSpy = vi.spyOn(lmsApi, 'register').mockResolvedValue({
      user: {
        id: 'u-new-1',
        fullName: 'Kiran Kumar',
        username: 'kiran.ssc10',
        email: 'kiran@ap10.in',
        phone: '9876543210',
        state: 'Andhra Pradesh',
        district: 'Vijayawada',
        schoolName: 'ZPHS Patamata',
        className: 'Class 10',
        board: 'AP',
        studentCode: 'AP10-1234',
      },
      device: { id: 'dev-1', deviceName: 'Android Phone' },
      tokens: { accessToken: 'tok-acc', refreshToken: 'tok-ref' },
      subscription: {
        hasSubscription: false,
        isActive: false,
        status: 'unpaid',
        startsAt: null,
        expiresAt: null,
      },
    });

    vi.spyOn(lmsApi, 'getSubscriptionStatus').mockResolvedValue({
      subscription: {
        hasSubscription: false,
        isActive: false,
        status: 'unpaid',
        startsAt: null,
        expiresAt: null,
      },
    });
    vi.spyOn(lmsApi, 'getPlans').mockResolvedValue({ plans: MOCK_THREE_PLANS });
    const selectPlanSpy = vi.spyOn(lmsApi, 'selectPendingPlan').mockResolvedValue({
      plan: MOCK_THREE_PLANS[1],
      subscription: {
        hasSubscription: true,
        isActive: false,
        status: 'pending',
        selectedPlanCode: 'CLASS10_HALFYEAR_500',
        selectedPlanName: 'Half-Yearly Plan',
        startsAt: null,
        expiresAt: null,
      },
    });
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: {
        id: 'u-new-1',
        fullName: 'Kiran Kumar',
        username: 'kiran.ssc10',
        board: 'AP',
      },
      device: { id: 'dev-1', deviceName: 'Android Phone' },
      subscription: {
        hasSubscription: true,
        isActive: false,
        status: 'pending',
        selectedPlanCode: 'CLASS10_HALFYEAR_500',
        selectedPlanName: 'Half-Yearly Plan',
      },
    });

    renderApp(['/signup']);

    fireEvent.change(await screen.findByLabelText(/Full Name/i), {
      target: { value: 'Kiran Kumar' },
    });
    fireEvent.change(screen.getByLabelText(/Mobile Number/i), {
      target: { value: '9876543210' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'kiran@ap10.in' },
    });
    fireEvent.change(screen.getByLabelText(/^Username$/i), {
      target: { value: 'kiran.ssc10' },
    });

    await waitFor(() => {
      expect(checkUsernameSpy).toHaveBeenCalledWith('kiran.ssc10');
    });
    expect(await screen.findByText(/Username is available/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/District/i), {
      target: { value: 'Vijayawada' },
    });
    fireEvent.change(screen.getByLabelText(/School Name/i), {
      target: { value: 'ZPHS Patamata' },
    });

    // Test mismatched confirmPassword validation
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), {
      target: { value: 'WrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Account & Choose Plan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(registerSpy).not.toHaveBeenCalled();

    // Fix confirmPassword & submit
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Account & Choose Plan/i }));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });

    // Routes strictly to /subscription displaying all 3 plan prices & durations
    expect(await screen.findByText(/Choose Your Plan/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Monthly Plan/i })).toHaveTextContent('₹200');
    expect(screen.getByRole('radio', { name: /Monthly Plan/i })).toHaveTextContent('30 days');
    expect(screen.getByRole('radio', { name: /Half-Yearly Plan/i })).toHaveTextContent('₹500');
    expect(screen.getByRole('radio', { name: /Half-Yearly Plan/i })).toHaveTextContent('180 days');
    expect(screen.getByRole('radio', { name: /Annual Plan/i })).toHaveTextContent('₹799');
    expect(screen.getByRole('radio', { name: /Annual Plan/i })).toHaveTextContent('365 days');

    // Select Half-Yearly plan & confirm server pending state without activating
    fireEvent.click(screen.getByRole('radio', { name: /Half-Yearly Plan/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue with Half-Yearly Plan/i }));

    await waitFor(() => {
      expect(selectPlanSpy).toHaveBeenCalledWith('CLASS10_HALFYEAR_500');
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/PENDING until payment verification/i);
  });

  it('redirects unpaid student trying to open a paid lesson to /subscription and expired student to /renewal', async () => {
    await saveTokens({ accessToken: 'acc-unpaid', refreshToken: 'ref-unpaid' });
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u-unpaid', fullName: 'Unpaid Student', board: 'AP' },
      device: { id: 'd1', deviceName: 'Phone' },
      subscription: { status: 'unpaid', isActive: false, startsAt: null, expiresAt: null },
    });
    vi.spyOn(lmsApi, 'getSubscriptionStatus').mockResolvedValue({
      subscription: { status: 'unpaid', isActive: false, startsAt: null, expiresAt: null },
    });
    vi.spyOn(lmsApi, 'getPlans').mockResolvedValue({ plans: MOCK_THREE_PLANS });

    const firstRender = renderApp(['/lessons/paid-lesson-1']);
    expect(await screen.findByText(/Choose Your Plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Paid Lesson Player/i)).not.toBeInTheDocument();
    firstRender.unmount();

    // Now simulate an expired student session trying to open /dashboard
    vi.restoreAllMocks();
    await saveTokens({ accessToken: 'acc-expired', refreshToken: 'ref-expired' });
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u-exp', fullName: 'Expired Student', board: 'TS' },
      device: { id: 'd2', deviceName: 'Phone' },
      subscription: {
        status: 'expired',
        isActive: false,
        startsAt: '2025-10-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
      },
    });
    vi.spyOn(lmsApi, 'getSubscriptionStatus').mockResolvedValue({
      subscription: { status: 'expired', isActive: false },
    });
    vi.spyOn(lmsApi, 'getPlans').mockResolvedValue({ plans: MOCK_THREE_PLANS });

    renderApp(['/dashboard']);
    expect(await screen.findByText(/Renew Subscription/i)).toBeInTheDocument();
    expect(await screen.findByText(/Your Class 10 SSC subscription has expired/i)).toBeInTheDocument();
  });
});
