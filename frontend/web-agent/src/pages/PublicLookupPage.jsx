// src/pages/PublicLookupPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/insight311-logo.png";
import PublicFooter from "../components/PublicFooter";

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

function phoneDigits(raw = "") {
  return String(raw).replace(/\D/g, "");
}

function isValidTicketNumber(input = "") {
  // Format: 311-2026-001234 (year 4 digits, last segment 4–8 digits)
  return /^311-\d{4}-\d{4,8}$/i.test(String(input).trim());
}

export default function PublicLookupPage() {
  const nav = useNavigate();
  const actionsRef = useRef(null);

  // Language + A11y
  const [lang, setLang] = useState(
    localStorage.getItem("insight311_lang") || "EN"
  );
  const [a11yOpen, setA11yOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  // Lookup form state
  const [filterType, setFilterType] = useState("ticketNumber");
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Persist language across public pages
  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
  }, [lang]);

  // Accessibility toggles (CSS-driven)
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

  const t = (en, fr) => (lang === "FR" ? fr : en);

  const copy = useMemo(() => {
    return {
      pageTitle: t("Track My 311 Request", "Suivre ma demande 311"),
      pageSub: t(
        "Search by ticket number or phone number to view updates.",
        "Recherchez par numéro de billet ou numéro de téléphone pour voir les mises à jour."
      ),
      privacy: t(
        "Public access: status only. Personal details are hidden in this prototype.",
        "Accès public : statut uniquement. Les détails personnels sont masqués dans ce prototype."
      ),

      cardTitle: t("Track a Request", "Suivre une demande"),
      cardSub: t(
        "Search by ticket number or phone number.",
        "Recherchez par numéro de billet ou téléphone."
      ),

      searchBy: t("Search by", "Rechercher par"),
      ticket: t("Ticket Number", "Numéro de billet"),
      phone: t("Phone Number", "Numéro de téléphone"),
      placeholderTicket: t("e.g., 311-2026-001234", "ex : 311-2026-001234"),
      placeholderPhone: t("e.g., (647) 555-0111", "ex : (647) 555-0111"),

      search: t("Search", "Rechercher"),
      clear: t("Clear", "Effacer"),
      hint: t(
        "Enter details and click Search to retrieve ticket status.",
        "Entrez les informations et cliquez sur Rechercher pour voir le statut."
      ),

      results: t("Results", "Résultats"),
      none: t(
        "No tickets found for this search.",
        "Aucun billet trouvé pour cette recherche."
      ),

      help: t("Need help?", "Besoin d’aide?"),
      help1t: t("Use your ticket number", "Utilisez votre numéro de billet"),
      help1d: t(
        "You receive it after submitting a request.",
        "Vous le recevez après avoir soumis une demande."
      ),
      help2t: t("Or search by phone", "Ou recherchez par téléphone"),
      help2d: t(
        "Use the same phone you submitted with.",
        "Utilisez le même numéro que lors de la soumission."
      ),

      back: t("Back", "Retour"),
      accessibility: t("Accessibility", "Accessibilité"),
      language: t("Language", "Langue"),
      done: t("Done", "OK"),
      reset: t("Reset", "Réinitialiser"),
      demoA11y: t(
        "Demo controls for a municipal portal.",
        "Commandes de démonstration pour un portail municipal."
      ),
      largeText: t("Large text", "Texte agrandi"),
      highContrast: t("High contrast", "Contraste élevé"),
      phoneLabel: t("Phone", "Téléphone"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const readPublicRequests = () => {
    const key = "insight311_public_requests";
    return JSON.parse(localStorage.getItem(key) || "[]");
  };

  const results = useMemo(() => {
    if (!submitted) return [];
    const raw = keyword.trim();
    if (!raw) return [];

    const all = readPublicRequests();

    if (filterType === "ticketNumber") {
      const k = raw.toLowerCase();
      return all.filter((r) =>
        String(r.ticketNumber || "").toLowerCase().includes(k)
      );
    }

    const k = phoneDigits(raw);
    return all.filter((r) => phoneDigits(r.phone || "").includes(k));
  }, [submitted, keyword, filterType]);

  const validate = () => {
    const raw = keyword.trim();
    if (!raw)
      return t(
        "Please enter a value to search.",
        "Veuillez entrer une valeur à rechercher."
      );

    if (filterType === "ticketNumber") {
      if (!isValidTicketNumber(raw)) {
        return t(
          "Ticket number format should look like 311-2026-001234.",
          "Le format doit ressembler à 311-2026-001234."
        );
      }
    }

    if (filterType === "phone") {
      const digits = phoneDigits(raw);
      if (digits.length < 10)
        return t(
          "Phone number must include at least 10 digits.",
          "Le numéro doit contenir au moins 10 chiffres."
        );
      if (digits.length > 15)
        return t(
          "Phone number looks too long. Please re-check.",
          "Le numéro semble trop long. Veuillez vérifier."
        );
    }

    return "";
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setSubmitted(false);
    setErrorMsg("");

    const v = validate();
    if (v) {
      setErrorMsg(v);
      return;
    }

    setSubmitted(true);
  };

  const onClear = () => {
    setKeyword("");
    setSubmitted(false);
    setErrorMsg("");
  };

  return (
    <div className="lpShell">
      {/* Top navigation */}
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

          {/* Center title */}
          <div className="lpHeaderCenter">{copy.cardTitle}</div>

          {/* Actions (right): Back + Accessibility + EN/FR */}
          <div className="lpTopActions lpTopActionsRight" ref={actionsRef}>
            <button
              className="lpPill"
              type="button"
              onClick={() => (window.history.length > 1 ? nav(-1) : nav("/"))}
              aria-label="Back"
            >
              {copy.back}
            </button>

            {/* Accessibility */}
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
                {copy.accessibility}
              </button>

              {a11yOpen && (
                <div
                  className="lpPopover"
                  role="dialog"
                  aria-label={copy.accessibility}
                >
                  <div className="lpPopoverTitle">{copy.accessibility}</div>
                  <div className="lpMuted">{copy.demoA11y}</div>

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

                  <div className="lpPopoverFooter lpPopoverFooterSplit">
                    <button
                      className="btn"
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

            {/* Language */}
            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label="Language"
                onClick={() => {
                  setLangOpen((v) => !v);
                  setA11yOpen(false);
                }}
              >
                {lang}
              </button>

              {langOpen && (
                <div
                  className="lpPopover"
                  role="dialog"
                  aria-label={copy.language}
                >
                  <div className="lpPopoverTitle">{copy.language}</div>
                  <div className="lpPopoverBody">
                    <button
                      className={`lpLangBtn ${lang === "EN" ? "active" : ""}`}
                      type="button"
                      onClick={() => setLang("EN")}
                    >
                      English (EN)
                    </button>
                    <button
                      className={`lpLangBtn ${lang === "FR" ? "active" : ""}`}
                      type="button"
                      onClick={() => setLang("FR")}
                    >
                      Français (FR)
                    </button>
                  </div>

                  <div className="lpPopoverFooter">
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => setLangOpen(false)}
                    >
                      {copy.done}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="lpMain">
        <div className="lpMainInner">
          {/* Card 1 — Intro */}
          <section className="plLookupIntro" aria-label="Lookup intro">
            <div className="plLookupH1">{copy.pageTitle}</div>
            <div className="plLookupSub">{copy.pageSub}</div>
            <div className="plLookupNote">{copy.privacy}</div>
          </section>

          {/* ✅ Two-card grid (Track + Help) */}
          <div className="plTwoCardGrid">
            {/* Card 2 — Track a Request (Form + Results) */}
            <div className="lpCard plCard">
              <div className="plCardHeader">
                <div className="plCardTitleRow">{copy.cardTitle}</div>
                <div className="plCardSubRow">{copy.cardSub}</div>
              </div>

              <form onSubmit={onSubmit}>
                <div className="plLookupGrid">
                  <div className="plField">
                    <label>{copy.searchBy}</label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="ticketNumber">{copy.ticket}</option>
                      <option value="phone">{copy.phone}</option>
                    </select>
                  </div>

                  <div className="plField">
                    <label>
                      {filterType === "ticketNumber" ? copy.ticket : copy.phone}
                    </label>
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder={
                        filterType === "ticketNumber"
                          ? copy.placeholderTicket
                          : copy.placeholderPhone
                      }
                      aria-invalid={!!errorMsg}
                    />

                    {errorMsg && (
                      <div className="plError" role="alert">
                        {errorMsg}
                      </div>
                    )}
                  </div>
                </div>

                <div className="plActions">
                  <button className="btn primary" type="submit">
                    {copy.search}
                  </button>
                  <button className="btn" type="button" onClick={onClear}>
                    {copy.clear}
                  </button>
                </div>
              </form>

              <div className="plHint">{!submitted ? copy.hint : ""}</div>

              <div className="plResults">
                {submitted && (
                  <>
                    {results.length ? (
                      <>
                        <div className="plResultsTitle">
                          {copy.results} ({results.length})
                        </div>

                        <div className="plResultsList">
                          {results.map((r) => (
                            <div key={r.ticketNumber} className="plResultCard">
                              <div className="plResultTop">
                                <div className="plTicket">{r.ticketNumber}</div>
                                <div className="plStatus">
                                  {String(r.status || "").toUpperCase()}
                                </div>
                              </div>

                              <div className="plMeta">
                                <span>{r.department}</span>
                                <span className="lpFooterDot">•</span>
                                <span>{r.category}</span>
                              </div>

                              <div className="plDesc">{r.description}</div>

                              <div className="plSmall">
                                {copy.phoneLabel}: {normalizePhone(r.phone)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="lpMuted" style={{ marginTop: 12 }}>
                        {copy.none}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Card 3 — Need help */}
            <div className="lpCard plCard plHelpCard">
              <div className="plCardHeader">
                <div className="plCardTitleRow">{copy.help}</div>
                <div className="plCardSubRow">
                  {t(
                    "Common ways to find your request.",
                    "Façons courantes de retrouver votre demande."
                  )}
                </div>
              </div>

              <div className="lpSteps">
                <div className="lpStep">
                  <div className="lpStepNum">1</div>
                  <div>
                    <div className="lpStepTitle">{copy.help1t}</div>
                    <div className="lpMuted">{copy.help1d}</div>
                  </div>
                </div>

                <div className="lpStep">
                  <div className="lpStepNum">2</div>
                  <div>
                    <div className="lpStepTitle">{copy.help2t}</div>
                    <div className="lpMuted">{copy.help2d}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter showNav={true} active="lookup" />
    </div>
  );
}