import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// ✅ Prototype-only login with per-user passwords
// Jerry (Operator)      → Jerry@311
// Tom (Operator)        → Tom@311
// Nagavalli (Supervisor)→ Naga@311

export default function LoginPage() {
  const nav = useNavigate();

  // 🔐 User definitions (prototype-only)
  const users = [
    { name: "Jerry", role: "OPERATOR", password: "Jerry@311" },
    { name: "Tom", role: "OPERATOR", password: "Tom@311" },
    { name: "Nagavalli", role: "SUPERVISOR", password: "Naga@311" },
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function handleLogin(e) {
    e.preventDefault();
    setErr("");

    const selectedUser = users[selectedIndex];

    // 🔎 Validate password for selected user
    if (password !== selectedUser.password) {
      setErr("Invalid password. Please try again.");
      return;
    }

    // ✅ Store session
    localStorage.setItem("insight311_authed", "true");
    localStorage.setItem("userName", selectedUser.name);
    localStorage.setItem("userRole", selectedUser.role);

    // Notify other components
    window.dispatchEvent(new Event("session-changed"));

    nav("/operator");
  }

  return (
    <div
      className="container"
      style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}
    >
      <div className="card" style={{ maxWidth: 520, width: "100%" }}>
        <h2>Dashboard Login</h2>

        <form onSubmit={handleLogin} className="row">
          <div>
            <label>Select User</label>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
            >
              {users.map((u, i) => (
                <option key={u.name} value={i}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          {err && (
            <div style={{ color: "#b42318", fontWeight: 700 }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn primary" type="submit">
              Sign In
            </button>
          </div>

          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
            Supervisor can view all operator tickets.
          </p>
        </form>
      </div>
    </div>
  );
}
