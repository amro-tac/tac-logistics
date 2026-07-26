import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./lib/LanguageContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const LoginPage = lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const MapPage = lazy(() => import("./pages/MapPage").then(m => ({ default: m.MapPage })));
const ShipmentsPage = lazy(() => import("./pages/ShipmentsPage").then(m => ({ default: m.ShipmentsPage })));
const ShipmentDetailPage = lazy(() => import("./pages/ShipmentDetailPage").then(m => ({ default: m.ShipmentDetailPage })));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage").then(m => ({ default: m.SuppliersPage })));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const CommoditySearchPage = lazy(() => import("./pages/CommoditySearchPage").then(m => ({ default: m.CommoditySearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const RatesPage = lazy(() => import("./pages/RatesPage").then(m => ({ default: m.RatesPage })));
const CashflowPage = lazy(() => import("./pages/CashflowPage").then(m => ({ default: m.CashflowPage })));

function PageFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
            <Route path="/shipments" element={<ProtectedRoute><ShipmentsPage /></ProtectedRoute>} />
            <Route path="/shipments/:id" element={<ProtectedRoute><ShipmentDetailPage /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute><CommoditySearchPage /></ProtectedRoute>} />
            <Route path="/rates" element={<ProtectedRoute><RatesPage /></ProtectedRoute>} />
            <Route path="/cashflow" element={<ProtectedRoute><CashflowPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </LanguageProvider>
  );
}
