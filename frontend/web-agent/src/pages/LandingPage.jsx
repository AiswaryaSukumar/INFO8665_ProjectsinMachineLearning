import React from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/insight311-logo.png";


export default function LandingPage() {
  const nav = useNavigate();

  return (
    <div className="container" style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
      <div className="card" style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <img src={logo} alt="INSIGHT-311" style={{ width: 110, height: 110, objectFit: "contain" }} />
        <h2 style={{ marginTop: 10 }}>INSIGHT-311</h2>
        <p style={{ color: "#64748b", marginTop: 6 }}>
          AI-assisted municipal service request intake and status visibility.
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <button className="btn primary" onClick={() => nav("/login")}>
            Operator Login
          </button>
          <button className="btn" onClick={() => nav("/citizen")}>
            Track My Request (Citizen)
          </button>
        </div>
      </div>
    </div>
  );
}
