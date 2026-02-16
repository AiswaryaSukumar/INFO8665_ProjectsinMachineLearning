import { useEffect, useState } from "react";
import IntakePage from "./IntakePage";
import DuplicatesPage from "./DuplicatesPage";
import StatusLookupPage from "./StatusLookupPage";
import logo from "../assets/insight311-logo.png";

export default function Dashboard() {
  const [tab, setTab] = useState("Intake");

  const [userName, setUserName] = useState(localStorage.getItem("userName") || "Jerry");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "OPERATOR");

  useEffect(() => {
    const onSessionChanged = () => {
      setUserName(localStorage.getItem("userName") || "Jerry");
      setUserRole(localStorage.getItem("userRole") || "OPERATOR");
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
            Logged in as: <b>{userName}</b> ({userRole})
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
        {["Intake", "Duplicates", "Status Lookup"].map((t) => (
          <button
            key={t}
            className={`tabBtn ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="container">
        {tab === "Intake" && <IntakePage />}
        {tab === "Duplicates" && <DuplicatesPage />}
        {tab === "Status Lookup" && <StatusLookupPage mode="operator" />}
      </div>
    </>
  );
}
