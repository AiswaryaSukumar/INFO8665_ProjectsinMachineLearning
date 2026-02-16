import React from "react";
import { useNavigate } from "react-router-dom";
import StatusLookupPage from "./StatusLookupPage";
import logo from "../assets/insight311-logo.png";

export default function CitizenStatusPage() {
  const nav = useNavigate();

  return (
    <>
      {/* CITIZEN HEADER (branded, public-facing) */}
      <div className="header">
        <div className="headerLeft">
          <img className="logo" src={logo} alt="INSIGHT-311 logo" />
          <span className="appName">INSIGHT-311</span>
        </div>

        <div className="headerCenter">Citizen Status Lookup</div>

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
            Search by ticket number, phone number, or name to view updates.
          </div>

          <div style={{ color: "#64748b", marginTop: 8, fontSize: 13 }}>
            Public access: you can view status only. Personal details are hidden in
            this prototype.
          </div>
        </div>

        {/* Reuse existing UC3 lookup UI */}
        <StatusLookupPage mode="citizen" />
      </div>
    </>
  );
}
