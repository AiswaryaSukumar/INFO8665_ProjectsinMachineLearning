// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import CitizenStatusPage from "./pages/CitizenStatusPage";
import PublicLookupPage from "./pages/PublicLookupPage"; // ✅ /lookup
import PublicRequestPage from "./pages/PublicRequestPage";

import DashboardLayout from "./pages/DashboardLayout";
import IntakePage from "./pages/IntakePage";

import RequireAuth from "./components/RequireAuth";

import TicketDetailsPage from "./pages/TicketDetailsPage";

// ✅ Toast Provider (wrap app once)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/request" element={<PublicRequestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/lookup" element={<PublicLookupPage />} />
          <Route path="/citizen" element={<CitizenStatusPage />} />
          {/* Public alias (e.g., from Status Lookup). Dashboard uses /dashboard/ticket/:id */}
          <Route path="/ticket/:ticketNumber" element={<TicketDetailsPage />} />

          {/* Protected */}
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Navigate to="my-work" replace />} />

              <Route
                path="my-work"
                element={<IntakePage activeView="MY_WORK_QUEUE" />}
              />
              <Route
                path="overview"
                element={<IntakePage activeView="QUEUE_OVERVIEW" />}
              />

              {/* ✅ Manual 3rd */}
              <Route
                path="manual"
                element={<IntakePage activeView="MANUAL_TICKET" />}
              />

              {/* ✅ Voice 4th */}
              <Route
                path="voice"
                element={<IntakePage activeView="VOICE_INTAKE" />}
              />

              {/* ✅ Ticket opens as a proper full page (not a side drawer) */}
              <Route
                path="ticket/:ticketNumber"
                element={<TicketDetailsPage />}
              />
            </Route>

            {/* Back-compat: existing login navigates to /operator */}
            <Route
              path="/operator"
              element={<Navigate to="/dashboard/my-work" replace />}
            />
          </Route>

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}