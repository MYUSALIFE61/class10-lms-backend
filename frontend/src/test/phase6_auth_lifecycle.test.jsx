import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { AppRoutes } from '../App.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { clearTokens } from '../services/apiClient.js';

describe('Phase 6: Auth Flows (Login Success, Incorrect Login, Logout) & Navigation', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearTokens();
  });

  it('displays server error on incorrect login credentials', async () => {
    vi.spyOn(lmsApi, 'login').mockRejectedValue(new Error('Invalid email or password'));

    render(
      <NetworkProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </NetworkProvider>
    );

    fireEvent.change(await screen.findByLabelText(/Email Address/i), {
      target: { value: 'student@ap10.in' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'WrongPass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In Securely/i }));

    expect(await screen.findByText(/Invalid email or password/i)).toBeInTheDocument();
  });

  it('signs in successfully, loads Dashboard, and logs out back to Login screen', async () => {
    vi.spyOn(lmsApi, 'login').mockResolvedValue({
      user: {
        id: 'u1',
        fullName: 'Priya Sharma',
        email: 'priya@ts10.in',
        board: 'TS',
        studentCode: 'TS10-AA11',
      },
      device: { id: 'd1', deviceName: 'Redmi Note 12' },
      tokens: { accessToken: 'acc-1', refreshToken: 'ref-1' },
    });
    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: {
        id: 'u1',
        fullName: 'Priya Sharma',
        email: 'priya@ts10.in',
        board: 'TS',
        studentCode: 'TS10-AA11',
      },
      device: { id: 'd1', deviceName: 'Redmi Note 12' },
      subscription: { status: 'active', isActive: true, daysRemaining: 360, expiresAt: '2027-11-22T00:00:00Z' },
    });
    vi.spyOn(lmsApi, 'getDashboard').mockResolvedValue({
      student: { fullName: 'Priya Sharma', board: 'TS', studentCode: 'TS10-AA11' },
      subscription: { status: 'active', isActive: true, daysRemaining: 360, expiresAt: '2027-11-22T00:00:00Z' },
      stats: { totalSubjects: 1, completedLessons: 3, inProgressLessons: 1 },
      subjects: [
        { id: 'sub-1', title: 'Mathematics', description: 'Class 10 TS SSC', iconKey: 'calculator', accentColor: '#1D4ED8' },
      ],
      recentProgress: [],
    });
    vi.spyOn(lmsApi, 'getStudentHome').mockResolvedValue({
      student: { fullName: 'Priya Sharma', board: 'TS', studentCode: 'TS10-AA11' },
      subscription: { status: 'active', isActive: true, daysRemaining: 360, expiresAt: '2027-11-22T00:00:00Z' },
      stats: { totalSubjects: 1, completedLessons: 3, inProgressLessons: 1 },
      subjects: [
        { id: 'sub-1', title: 'Mathematics', description: 'Class 10 TS SSC', iconKey: 'calculator', accentColor: '#1D4ED8' },
      ],
      recentProgress: [],
      upcomingExams: [],
      notificationsUnread: 0,
      appConfig: {},
    });
    vi.spyOn(lmsApi, 'listDevices').mockResolvedValue({
      devices: [{ id: 'd1', deviceName: 'Redmi Note 12', platform: 'android', osVersion: '13', isActive: true }],
      currentDeviceId: 'd1',
    });
    vi.spyOn(lmsApi, 'logout').mockResolvedValue({ loggedOut: true });

    render(
      <NetworkProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </NetworkProvider>
    );

    fireEvent.change(await screen.findByLabelText(/Email Address/i), {
      target: { value: 'priya@ts10.in' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In Securely/i }));

    expect(await screen.findByText(/Hello, Priya/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Class 10 SSC Pass/i)).toBeInTheDocument();

    // Navigate to Profile & Sign Out
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    expect(await screen.findByText(/Registered Devices/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sign Out of This Device/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sign In Securely/i })).toBeInTheDocument();
    });
  });
});
