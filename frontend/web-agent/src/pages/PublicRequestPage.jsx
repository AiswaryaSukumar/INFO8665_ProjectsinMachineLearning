import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import heroCity from "../assets/toronto-panorama.png";
import logo from "../assets/insight311-logo.png";

import PublicFooter from "../components/PublicFooter";
import Floating311Button from "../components/Floating311Button";

import TicketForm from "../components/TicketForm";
import { useToast } from "../components/Toast";

import { initTicketSequence, consumeNextTicketNumber } from "../utils/ticketNumber";

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export default function PublicRequestPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const actionsRef = useRef(null);

  const [lang, setLang] = useState("EN");
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const [a11yOpen, setA11yOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // Persist language across public pages (same as HOME)
  useEffect(() => {
    const saved = localStorage.getItem("insight311_lang");
    if (saved) setLang(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
  }, [lang]);

  // Accessibility toggles (CSS-driven) — reuse HOME behavior
  useEffect(() => {
    document.body.classList.toggle("a11y-large-text", a11yLargeText);
  }, [a11yLargeText]);

  useEffect(() => {
    document.body.classList.toggle("a11y-high-contrast", a11yHighContrast);
  }, [a11yHighContrast]);

  // Close popovers on outside click
  useEffect(() => {
    function onDown(e) {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target)) {
        setA11yOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    initTicketSequence();
  }, []);

  const copy =
    lang === "FR"
      ? {
          title: "Soumettre une demande de service 311",
          subtitle: "Fournissez les détails du problème et l'emplacement.",
          back: "Retour",
          formTitle: "Détails de la demande",
          formSub: "Les champs marqués * sont requis.",
          submit: "Soumettre",
          home: "Accueil",
          track: "Suivre une demande",
          operator: "Portail opérateur",
          whatNext: "Prochaines étapes",
          step1t: "Prise en charge et catégorisation IA",
          step1b:
            "L’IA extrait la catégorie et propose des options d’acheminement vers le bon service.",
          step2t: "Révision et approbation",
          step2b:
            "Le superviseur vérifie les cas à faible confiance avant l’assignation.",
          step3t: "Ordre de travail et mises à jour",
          step3b:
            "Les mises à jour sont visibles via le numéro de billet ou le téléphone.",
        }
      : {
          title: "Submit a 311 Service Request",
          subtitle: "Provide issue details and location.",
          back: "Back",
          formTitle: "Request Details",
          formSub: "Fields marked * are required.",
          submit: "Submit Request",
          home: "Home",
          track: "Track Request",
          operator: "Operator Portal",
          whatNext: "What Happens Next",
          step1t: "AI Intake & Categorization",
          step1b: "AI extracts category + department routing candidates.",
          step2t: "Review & Approval",
          step2b: "Supervisor reviews low-confidence cases before dispatch.",
          step3t: "Work Order & Updates",
          step3b: "Status updates are visible using ticket number or phone.",
        };

  // Prefill category from Popular Services → Start request
  const initialCategory = useMemo(() => {
    const raw = location?.state?.prefillCategory;
    if (!raw) return "";
    // Normalize older labels to current form options
    const map = {
      "Parking complaint": "Parking",
      "Sidewalk snow clearing": "Snow clearing",
    };
    return map[raw] || raw;
  }, [location]);

  const storePublicRequest = (record) => {
    const key = "insight311_public_requests";
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify([record, ...current]));
  };

  const submitCitizen = (payload) => {
    const ticketNumber = consumeNextTicketNumber();
    const createdAt = new Date().toISOString();

    const record = {
      ticketNumber,
      createdAt,
      status: "NEW",

      priority: String(payload.priority || "Medium").toUpperCase(),
      confidence: "LOW",

      name: payload.fullName.trim(),
      phone: normalizePhone(payload.phone),
      email: (payload.email || "").trim(),

      category: payload.category,
      department: payload.assignedDepartment,

      location: payload.location.trim(),
      description: payload.description.trim(),

      source: "PUBLIC_PORTAL",
      channel: payload.channel || "Web",
    };

    storePublicRequest(record);

    toast.success(`Request submitted. Your ticket number is ${ticketNumber}.`, {
      title: "Submitted",
    });

    setTimeout(() => nav("/lookup"), 600);
  };

  return (
    <div className="lpShell">
      {/* Top navigation (match HOME header) */}
      <header className="lpTopbar">
        <div className="lpTopbarInner">
          {/* Brand (left) */}
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
              <div className="lpBrandTag">Municipal Service Portal</div>
            </div>
          </div>

          {/* Primary nav (center) */}
          <nav className="lpNav" aria-label="Primary">
            <button className="lpNavLink active" onClick={() => nav("/")} aria-label="Home">
              {copy.home}
            </button>
            <button className="lpNavLink" onClick={() => nav("/lookup")} aria-label="Track request">
              {copy.track}
            </button>
            <button
              className="lpNavLink"
              onClick={() => nav("/login")}
              aria-label="Open operator portal"
            >
              {copy.operator}
            </button>
          </nav>

          {/* Actions (right): Accessibility + EN/FR */}
          <div className="lpTopActions lpTopActionsRight" ref={actionsRef}>
            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label="Accessibility options"
                onClick={() => {
                  setA11yOpen((v) => !v);
                  setLangOpen(false);
                }}
              >
                {lang === "FR" ? "Accessibilité" : "Accessibility"}
              </button>

              {a11yOpen && (
                <div
                  className="lpPopover"
                  role="dialog"
                  aria-label={lang === "FR" ? "Accessibilité" : "Accessibility"}
                >
                  <div className="lpPopoverTitle">
                    {lang === "FR" ? "Accessibilité" : "Accessibility"}
                  </div>
                  <div className="lpMuted">
                    {lang === "FR"
                      ? "Commandes de démonstration pour un portail municipal."
                      : "Demo controls for a municipal portal."}
                  </div>

                  <div className="lpPopoverBody">
                    <label className="lpSwitchRow">
                      <span>{lang === "FR" ? "Texte agrandi" : "Large text"}</span>
                      <input
                        type="checkbox"
                        checked={a11yLargeText}
                        onChange={(e) => setA11yLargeText(e.target.checked)}
                      />
                    </label>

                    <label className="lpSwitchRow">
                      <span>{lang === "FR" ? "Contraste élevé" : "High contrast"}</span>
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
                      onClick={() => {
                        setA11yLargeText(false);
                        setA11yHighContrast(false);
                      }}
                    >
                      {lang === "FR" ? "Réinitialiser" : "Reset"}
                    </button>
                    <button className="btn primary" onClick={() => setA11yOpen(false)}>
                      {lang === "FR" ? "OK" : "Done"}
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
                <div className="lpPopover" role="dialog" aria-label="Language selector">
                  <div className="lpPopoverTitle">{lang === "FR" ? "Langue" : "Language"}</div>
                  <div className="lpLangList">
                    <button
                      className={`lpLangItem ${lang === "EN" ? "active" : ""}`}
                      onClick={() => {
                        setLang("EN");
                        setLangOpen(false);
                      }}
                    >
                      English (EN)
                    </button>
                    <button
                      className={`lpLangItem ${lang === "FR" ? "active" : ""}`}
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

      {/* Hero image + floating system status card (match HOME) */}
      <section className="lpHero lpHeroImageOnly" style={{ backgroundImage: `url(${heroCity})` }}>
        <div className="lpHeroFade" aria-hidden="true" />

        {/* Float the status card on the hero image */}
        <div className="lpHeroStatusFloat" aria-label="System status">
          <div className="lpHeroCard">
            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">
                {lang === "FR" ? "État du système" : "System Status"}
              </div>
              <div className="lpMiniStatValue">
                <span className="lpDot" /> {lang === "FR" ? "Opérationnel" : "Operational"}
              </div>
            </div>

            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{lang === "FR" ? "Heures" : "Hours"}</div>
              <div className="lpMiniStatValue">24/7</div>
            </div>

            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{lang === "FR" ? "Assistance" : "Support"}</div>
              <div className="lpMiniStatValue">
                {lang === "FR" ? "Parler au 311 IA" : "Talk to 311 AI"}
              </div>
            </div>
          </div>
        </div>

        {/* Page title copy (shifted right slightly) */}
        <div className="lpHeroInner">
          <div className="lpHeroLeft lpHeroLeftShift">
            <div className="lpHeroKicker">Public Request Submission</div>
            <h1 className="lpHeroTitle">{copy.title}</h1>
            <div className="lpHeroSub">{copy.subtitle}</div>
          </div>
        </div>
      </section>

      {/* Middle section: 2-column grid */}
      <main className="lpMain lpShellMain">
        <div className="lpMainInner lpWider">
          <div className="lpBackRow">
            <button className="lpBackBtn" onClick={() => nav(-1)}>
              ← {copy.back}
            </button>
            <button className="lpBackBtn" onClick={() => nav("/")}>
              {copy.home}
            </button>
          </div>

          <div className="lpGrid">
            {/* LEFT */}
            <div className="lpCard">
              <div className="lpCardTitle">{copy.formTitle}</div>
              <div className="lpCardSub">{copy.formSub}</div>

              <TicketForm
                variant="citizen"
                initialCategory={initialCategory}
                submitLabel={copy.submit}
                onSubmit={submitCitizen}
                onCancel={() => nav("/")}
              />
            </div>

            {/* RIGHT */}
            <div className="lpCard">
              <div className="lpCardTitle">{copy.whatNext}</div>
              <div className="lpSteps" style={{ marginTop: 10 }}>
                <div className="lpStep">
                  <div className="lpStepNum">1</div>
                  <div>
                    <div className="lpStepTitle">{copy.step1t}</div>
                    <div className="lpMuted">{copy.step1b}</div>
                  </div>
                </div>
                <div className="lpStep">
                  <div className="lpStepNum">2</div>
                  <div>
                    <div className="lpStepTitle">{copy.step2t}</div>
                    <div className="lpMuted">{copy.step2b}</div>
                  </div>
                </div>
                <div className="lpStep">
                  <div className="lpStepNum">3</div>
                  <div>
                    <div className="lpStepTitle">{copy.step3t}</div>
                    <div className="lpMuted">{copy.step3b}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter showNav={true} />
      <Floating311Button />
    </div>
  );
}