// src/pages/DashboardLayout.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import logo from "../assets/insight311-logo.png";

const DEFAULT_SESSION_NAME = "Nagavalli";
const DEFAULT_SESSION_ROLE = "SUPERVISOR";
const DISABLED_SESSION_NAMES = new Set(["jerry", "tom"]);

function getSessionName() {
  const stored = localStorage.getItem("userName");
  return stored && !DISABLED_SESSION_NAMES.has(stored.trim().toLowerCase())
    ? stored
    : DEFAULT_SESSION_NAME;
}

function getSessionRole() {
  const name = getSessionName();
  return name === DEFAULT_SESSION_NAME
    ? DEFAULT_SESSION_ROLE
    : localStorage.getItem("userRole") || DEFAULT_SESSION_ROLE;
}

export default function DashboardLayout() {
  const nav = useNavigate();

  // session user
  const [userName, setUserName] = useState(
    getSessionName()
  );
  const [userRole, setUserRole] = useState(
    getSessionRole()
  );

  // language (persist like the “proper way” spec)
  const [lang, setLang] = useState(
    localStorage.getItem("insight311_lang") || "EN"
  );
  const isFR = lang === "FR";

  // top-right controls
  const [a11yOpen, setA11yOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // a11y toggles
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const actionsRef = useRef(null);

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (!storedName || DISABLED_SESSION_NAMES.has(storedName.trim().toLowerCase())) {
      localStorage.setItem("userName", DEFAULT_SESSION_NAME);
      localStorage.setItem("userRole", DEFAULT_SESSION_ROLE);
      setUserName(DEFAULT_SESSION_NAME);
      setUserRole(DEFAULT_SESSION_ROLE);
      window.dispatchEvent(new Event("session-changed"));
    }
  }, []);

  // listen for session changes
  useEffect(() => {
    const onSessionChanged = () => {
      setUserName(getSessionName());
      setUserRole(getSessionRole());
    };
    window.addEventListener("session-changed", onSessionChanged);
    return () => window.removeEventListener("session-changed", onSessionChanged);
  }, []);

  // persist language
  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
  }, [lang]);

  // apply a11y body toggles
  useEffect(() => {
    document.body.classList.toggle("a11y-large-text", !!a11yLargeText);
  }, [a11yLargeText]);

  useEffect(() => {
    document.body.classList.toggle("a11y-high-contrast", !!a11yHighContrast);
  }, [a11yHighContrast]);

  // close popovers on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target)) {
        setA11yOpen(false);
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const logout = () => {
    localStorage.removeItem("insight311_authed");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    nav("/login");
  };

  // ✅ tab order now: My Work → Overview → Manual → Track request
  const navItems = useMemo(
    () => [
      {
        label: isFR ? "Ma file" : "My Work Queue",
        to: "/dashboard/my-work",
      },
      {
        label: isFR ? "Vue d’ensemble" : "Queue Overview",
        to: "/dashboard/overview",
      },
      {
        label: isFR ? "Saisie manuelle" : "Manual Ticket Intake",
        to: "/dashboard/manual",
      },
      {
        label: isFR ? "Suivi de demande" : "Track request",
        to: "/lookup",
      },
    ],
    [isFR]
  );

  return (
    <div className="dashboardShell">
      {/* HEADER */}
      <header className="lpHeader">
        <div className="lpHeaderLeft">
          <img className="logo" src={logo} alt="INSIGHT-311 logo" />
          <strong style={{ marginLeft: 8 }}>INSIGHT-311</strong>
        </div>

        <div className="lpHeaderCenter">
          {isFR ? "Tableau de bord des opérations" : "Operations Dashboard"}
        </div>

        <div className="lpHeaderRight">
          <div className="dashHeaderStack" ref={actionsRef}>
            <div className="dashTopActions">
              {/* Accessibility */}
              <div className="lpPopoverWrap">
                <button
                  className="btn headerAction"
                  type="button"
                  aria-label={isFR ? "Options d’accessibilité" : "Accessibility options"}
                  onClick={() => {
                    setA11yOpen((v) => !v);
                    setLangOpen(false);
                  }}
                >
                  {isFR ? "Accessibilité" : "Accessibility"}
                </button>

                {a11yOpen && (
                  <div
                    className="lpPopover"
                    role="dialog"
                    aria-label={isFR ? "Paramètres d’accessibilité" : "Accessibility settings"}
                  >
                    <div className="lpPopoverTitle">{isFR ? "Accessibilité" : "Accessibility"}</div>
                    <div className="lpMuted">
                      {isFR
                        ? "Contrôles de démonstration pour le tableau de bord."
                        : "Demo controls for an operations dashboard."}
                    </div>

                    <div className="lpPopoverBody">
                      <label className="lpSwitchRow">
                        <span>{isFR ? "Texte agrandi" : "Large text"}</span>
                        <input
                          type="checkbox"
                          checked={a11yLargeText}
                          onChange={(e) => setA11yLargeText(e.target.checked)}
                        />
                      </label>

                      <label className="lpSwitchRow">
                        <span>{isFR ? "Contraste élevé" : "High contrast"}</span>
                        <input
                          type="checkbox"
                          checked={a11yHighContrast}
                          onChange={(e) => setA11yHighContrast(e.target.checked)}
                        />
                      </label>
                    </div>

                    <div className="lpPopoverFooter">
                      <button
                        className="btn headerAction"
                        type="button"
                        onClick={() => {
                          setA11yLargeText(false);
                          setA11yHighContrast(false);
                        }}
                      >
                        {isFR ? "Réinitialiser" : "Reset"}
                      </button>
                      <button
                        className="btn headerAction primary"
                        type="button"
                        onClick={() => setA11yOpen(false)}
                      >
                        {isFR ? "Terminé" : "Done"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Language */}
              <div className="lpPopoverWrap">
                <button
                  className="btn headerAction"
                  type="button"
                  aria-label={isFR ? "Options de langue" : "Language options"}
                  onClick={() => {
                    setLangOpen((v) => !v);
                    setA11yOpen(false);
                  }}
                >
                  {lang}
                </button>

                {langOpen && (
                  <div className="lpPopover" role="dialog" aria-label="Language selector">
                    <div className="lpPopoverTitle">{isFR ? "Langue" : "Language"}</div>
                    <div className="lpMuted">
                      {isFR ? "Sélecteur de langue (démo)." : "Demo language toggle."}
                    </div>

                    <div className="lpPopoverBody" style={{ display: "grid", gap: 8 }}>
                      <button
                        className={`btn headerAction ${lang === "EN" ? "primary" : ""}`}
                        type="button"
                        onClick={() => {
                          setLang("EN");
                          setLangOpen(false);
                        }}
                      >
                        English (EN)
                      </button>
                      <button
                        className={`btn headerAction ${lang === "FR" ? "primary" : ""}`}
                        type="button"
                        onClick={() => {
                          setLang("FR");
                          setLangOpen(false);
                        }}
                      >
                        Français (FR)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Logout */}
              <button className="btn headerAction logout" onClick={logout} type="button">
                {isFR ? "Déconnexion" : "Logout"}
              </button>
            </div>

            <div className="dashSessionLine">
              <span className="loggedUser">
                {isFR ? "Connecté en tant que :" : "Logged in as:"} <b>{userName}</b>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="tabsBar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `tabBtn ${isActive ? "active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* MAIN */}
      <main className="dashboardContent">
        <Outlet context={{ lang, userName, userRole }} />
      </main>

      {/* FOOTER */}
      <footer className="lpFooter">
        <div className="lpFooterRow">
          <div className="lpFooterLeft">© 2026 INSIGHT–311</div>

          <div className="lpFooterCenter">
            <a href="#" onClick={(e) => e.preventDefault()}>
              {isFR ? "Confidentialité" : "Privacy"}
            </a>
            <span aria-hidden="true">·</span>
            <a href="#" onClick={(e) => e.preventDefault()}>
              {isFR ? "Conditions" : "Terms"}
            </a>
            <span aria-hidden="true">·</span>
            <a href="#" onClick={(e) => e.preventDefault()}>
              {isFR ? "Accessibilité" : "Accessibility"}
            </a>
          </div>

          <div className="lpFooterRight">
            Session: {userName} • {String(userRole || DEFAULT_SESSION_ROLE).toUpperCase()}
          </div>
        </div>
      </footer>
    </div>
  );
}
