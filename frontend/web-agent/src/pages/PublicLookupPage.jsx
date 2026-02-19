import { useNavigate } from "react-router-dom";
import StatusLookupPage from "./StatusLookupPage";
import logo from "../assets/insight311-logo.png";

export default function PublicLookupPage() {
  const nav = useNavigate();

  return (
    <>
      {/* PUBLIC HEADER */}
      <div className="header">
        <div className="headerLeft">
          <img className="logo" src={logo} alt="INSIGHT-311 logo" />
          <span className="appName">INSIGHT-311</span>
        </div>

        <div className="headerCenter">Public Ticket Lookup</div>

        <div className="headerRight">
          <button
            className="btn"
            onClick={() => nav("/")}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            Home
          </button>
        </div>
      </div>

      {/* PAGE CONTENT */}
      <div className="container">
        <div className="card" style={{ marginBottom: 12 }}>
          <h2>Track My 311 Request</h2>

          <div style={{ color: "#64748b" }}>
            Search by <b>ticket number</b> or <b>phone number</b> to view updates.
          </div>

          <div style={{ color: "#64748b", marginTop: 8, fontSize: 13 }}>
            Public access: status only. Personal details are hidden in this prototype.
          </div>
        </div>

        {/* Task 566 UI (validation + success/error + rate-limit UX) */}
        <StatusLookupPage mode="citizen" />
      </div>
    </>
  );
}
