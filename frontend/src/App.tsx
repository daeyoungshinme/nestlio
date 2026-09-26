import { lazy, Suspense, useEffect } from "react";
import type { LazyExoticComponent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "./components/layout/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoader from "./components/common/PageLoader";
import Toaster from "./components/Toaster";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
import { clearClientCaches } from "./utils/session";
import { APP_EVENTS } from "./constants/events";
import { ROUTES, planAnalysisLink } from "./constants/routes";
import LegacyScheduleRedirect from "./pages/LegacyScheduleRedirect";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const InviteAcceptPage = lazy(() => import("./pages/InviteAcceptPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const TransactionImportPage = lazy(() => import("./pages/TransactionImportPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const PlanPage = lazy(() => import("./pages/PlanPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const GoalDetailPage = lazy(() => import("./pages/GoalDetailPage"));
const LegacyFinancialPlanRedirect = lazy(() => import("./pages/LegacyFinancialPlanRedirect"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthChecking = useAuthStore((s) => s.isAuthChecking);
  if (isAuthChecking) return <PageLoader />;
  return isAuthenticated ? <>{children}</> : <Navigate to={ROUTES.login} replace />;
}

function LazyRoute({ Component }: { Component: LazyExoticComponent<() => React.JSX.Element> }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LazyRoute Component={LoginPage} />} />
      <Route path={ROUTES.inviteAccept} element={<LazyRoute Component={InviteAcceptPage} />} />
      <Route path={ROUTES.authCallback} element={<LazyRoute Component={AuthCallbackPage} />} />
      <Route
        path="/"
        element={
          <ErrorBoundary>
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          </ErrorBoundary>
        }
      >
        <Route index element={<LazyRoute Component={DashboardPage} />} />
        <Route path="transactions" element={<LazyRoute Component={TransactionsPage} />} />
        <Route path="transactions/import" element={<LazyRoute Component={TransactionImportPage} />} />
        <Route path="transactions/:id/edit" element={<Navigate to={ROUTES.transactions} replace />} />
        <Route path="calendar" element={<Navigate to={ROUTES.transactions} replace />} />
        <Route path="budgets" element={<Navigate to={ROUTES.transactions} replace />} />
        <Route path="recurring" element={<Navigate to={ROUTES.transactions} replace />} />
        <Route path="accounts" element={<LazyRoute Component={AccountsPage} />} />
        <Route path="categories" element={<LazyRoute Component={CategoriesPage} />} />
        {/* 구 경로 호환 리다이렉트 — 일정은 가계부 "일정" 보기로, 연간리포트는 계획 › 연간 › 실적 분석으로,
            "계획·목표" 통합 페이지는 /plan·/goals로 나뉘었다. */}
        <Route path="schedule" element={<LegacyScheduleRedirect />} />
        <Route path="reports/yearly" element={<Navigate to={planAnalysisLink()} replace />} />
        <Route path="plan" element={<LazyRoute Component={PlanPage} />} />
        <Route path="goals" element={<LazyRoute Component={GoalsPage} />} />
        <Route path="goals/:id" element={<LazyRoute Component={GoalDetailPage} />} />
        <Route path="financial-plan" element={<LazyRoute Component={LegacyFinancialPlanRedirect} />} />
        <Route path="settings" element={<LazyRoute Component={SettingsPage} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.login} replace />} />
    </Routes>
  );
}

export default function App() {
  const isDark = useThemeStore((s) => s.isDark);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearClientCaches(queryClient);
      void logout();
    };
    window.addEventListener(APP_EVENTS.sessionExpired, handleSessionExpired);
    return () => window.removeEventListener(APP_EVENTS.sessionExpired, handleSessionExpired);
  }, [logout, queryClient]);

  return (
    <>
      <Toaster />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </>
  );
}
