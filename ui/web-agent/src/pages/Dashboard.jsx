import { useEffect, useMemo, useState } from "react";
import IntakePage from "./IntakePage";
import logo from "../assets/insight311-logo.png";

export default function Dashboard() {
  // Top-level navigation for the Operations Dashboard
  // (All 3 buttons jump to sections within the single Intake workspace.)
  const [tab, setTab] = useState("Manual Ticket Intake");

  const [userName, setUserName] = useState(localStorage.getItem("userName") || "Nagavalli");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "SUPERVISOR");

  useEffect(() => {
    const onSessionChanged = () => {
      setUserName(localStorage.getItem("userName") || "Nagavalli");
      setUserRole(localStorage.getItem("userRole") || "SUPERVISOR");
    };
    window.addEventListener("session-changed", onSessionChanged);
    return () => window.removeEventListener("session-changed", onSessionChanged);
  }, []);

  const logout = () => {
    localStorage.removeItem("insight311_authed");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    window.location.href = "/";
  };

  const navItems = useMemo(
    () => [
      { label: "My Work Queue", targetId: "my-work-queue" },
      { label: "Queue Overview", targetId: "queue-overview" },
      { label: "Manual Ticket Intake", targetId: "manual-ticket-intake" },
    ],
    []
  );

  const jumpTo = (item) => {
    setTab(item.label);
    // Allow React to paint before scrolling
    window.requestAnimationFrame(() => {
      const el = document.getElementById(item.targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <div className="header">
        <div className="headerLeft">
          <img className="logo" src={logo} alt="INSIGHT-311 logo" />
          <span className="appName">INSIGHT-311</span>
        </div>

        <div className="headerCenter">Operations Dashboard</div>

        <div className="headerRight">
          <span style={{ color: "white", opacity: 0.92, fontSize: 13 }}>
            Logged in as: <b>{userName}</b>
          </span>

          <button
            className="btn"
            onClick={logout}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="tabsBar">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`tabBtn ${tab === item.label ? "active" : ""}`}
            onClick={() => jumpTo(item)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="container">
        <IntakePage />
      </div>
    </>
  );
}
