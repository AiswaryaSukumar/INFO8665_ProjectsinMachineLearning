// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import CitizenStatusPage from "./pages/CitizenStatusPage";
import PublicLookupPage from "./pages/PublicLookupPage"; // ✅ NEW (Option A: /lookup)
import Dashboard from "./pages/Dashboard";
import RequireAuth from "./components/RequireAuth";

// ✅ Toast Provider (wrap app once)
import { ToastProvider } from "./components/Toast";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* ✅ Task 566 demo route (public lookup) */}
          <Route path="/lookup" element={<PublicLookupPage />} />

          {/* keep if you already use it; optional now that /lookup exists */}
          <Route path="/citizen" element={<CitizenStatusPage />} />

          {/* Protected Route */}
          <Route element={<RequireAuth />}>
            <Route path="/operator" element={<Dashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
