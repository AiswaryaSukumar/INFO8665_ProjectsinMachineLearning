import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/insight311-logo.png";
import { mockTickets } from "../mock/mockTickets.js";
import { inferDepartmentFromCategory } from "../utils/categoryRouting";

export default function LoginPage() {
  const nav = useNavigate();

  const actionsRef = useRef(null);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState(
    () => localStorage.getItem("insight311_lang") || "EN"
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [err, setErr] = useState("");

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
      ({
        EN: {
          navHome: "HOME",
          navTrack: "Track request",
          back: "BACK",
          title: "Operator Portal",
          sub: "Sign in to view queues, assign tickets, and review AI handoffs.",
          selectUser: "Select User",
          password: "Password",
          login: "Login",
          remember: "Keep me signed in on this device",
          forgot: "Forgot password?",
          show: "Show",
          hide: "Hide",
          rolePreview: "Selected role preview",
          roleName: "User",
          roleType: "Role",
          roleScope: "Access scope",
          roleHelp:
            "This prototype uses role-based login to simulate operator and supervisor workflows.",
          operatorScope: "Can review, edit, and route tickets in working queues.",
          supervisorScope:
            "Can review escalations, approve routing decisions, and monitor queue health.",
          leftTitle: "Today’s operator checklist",
          leftBul1:
            "Validate voice-bot transcripts and confirm the issue category",
          leftBul2:
            "Confirm routing to the right department and priority (SLA)",
          leftBul3:
            "Escalate sensitive cases and request supervisor approval when needed",
          workflowsTitle: "Operator quick guide",
          workflowsBul1: "Review transcript + confirm category",
          workflowsBul2: "Validate location details and urgency",
          workflowsBul3: "Route to department or flag for supervisor review",
          overviewTitle: "System-wide ticket overview",
          overviewSub:
            "Snapshot of all tickets in the prototype dataset (matches the History view).",
          invalidPassword: "Invalid password.",
          loginHelp:
            "Use the assigned demo password for the selected role account.",
          notesTitle: "Notes",
          note1:
            "In Sprint 1, this will be powered by the database and the voice-bot intake flow.",
          note2:
            "Actions (supervisor approval, routing, duplicates) will be tracked in ticket history.",
          total: "Total",
          openTickets: "Open tickets",
          escalated: "Escalated",
          avgHandling: "Avg handling time",
          planned: "Planned",
          avgHandlingSub: "Calculated after backend logging",
          topCategories: "Top categories",
          topDepartments: "Top departments",
          operatorLogin: "Operator Login",
          accessibility: "Accessibility",
          accessibilityHelp: "Demo controls for this prototype.",
          largeText: "Large text",
          highContrast: "High contrast",
          reset: "Reset",
          done: "Done",
          language: "Language",
          english: "English (EN)",
          french: "Français (FR)",
          modeBanner:
            "Prototype mode • Local dataset • Some actions are simulated",
          footerAbout:
            "AI-assisted municipal operations dashboard prototype (INFO8665).",
          footerHelp: "Help",
          footerHelpLine1: "Call 311 for non-emergency support.",
          footerHelpLine2: "For emergencies, call 911.",
          footerLegal: "Legal",
          recentActivity: "Recent activity",
          workflowSnapshot: "Workflow snapshot",
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
          login: "Connexion",
          remember: "Rester connecté sur cet appareil",
          forgot: "Mot de passe oublié ?",
          show: "Afficher",
          hide: "Masquer",
          rolePreview: "Aperçu du rôle sélectionné",
          roleName: "Utilisateur",
          roleType: "Rôle",
          roleScope: "Portée d’accès",
          roleHelp:
            "Ce prototype utilise une connexion par rôle pour simuler les flux opérateur et superviseur.",
          operatorScope:
            "Peut examiner, modifier et router les billets dans les files de travail.",
          supervisorScope:
            "Peut examiner les escalades, approuver le routage et surveiller la santé des files.",
          leftTitle: "Liste de vérification opérateur (aujourd’hui)",
          leftBul1:
            "Validez les transcriptions du bot vocal et confirmez la catégorie",
          leftBul2:
            "Confirmez le routage vers le bon service et la priorité (SLA)",
          leftBul3:
            "Escaladez les cas sensibles et demandez l’approbation du superviseur",
          workflowsTitle: "Guide rapide (opérateur)",
          workflowsBul1: "Vérifier la transcription + confirmer la catégorie",
          workflowsBul2: "Valider l’emplacement et l’urgence",
          workflowsBul3: "Router vers le service ou signaler au superviseur",
          overviewTitle: "Aperçu global des billets",
          overviewSub:
            "Instantané de tous les billets du jeu de données (correspond à l’onglet Historique).",
          invalidPassword: "Mot de passe invalide.",
          loginHelp:
            "Utilisez le mot de passe de démonstration assigné au compte sélectionné.",
          notesTitle: "Notes",
          note1:
            "Dans Sprint 1, ce tableau de bord sera alimenté par la base de données et le flux du bot vocal.",
          note2:
            "Les actions (approbation superviseur, routage, doublons) seront tracées dans l’historique des billets.",
          total: "Total",
          openTickets: "Billets ouverts",
          escalated: "Escaladés",
          avgHandling: "Temps moyen",
          planned: "Prévu",
          avgHandlingSub: "Calculé après intégration (journaux)",
          topCategories: "Top catégories",
          topDepartments: "Top services",
          operatorLogin: "Connexion opérateur",
          accessibility: "Accessibilité",
          accessibilityHelp: "Commandes de démonstration pour ce prototype.",
          largeText: "Texte agrandi",
          highContrast: "Contraste élevé",
          reset: "Réinitialiser",
          done: "OK",
          language: "Langue",
          english: "English (EN)",
          french: "Français (FR)",
          modeBanner:
            "Mode prototype • Jeu de données local • Certaines actions sont simulées",
          footerAbout:
            "Prototype de tableau de bord municipal assisté par IA (INFO8665).",
          footerHelp: "Aide",
          footerHelpLine1: "Appelez le 311 pour le soutien non urgent.",
          footerHelpLine2: "Pour les urgences, appelez le 911.",
          footerLegal: "Mentions légales",
          recentActivity: "Activité récente",
          workflowSnapshot: "Aperçu du flux",
        },
      }[lang]),
    [lang]
  );

  const users = [
    { name: "Jerry", role: "OPERATOR", password: "Jerry@311" },
    { name: "Tom", role: "OPERATOR", password: "Tom@311" },
    { name: "Nagavalli", role: "SUPERVISOR", password: "Naga@311" },
  ];

  const selectedUser = users[selectedIndex];

  const roleScopeText =
    selectedUser.role === "SUPERVISOR"
      ? copy.supervisorScope
      : copy.operatorScope;

  function doLogin() {
    setErr("");

    const enteredPassword = password.trim();

    if (!enteredPassword) {
      setErr(copy.invalidPassword);
      return;
    }

    if (enteredPassword !== selectedUser.password) {
      setErr(copy.invalidPassword);
      return;
    }

    const sessionTarget = rememberMe ? localStorage : sessionStorage;
    const otherTarget = rememberMe ? sessionStorage : localStorage;

    sessionTarget.setItem("insight311_authed", "true");
    sessionTarget.setItem("userName", selectedUser.name);
    sessionTarget.setItem("userRole", selectedUser.role);

    otherTarget.removeItem("insight311_authed");
    otherTarget.removeItem("userName");
    otherTarget.removeItem("userRole");

    window.dispatchEvent(new Event("session-changed"));
    nav("/dashboard/my-work");
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    doLogin();
  }

  const overview = useMemo(() => {
    const all = Array.isArray(mockTickets) ? mockTickets : [];
    const total = all.length;

    const topN = (obj, n = 3) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);

    const normalizeStatus = (t) => String(t?.status || "NEW").toUpperCase();

    const byStatus = all.reduce((acc, t) => {
      const s = normalizeStatus(t);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const byCategory = all.reduce((acc, t) => {
      const k = t?.category || "Other";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const byDept = all.reduce((acc, t) => {
      const k = t?.department || inferDepartmentFromCategory(t?.category) || "General";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const parseDate = (value) => {
      const s = String(value || "");
      const iso = s.includes("T") ? s : s.replace(" ", "T");
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const recentTickets = [...all]
      .sort((a, b) => parseDate(b?.createdAt) - parseDate(a?.createdAt))
      .slice(0, 5)
      .map((t) => ({
        ticketNumber: t?.ticketNumber || t?.id || "—",
        category: t?.category || "Other",
        department:
          t?.department || inferDepartmentFromCategory(t?.category) || "General",
        status: normalizeStatus(t),
      }));

    return {
      total,
      openCount: Math.max(
        0,
        total - (byStatus.RESOLVED || 0) - (byStatus.DELETE || 0)
      ),
      escalatedCount: byStatus.ESCALATED || 0,
      workflow: [
        { label: "NEW", value: byStatus.NEW || 0 },
        { label: "NEEDS_REVIEW", value: byStatus.NEEDS_REVIEW || 0 },
        { label: "IN_PROGRESS", value: byStatus.IN_PROGRESS || 0 },
        { label: "RESOLVED", value: byStatus.RESOLVED || 0 },
      ],
      topCategories: topN(byCategory, 3),
      topDepts: topN(byDept, 3),
      recentTickets,
    };
  }, []);

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
            <button className="lpNavLink" onClick={() => nav("/")}>
              {copy.navHome}
            </button>
            <button className="lpNavLink" onClick={() => nav("/lookup")}>
              {copy.navTrack}
            </button>
          </nav>

          <div className="lpTopActions">
            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label={copy.accessibility}
                onClick={() => {
                  setA11yOpen((v) => !v);
                  setLangOpen(false);
                }}
              >
                {copy.accessibility}
              </button>

              {a11yOpen && (
                <div className="lpPopover" role="dialog" aria-label={copy.accessibility}>
                  <div className="lpPopoverTitle">{copy.accessibility}</div>
                  <div className="lpMuted">{copy.accessibilityHelp}</div>

                  <div className="lpPopoverBody">
                    <label className="lpSwitchRow">
                      <span>{copy.largeText}</span>
                      <input
                        type="checkbox"
                        checked={a11yLargeText}
                        onChange={(e) => setA11yLargeText(e.target.checked)}
                      />
                    </label>

                    <label className="lpSwitchRow">
                      <span>{copy.highContrast}</span>
                      <input
                        type="checkbox"
                        checked={a11yHighContrast}
                        onChange={(e) => setA11yHighContrast(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="lpPopoverFooter">
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => {
                        setA11yLargeText(false);
                        setA11yHighContrast(false);
                      }}
                    >
                      {copy.reset}
                    </button>
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => setA11yOpen(false)}
                    >
                      {copy.done}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label={copy.language}
                onClick={() => {
                  setLangOpen((v) => !v);
                  setA11yOpen(false);
                }}
              >
                {lang}
              </button>

              {langOpen && (
                <div className="lpPopover" role="dialog" aria-label={copy.language}>
                  <div className="lpPopoverTitle">{copy.language}</div>
                  <div className="lpPopoverBody">
                    <button
                      className={`lpLangItem ${lang === "EN" ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setLang("EN");
                        setLangOpen(false);
                      }}
                    >
                      {copy.english}
                    </button>
                    <button
                      className={`lpLangItem ${lang === "FR" ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setLang("FR");
                        setLangOpen(false);
                      }}
                    >
                      {copy.french}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="lpModeBanner" role="status" aria-label="System mode">
        <span className="lpModeDot" aria-hidden="true" />
        <span>{copy.modeBanner}</span>
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
                <div className="lpLoginTitle">{copy.operatorLogin}</div>
                <div className="lpAuthBadges">
                  <span className="badge">MFA: Demo</span>
                  <span className="badge">SSO: Planned</span>
                </div>
              </div>

              <div className="lpRolePreview" style={{ marginBottom: 14 }}>
                <div className="lpRolePreviewHead">
                  <div className="lpRolePreviewTitle">{copy.rolePreview}</div>
                  <span className="lpRolePill">{selectedUser.role}</span>
                </div>

                <div className="lpRolePreviewBody">
                  <div className="lpRoleRow">
                    <span className="lpRoleKey">{copy.roleName}</span>
                    <span className="lpRoleVal">{selectedUser.name}</span>
                  </div>
                  <div className="lpRoleRow">
                    <span className="lpRoleKey">{copy.roleType}</span>
                    <span className="lpRoleVal">{selectedUser.role}</span>
                  </div>
                  <div className="lpRoleRow">
                    <span className="lpRoleKey">{copy.roleScope}</span>
                  </div>
                  <div className="lpRoleText">{roleScopeText}</div>
                  <div className="lpRoleText">{copy.roleHelp}</div>
                </div>
              </div>

              <form onSubmit={handleLoginSubmit}>
                <div className="lpFormGroup">
                  <label>{copy.selectUser}</label>
                  <select
                    value={selectedIndex}
                    onChange={(e) => {
                      setSelectedIndex(Number(e.target.value));
                      setErr("");
                    }}
                  >
                    {users.map((u, i) => (
                      <option key={u.name} value={i}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lpFormGroup">
                  <label>{copy.password}</label>
                  <div className="lpPwWrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (err) setErr("");
                      }}
                      placeholder={
                        lang === "FR" ? "Entrer le mot de passe" : "Enter password"
                      }
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="lpPwToggle"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? copy.hide : copy.show}
                    </button>
                  </div>
                </div>

                <div className="lpRemember">
                  <input
                    id="remember-login"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label htmlFor="remember-login">{copy.remember}</label>
                </div>

                <div className="lpMuted" style={{ marginTop: 10 }}>
                  {copy.loginHelp}
                </div>

                {err && <div className="lpError" style={{ marginTop: 12 }}>{err}</div>}

                <div className="lpAuthActionsBar">
                  <button className="lpButton" type="submit">
                    {copy.login}
                  </button>

                  <button type="button" className="btn ghost">
                    {copy.forgot}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <section className="lpLoginOverview">
            <div className="card lpOverviewCard">
              <div className="lpOverviewHead">
                <div>
                  <div className="lpOverviewTitle">{copy.overviewTitle}</div>
                  <div className="lpMuted">{copy.overviewSub}</div>
                </div>
                <div className="lpOverviewTotal">
                  <div className="lpMuted" style={{ fontWeight: 800 }}>
                    {copy.total}
                  </div>
                  <div className="lpOverviewNum">{overview.total}</div>
                </div>
              </div>

              <div className="lpKpiRow">
                <div className="lpKpi">
                  <div className="lpKpiLabel">{copy.openTickets}</div>
                  <div className="lpKpiValue">{overview.openCount}</div>
                </div>
                <div className="lpKpi">
                  <div className="lpKpiLabel">{copy.escalated}</div>
                  <div className="lpKpiValue">{overview.escalatedCount}</div>
                </div>
                <div className="lpKpi">
                  <div className="lpKpiLabel">{copy.avgHandling}</div>
                  <div className="lpKpiValue">{copy.planned}</div>
                  <div className="lpKpiSub">{copy.avgHandlingSub}</div>
                </div>
              </div>

              <div className="lpOverviewGrid">
                <div className="lpOverviewChart">
                  <div className="lpNoteCard" style={{ height: "100%" }}>
                    <div className="lpNoteLabel" style={{ marginBottom: 12 }}>
                      {copy.workflowSnapshot}
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {overview.workflow.map((item) => (
                        <div key={item.label}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              fontSize: 13,
                              fontWeight: 800,
                              marginBottom: 6,
                            }}
                          >
                            <span>{item.label.replaceAll("_", " ")}</span>
                            <span>{item.value}</span>
                          </div>

                          <div
                            style={{
                              height: 10,
                              borderRadius: 999,
                              background: "rgba(148,163,184,0.18)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${overview.total ? (item.value / overview.total) * 100 : 0}%`,
                                borderRadius: 999,
                                background: "linear-gradient(90deg, #7c3aed, #60a5fa)",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="lpMuted" style={{ lineHeight: 1.6, marginTop: 16 }}>
                      {copy.note1}
                    </div>
                    <div className="lpMuted" style={{ lineHeight: 1.6, marginTop: 10 }}>
                      {copy.note2}
                    </div>
                  </div>
                </div>

                <div className="lpOverviewNotes">
                  <div className="lpNotesStack">
                    <div className="lpNoteCard">
                      <div className="lpNoteLabel">{copy.recentActivity}</div>
                      {overview.recentTickets.map((t) => (
                        <div
                          key={t.ticketNumber}
                          className="lpMiniRow"
                          style={{ alignItems: "flex-start", padding: "6px 0" }}
                        >
                          <div style={{ display: "grid", gap: 2 }}>
                            <span className="lpMiniKey" style={{ fontWeight: 800 }}>
                              {t.ticketNumber}
                            </span>
                            <span className="lpMuted" style={{ fontSize: 12 }}>
                              {t.category} • {t.department}
                            </span>
                          </div>
                          <span className="lpMiniVal">
                            {t.status.replaceAll("_", " ")}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="lpOverviewSideCardsRow" aria-label="Top breakdowns">
                      <div className="lpNoteCard">
                        <div className="lpNoteLabel">{copy.topCategories}</div>
                        {overview.topCategories.map(([k, v]) => (
                          <div key={k} className="lpMiniRow">
                            <span className="lpMiniKey">{k}</span>
                            <span className="lpMiniVal">{v}</span>
                          </div>
                        ))}
                      </div>

                      <div className="lpNoteCard">
                        <div className="lpNoteLabel">{copy.topDepartments}</div>
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
              <div className="lpMuted">{copy.footerAbout}</div>
            </div>
            <div>
              <div className="lpFooterTitle">{copy.footerHelp}</div>
              <div className="lpMuted">{copy.footerHelpLine1}</div>
              <div className="lpMuted">{copy.footerHelpLine2}</div>
            </div>
            <div>
              <div className="lpFooterTitle">{copy.footerLegal}</div>
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