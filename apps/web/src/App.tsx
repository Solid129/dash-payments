import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/protected-route';
import { AcceptInvitePage } from '@/pages/auth/accept-invite-page';
import { LoginPage } from '@/pages/auth/login-page';
import { SignupPage } from '@/pages/auth/signup-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { NewPayoutPage } from '@/pages/payouts/new-payout-page';
import { PayoutDetailPage } from '@/pages/payouts/payout-detail-page';
import { PayoutsListPage } from '@/pages/payouts/payouts-list-page';
import { SettingsPage } from '@/pages/settings-page';
import { TeamPage } from '@/pages/team/team-page';
import { TransactionDetailPage } from '@/pages/transactions/transaction-detail-page';
import { TransactionsListPage } from '@/pages/transactions/transactions-list-page';

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/accept-invite/:token"
        element={
          <PublicOnlyRoute>
            <AcceptInvitePage />
          </PublicOnlyRoute>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsListPage />} />
          <Route path="/transactions/:id" element={<TransactionDetailPage />} />
          <Route path="/payouts" element={<PayoutsListPage />} />
          <Route path="/payouts/new" element={<NewPayoutPage />} />
          <Route path="/payouts/:id" element={<PayoutDetailPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
