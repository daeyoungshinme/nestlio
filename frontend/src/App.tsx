import { lazy, Suspense, useEffect } from "react";
import type { LazyExoticComponent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "./components/layout/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoader from "./components/common/PageLoader";
import Toaster from "./components/Toaster";
import { AUTH_ME_CACHE_KEY, useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const TransactionEditPage = lazy(() => import("./pages/TransactionEditPage"));
const TransactionImportPage = lazy(() => import("./pages/TransactionImportPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const ReportsYearlyPage = lazy(() => import("./pages/ReportsYearlyPage"));
const FinancialPlanPage = lazy(() => import("./pages/FinancialPlanPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthChecking = useAuthStore((s) => s.isAuthChecking);
  if (isAuthChecking) return <PageLoader />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
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
      <Route path="/login" element={<LazyRoute Component={LoginPage} />} />
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
        <Route path="transactions/:id/edit" element={<LazyRoute Component={TransactionEditPage} />} />
        <Route path="calendar" element={<Navigate to="/transactions" replace />} />
        <Route path="budgets" element={<Navigate to="/transactions" replace />} />
        <Route path="recurring" element={<Navigate to="/transactions" replace />} />
        <Route path="accounts" element={<LazyRoute Component={AccountsPage} />} />
        <Route path="categories" element={<LazyRoute Component={CategoriesPage} />} />
        <Route path="reports/yearly" element={<LazyRoute Component={ReportsYearlyPage} />} />
        <Route path="financial-plan" element={<LazyRoute Component={FinancialPlanPage} />} />
        <Route path="settings" element={<LazyRoute Component={SettingsPage} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
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
      queryClient.clear();
      window.localStorage.removeItem(AUTH_ME_CACHE_KEY);
      void logout();
    };
    window.addEventListener("nestlio:session-expired", handleSessionExpired);
    return () => window.removeEventListener("nestlio:session-expired", handleSessionExpired);
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
