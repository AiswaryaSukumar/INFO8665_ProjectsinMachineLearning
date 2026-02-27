import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/insight311-logo.png";

// Ticket overview (History-style) shown on login page
import { mockTickets } from "../mock/mockTickets.js";
import DonutChart from "../components/DonutChart";

// Department inference (so Top departments is meaningful even if mock ticket lacks `department`)
import { inferDepartmentFromCategory } from "../utils/categoryRouting";

// ✅ Prototype-only login with per-user passwords
// Jerry (Operator)      → Jerry@311
// Tom (Operator)        → Tom@311
// Nagavalli (Supervisor)→ Naga@311

export default function LoginPage() {
  const nav = useNavigate();

  // Topbar controls (shared pattern with Landing/Public pages)
  const actionsRef = useRef(null);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState(
    () => localStorage.getItem("insight311_lang") || "EN"
  );

  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
  }, [lang]);

  useEffect(() => {
    function onDocClick(e) {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target)) {
        setA11yOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("a11y-large-text", a11yLargeText);
  }, [a11yLargeText]);

  useEffect(() => {
    document.body.classList.toggle("a11y-high-contrast", a11yHighContrast);
  }, [a11yHighContrast]);

  const copy = useMemo(
    () =>
      (
        {
          EN: {
            navHome: "HOME",
            navTrack: "Track request",
            back: "BACK",
            title: "Operator Portal",
            sub: "Sign in to view queues, assign tickets, and review AI handoffs.",
            selectUser: "Select User",
            password: "Password",
            signIn: "Sign In",
            login: "Login",
            rememberMe: "Remember me",
            forgot: "Forgot password?",
            forgotInfo:
              "Password reset will be enabled once the database + email/SMS service is connected.",
            leftTitle: "Today’s operator checklist",
            leftBul1: "Validate voice-bot transcripts and confirm the issue category",
            leftBul2: "Confirm routing to the right department and priority (SLA)",
            leftBul3: "Escalate sensitive cases and request supervisor approval when needed",

            workflowsTitle: "Operator quick guide",
            workflowsBul1: "Review transcript + confirm category",
            workflowsBul2: "Validate location details and urgency",
            workflowsBul3: "Route to department or flag for supervisor review",
            overviewTitle: "System-wide ticket overview",
            overviewSub:
              "Snapshot of all tickets in the prototype dataset (matches the History view).",
          },
          FR: {
            navHome: "ACCUEIL",
            navTrack: "Suivre une demande",
            back: "RETOUR",
            title: "Portail opérateur",
            sub:
              "Connectez-vous pour voir les files, assigner des billets et réviser les transferts IA.",
            selectUser: "Sélectionner l’utilisateur",
            password: "Mot de passe",
            signIn: "Se connecter",
            login: "Connexion",
            rememberMe: "Se souvenir de moi",
            forgot: "Mot de passe oublié ?",
            forgotInfo:
              "La réinitialisation sera activée lorsque la base de données et le service e‑mail/SMS seront connectés.",
            leftTitle: "Liste de vérification opérateur (aujourd’hui)",
            leftBul1: "Validez les transcriptions du bot vocal et confirmez la catégorie",
            leftBul2: "Confirmez le routage vers le bon service et la priorité (SLA)",
            leftBul3: "Escaladez les cas sensibles et demandez l’approbation du superviseur",

            workflowsTitle: "Guide rapide (opérateur)",
            workflowsBul1: "Vérifier la transcription + confirmer la catégorie",
            workflowsBul2: "Valider l’emplacement et l’urgence",
            workflowsBul3: "Router vers le service ou signaler au superviseur",
            overviewTitle: "Aperçu global des billets",
            overviewSub:
              "Instantané de tous les billets du jeu de données (correspond à l’onglet Historique).",
          },
        }[lang]
      ),
    [lang]
  );

  // 🔐 User definitions (prototype-only)
  const users = [
    { name: "Jerry", role: "OPERATOR", password: "Jerry@311" },
    { name: "Tom", role: "OPERATOR", password: "Tom@311" },
    { name: "Nagavalli", role: "SUPERVISOR", password: "Naga@311" },
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  // Auth UX (DB connection later)
  const [rememberMe, setRememberMe] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [info, setInfo] = useState("");

  function doLogin() {
    setErr("");
    setInfo("");

    const selectedUser = users[selectedIndex];

    // ✅ Prototype behavior (until DB is wired): require a non-empty password.
    if (!password || password.trim().length < 3) {
      setErr(lang === "FR" ? "Mot de passe invalide." : "Invalid password.");
      return;
    }

    // ✅ Store session (persist if Remember Me is on)
    const store = rememberMe ? localStorage : sessionStorage;
    store.setItem("insight311_authed", "true");
    store.setItem("userName", selectedUser.name);
    store.setItem("userRole", selectedUser.role);

    // keep localStorage in sync for pages that only read localStorage
    localStorage.setItem("insight311_authed", "true");
    localStorage.setItem("userName", selectedUser.name);
    localStorage.setItem("userRole", selectedUser.role);

    // Notify other components
    window.dispatchEvent(new Event("session-changed"));

    // ✅ New dashboard routes
    nav("/dashboard/my-work");
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    doLogin();
  }

  function startForgot() {
    setErr("");
    setInfo(copy.forgotInfo);
  }

  // ------------------------
  // Login-page ticket overview (History style)
  // ------------------------
  const overview = useMemo(() => {
    const all = Array.isArray(mockTickets) ? mockTickets : [];
    const total = all.length;

    const topN = (obj, n = 3) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);

    const bySource = all.reduce(
      (acc, t) => {
        const src = t?.createdByType === "VOICE_BOT" ? "Voice Bot" : "Human";
        acc[src] = (acc[src] || 0) + 1;
        return acc;
      },
      { "Voice Bot": 0, Human: 0 }
    );

    // Login page only: include DUPLICATE placeholder (even if 0)
    // (Does NOT impact operator basket donuts because it's only used here.)
    const STATUS_ORDER = [
      "NEW",
      "IN_PROGRESS",
      "NEEDS_REVIEW",
      "ESCALATED",
      "DUPLICATE",
      "RESOLVED",
      "DELETE",
    ];

    const byStatus = all.reduce((acc, t) => {
      const s = (t?.status || "NEW").toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // Small context breakdowns (derived from mock tickets)
    const byCategory = all.reduce((acc, t) => {
      const k = t?.category || "Other";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const byDept = all.reduce((acc, t) => {
      const k = t?.department || inferDepartmentFromCategory(t?.category);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const topCategories = topN(byCategory, 3);
    const topDepts = topN(byDept, 3);

    const outerSegments = [
      { label: "Voice Bot", value: bySource["Voice Bot"] || 0 },
      { label: "Human", value: bySource.Human || 0 },
    ].filter((x) => x.value > 0);

    const innerSegments = STATUS_ORDER
      .filter((k) => (byStatus[k] || 0) > 0 || k === "DUPLICATE")
      .map((k) => ({
        label: k,
        value: byStatus[k] || 0,
      }));

    return {
      total,
      outerSegments,
      innerSegments,
      openCount: Math.max(0, total - (byStatus.RESOLVED || 0) - (byStatus.DELETE || 0)),
      escalatedCount: byStatus.ESCALATED || 0,
      duplicateCount: byStatus.DUPLICATE || 0,
      avgHandling: null,
      topCategories,
      topDepts,
    };
  }, [lang]);

  // ------------------------
  // Role-aware preview card (minimal, non-overwhelming)
  // ------------------------
  const rolePreview = useMemo(() => {
    const all = Array.isArray(mockTickets) ? mockTickets : [];
    const u = users[selectedIndex] || users[0];

    if (u.role === "SUPERVISOR") {
      // Supervisor: approvals + escalations that need attention (mock logic)
      const pendingApprovals = all.filter(
        (t) =>
          String(t?.routingStatus || "").toUpperCase() === "PENDING_APPROVAL" &&
          (t?.approvedAt == null || t?.approvedAt === "") &&
          // bot-created items are what typically need governance
          String(t?.createdByType || "").toUpperCase() === "VOICE_BOT"
      ).length;

      const escalated = all.filter(
        (t) => String(t?.status || "").toUpperCase() === "ESCALATED"
      ).length;

      return {
        title: lang === "FR" ? "Aperçu du superviseur" : "Supervisor preview",
        lines: [
          {
            k: lang === "FR" ? "Approbations en attente" : "Pending approvals",
            v: String(pendingApprovals),
          },
          {
            k: lang === "FR" ? "Cas escaladés" : "Escalated cases",
            v: String(escalated),
          },
          {
            k: lang === "FR" ? "Gouvernance" : "Governance",
            v:
              lang === "FR"
                ? "Valider les résolutions du bot lorsque requis"
                : "Review bot-only items when required",
            isText: true,
          },
        ],
      };
    }

    // Operator: assigned / needs review / escalated (mock logic)
    const mine = all.filter((t) => String(t?.handledByName || "") === u.name);
    const assignedOpen = mine.filter((t) => {
      const s = String(t?.status || "NEW").toUpperCase();
      return s !== "RESOLVED" && s !== "DELETE";
    }).length;
    const needsReview = mine.filter(
      (t) => String(t?.status || "").toUpperCase() === "NEEDS_REVIEW"
    ).length;
    const escalatedMine = mine.filter(
      (t) => String(t?.status || "").toUpperCase() === "ESCALATED"
    ).length;

    return {
      title: lang === "FR" ? "Aperçu de l’opérateur" : "Operator preview",
      lines: [
        {
          k: lang === "FR" ? "Assignés (ouverts)" : "Assigned (open)",
          v: String(assignedOpen),
        },
        {
          k: lang === "FR" ? "À réviser" : "Needs review",
          v: String(needsReview),
        },
        {
          k: lang === "FR" ? "Escaladés" : "Escalated",
          v: String(escalatedMine),
        },
      ],
    };
  }, [lang, selectedIndex]);

  return (
    <div className="lpShell">
      <header className="lpTopbar">
        <div className="lpTopbarInner" ref={actionsRef}>
          <div className="lpLeftCluster">
            <div
              className="lpBrand"
              onClick={() => nav("/")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && nav("/")}
              aria-label="Go to home"
            >
              <img className="lpLogo" src={logo} alt="INSIGHT-311 logo" />
              <div className="lpBrandText">
                <div className="lpBrandTitle">INSIGHT-311</div>
                <div className="lpBrandTag">Municipal Operations Portal</div>
              </div>
            </div>
          </div>

          <nav className="lpNav" aria-label="Primary navigation">
            <button className="lpNavLink" onClick={() => nav("/")}>{copy.navHome}</button>
            <button className="lpNavLink" onClick={() => nav("/lookup")}>{copy.navTrack}</button>
          </nav>

          <div className="lpTopActions">
            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label="Accessibility settings"
                onClick={() => {
                  setA11yOpen((v) => !v);
                  setLangOpen(false);
                }}
              >
                Accessibility
              </button>

              {a11yOpen && (
                <div className="lpPopover" role="dialog" aria-label="Accessibility settings">
                  <div className="lpPopoverTitle">Accessibility</div>
                  <div className="lpMuted">Demo controls for this prototype.</div>

                  <div className="lpPopoverBody">
                    <label className="lpSwitchRow">
                      <span>Large text</span>
                      <input
                        type="checkbox"
                        checked={a11yLargeText}
                        onChange={(e) => setA11yLargeText(e.target.checked)}
                      />
                    </label>

                    <label className="lpSwitchRow">
                      <span>High contrast</span>
                      <input
                        type="checkbox"
                        checked={a11yHighContrast}
                        onChange={(e) => setA11yHighContrast(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="lpPopoverFooter">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setA11yLargeText(false);
                        setA11yHighContrast(false);
                      }}
                    >
                      Reset
                    </button>
                    <button className="btn primary" type="button" onClick={() => setA11yOpen(false)}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label="Language options"
                onClick={() => {
                  setLangOpen((v) => !v);
                  setA11yOpen(false);
                }}
              >
                {lang}
              </button>

              {langOpen && (
                <div className="lpPopover" role="dialog" aria-label="Language options">
                  <div className="lpPopoverTitle">Language</div>
                  <div className="lpPopoverBody">
                    <button
                      className={`lpLangOption ${lang === "EN" ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setLang("EN");
                        setLangOpen(false);
                      }}
                    >
                      English (EN)
                    </button>
                    <button
                      className={`lpLangOption ${lang === "FR" ? "active" : ""}`}
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
          </div>
        </div>
      </header>

      {/* Thin system mode banner (enterprise pattern, low cognitive load) */}
      <div className="lpModeBanner" role="status" aria-label="System mode">
        <span className="lpModeDot" aria-hidden="true" />
        <span>
          {lang === "FR"
            ? "Mode prototype • Jeu de données local • Certaines actions sont simulées"
            : "Prototype mode • Local dataset • Some actions are simulated"}
        </span>
      </div>

      <main className="lpMain" style={{ paddingTop: 28 }}>
        <div className="container">
          <div className="lpPageBackRow">
            <button className="lpBackBtn" type="button" onClick={() => nav(-1)}>
              {copy.back}
            </button>
          </div>

          <div className="lpAuthGrid">
            <div className="lpAuthIntro">
              <div className="lpKickerDark">INSIGHT-311 • Operations</div>
              <h1 className="lpLeadTitle" style={{ marginTop: 10 }}>
                {copy.title}
              </h1>
              <p className="lpLeadSub">{copy.sub}</p>

              <div className="card" style={{ marginTop: 14 }}>
                <div className="lpMuted" style={{ fontWeight: 800, marginBottom: 8 }}>
                  {copy.leftTitle}
                </div>
                <ul className="lpAuthList">
                  <li>{copy.leftBul1}</li>
                  <li>{copy.leftBul2}</li>
                  <li>{copy.leftBul3}</li>
                </ul>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="lpMuted" style={{ fontWeight: 800, marginBottom: 8 }}>
                  {copy.workflowsTitle}
                </div>
                <ul className="lpAuthList">
                  <li>{copy.workflowsBul1}</li>
                  <li>{copy.workflowsBul2}</li>
                  <li>{copy.workflowsBul3}</li>
                </ul>
              </div>
            </div>

            <div className="card lpAuthCard">
              <div className="lpAuthHeader">
                <div className="lpAuthTitle">
                  {lang === "FR" ? "Connexion au tableau de bord" : "Dashboard Login"}
                </div>
                <div className="lpAuthBadges">
                  <span className="badge">MFA: Demo</span>
                  <span className="badge">SSO: Planned</span>
                </div>
              </div>

              <form onSubmit={handleLoginSubmit} className="row">
                  <div>
                    <label>{copy.selectUser}</label>
                    <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))}>
                      {users.map((u, i) => (
                        <option key={u.name} value={i}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Role-aware preview (minimal) */}
                  <div className="lpRolePreview" aria-label="Role preview">
                    <div className="lpRolePreviewHead">
                      <span className="lpRolePreviewTitle">{rolePreview.title}</span>
                      <span className="lpRolePill">
                        {users[selectedIndex]?.role === "SUPERVISOR"
                          ? (lang === "FR" ? "Superviseur" : "Supervisor")
                          : (lang === "FR" ? "Opérateur" : "Operator")}
                      </span>
                    </div>
                    <div className="lpRolePreviewBody">
                      {rolePreview.lines.map((x) => (
                        <div className="lpRoleRow" key={x.k}>
                          <div className="lpRoleKey">{x.k}</div>
                          <div className={x.isText ? "lpRoleText" : "lpRoleVal"}>{x.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label>{copy.password}</label>
                    <div className="lpPwWrap">
                      <input
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={lang === "FR" ? "Entrer le mot de passe" : "Enter password"}
                        autoComplete="current-password"
                      />
                      <button
                        className="lpPwToggle"
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={showPass ? "Hide password" : "Show password"}
                      >
                        {showPass ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <label className="lpRemember">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    <span>{copy.rememberMe}</span>
                  </label>

                  {info && <div className="lpInfo">{info}</div>}
                  {err && <div className="lpError">{err}</div>}

                  <div className="lpAuthActionsBar">
                    <button className="btn primary" type="submit">{copy.login}</button>
                    <button className="btn primary soft" type="button" onClick={startForgot}>{copy.forgot}</button>
                  </div>
                </form>
            </div>
          </div>

          {/* Ticket history overview moved to Login page (bottom section) */}
          <section className="lpLoginOverview">
            <div className="card lpOverviewCard">
              <div className="lpOverviewHead">
                <div>
                  <div className="lpOverviewTitle">{copy.overviewTitle}</div>
                  <div className="lpMuted">{copy.overviewSub}</div>
                </div>
                <div className="lpOverviewTotal">
                  <div className="lpMuted" style={{ fontWeight: 800 }}>Total</div>
                  <div className="lpOverviewNum">{overview.total}</div>
                </div>
              </div>

              <div className="lpKpiRow">
                <div className="lpKpi">
                  <div className="lpKpiLabel">{lang === "FR" ? "Billets ouverts" : "Open tickets"}</div>
                  <div className="lpKpiValue">{overview.openCount}</div>
                </div>
                <div className="lpKpi">
                  <div className="lpKpiLabel">{lang === "FR" ? "Escaladés" : "Escalated"}</div>
                  <div className="lpKpiValue">{overview.escalatedCount}</div>
                </div>
                <div className="lpKpi">
                  <div className="lpKpiLabel">{lang === "FR" ? "Temps moyen" : "Avg handling time"}</div>
                  <div className="lpKpiValue">{lang === "FR" ? "Prévu" : "Planned"}</div>
                  <div className="lpKpiSub">
                    {lang === "FR"
                      ? "Calculé après intégration (journaux)"
                      : "Calculated after backend logging"}
                  </div>
                </div>
              </div>

              <div className="lpOverviewGrid">
                <div className="lpOverviewChart">
                  <DonutChart
                    outerSegments={overview.outerSegments}
                    innerSegments={overview.innerSegments}
                    total={overview.total}
                    size={280}
                  />
                </div>
                <div className="lpOverviewNotes">
                  <div className="lpNotesStack">
                    <div className="lpNotesBlock">
                      <div className="lpMuted" style={{ fontWeight: 800, marginBottom: 8 }}>
                        {lang === "FR" ? "Notes" : "Notes"}
                      </div>
                      <div className="lpMuted" style={{ lineHeight: 1.6 }}>
                        {lang === "FR"
                          ? "Dans Sprint 1, ce tableau de bord sera alimenté par la base de données et le flux du bot vocal."
                          : "In Sprint 1, this will be powered by the database and the voice-bot intake flow."}
                      </div>
                      <div className="lpMuted" style={{ lineHeight: 1.6, marginTop: 10 }}>
                        {lang === "FR"
                          ? "Les actions (approbation superviseur, routage, doublons) seront tracées dans l’historique des billets."
                          : "Actions (supervisor approval, routing, duplicates) will be tracked in ticket history."}
                      </div>
                    </div>

                    <div className="lpOverviewSideCardsRow" aria-label="Top breakdowns">
                      <div className="lpNoteCard">
                        <div className="lpNoteLabel">
                          {lang === "FR" ? "Top catégories" : "Top categories"}
                        </div>
                        {overview.topCategories.map(([k, v]) => (
                          <div key={k} className="lpMiniRow">
                            <span className="lpMiniKey">{k}</span>
                            <span className="lpMiniVal">{v}</span>
                          </div>
                        ))}
                      </div>

                      <div className="lpNoteCard">
                        <div className="lpNoteLabel">
                          {lang === "FR" ? "Top services" : "Top departments"}
                        </div>
                        {overview.topDepts.map(([k, v]) => (
                          <div key={k} className="lpMiniRow">
                            <span className="lpMiniKey">{k}</span>
                            <span className="lpMiniVal">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="lpFooter">
        <div className="lpFooterInner">
          <div className="lpFooterCols">
            <div>
              <div className="lpFooterTitle">INSIGHT-311</div>
              <div className="lpMuted">AI-assisted municipal operations dashboard prototype (INFO8665).</div>
            </div>
            <div>
              <div className="lpFooterTitle">Help</div>
              <div className="lpMuted">Call 311 for non-emergency support.</div>
              <div className="lpMuted">For emergencies, call 911.</div>
            </div>
            <div>
              <div className="lpFooterTitle">Legal</div>
              <div className="lpFooterBottomLinks">
                <span>Privacy</span>
                <span>Terms</span>
                <span>Accessibility</span>
              </div>
            </div>
          </div>

          <div className="lpFooterBottom">
            <div>© {new Date().getFullYear()} INSIGHT-311</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
