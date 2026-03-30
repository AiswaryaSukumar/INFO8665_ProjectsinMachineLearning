import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function RequireAuth() {
  const loc = useLocation();
  const authed = localStorage.getItem("insight311_authed") === "true";

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return <Outlet />;
}
