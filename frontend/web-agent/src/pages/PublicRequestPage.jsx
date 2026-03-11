import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import heroCity from "../assets/toronto-panorama.png";
import logo from "../assets/insight311-logo.png";

import PublicFooter from "../components/PublicFooter";
import Floating311Button from "../components/Floating311Button";
import { useToast } from "../components/Toast";

import {
  initTicketSequence,
  consumeNextTicketNumber,
} from "../utils/ticketNumber";
import { getTickets, setTickets } from "../utils/ticketStore";
import { inferDepartmentFromCategory } from "../utils/categoryRouting";

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

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("insight311_lang");
    if (saved) setLang(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
  }, [lang]);

  useEffect(() => {
    document.body.classList.toggle("a11y-large-text", a11yLargeText);
  }, [a11yLargeText]);

  useEffect(() => {
    document.body.classList.toggle("a11y-high-contrast", a11yHighContrast);
  }, [a11yHighContrast]);

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
          subtitle:
            "Fournissez les détails essentiels afin que la demande soit dirigée vers la bonne équipe municipale.",
          back: "Retour",
          home: "Accueil",
          track: "Suivre une demande",
          operator: "Portail opérateur",
          formTitle: "Détails de la demande",
          formSub:
            "Veuillez remplir les champs ci-dessous. Une fois soumise, votre demande recevra un numéro de billet.",
          submit: "Soumettre la demande",
          whatNext: "Prochaines étapes",
          step1t: "Réception de la demande",
          step1b: "Votre demande est enregistrée dans le système municipal.",
          step2t: "Examen par l’équipe",
          step2b:
            "L’équipe interne examine les détails et assigne le bon service.",
          step3t: "Mises à jour du statut",
          step3b:
            "Vous pouvez suivre le statut à l’aide du numéro de billet ou du téléphone.",
          name: "Nom",
          phone: "Téléphone",
          description: "Description",
          selectedService: "Service sélectionné",
          category: "Catégorie",
          routedDepartment: "Service destinataire suggéré",
          noDepartment: "À confirmer lors de l’examen",
          infoStrip:
            "Votre demande sera acheminée vers l’équipe municipale appropriée après examen.",
          summaryTitle: "Résumé avant soumission",
          summaryLine1:
            "Les demandes incomplètes peuvent nécessiter un examen supplémentaire.",
          summaryLine2:
            "Assurez-vous que la description explique clairement le problème et l’emplacement si possible.",
          namePlaceholder: "Entrez votre nom",
          phonePlaceholder: "Entrez votre numéro de téléphone",
          descriptionPlaceholder: "Décrivez le problème",
          submittedTitle: "Soumis",
          submittedMsg: "Demande soumise. Votre numéro de billet est",
          required:
            "Veuillez remplir le nom, le téléphone et la description.",
          validationTitle: "Validation",
          kicker: "Soumission publique de demande",
          accessibility: "Accessibilité",
          accessibilityHelp:
            "Commandes de démonstration pour un portail municipal.",
          largeText: "Texte agrandi",
          highContrast: "Contraste élevé",
          reset: "Réinitialiser",
          done: "OK",
          language: "Langue",
          languageHelp: "Choisissez la langue du portail.",
          systemStatus: "État du système",
          operational: "Opérationnel",
          hours: "Heures",
          support: "Assistance",
          call311: "Parler à ISA",
          primaryNav: "Navigation principale",
          goHome: "Aller à l’accueil",
          languageOptions: "Options de langue",
          accessibilityOptions: "Options d’accessibilité",
          languageSelector: "Sélecteur de langue",
          systemStatusAria: "État du système",
          nameAria: "Nom complet",
          phoneAria: "Numéro de téléphone",
          descriptionAria: "Description du problème",
          helpTitle: "Besoin d’aide ?",
          helpText:
            "Appelez le 311 pour les demandes non urgentes. Pour une urgence, appelez le 911.",
          requestTips: "Conseils pour une soumission plus rapide",
          tip1: "Décrivez clairement le problème en quelques phrases.",
          tip2: "Indiquez le lieu ou le secteur concerné dans la description.",
          tip3: "Utilisez un numéro de téléphone valide pour le suivi.",
          footerHeroTag: "Portail de services municipaux",
        }
      : {
          title: "Submit a 311 Service Request",
          subtitle:
            "Provide the key details so your request can be routed to the right municipal team.",
          back: "Back",
          home: "Home",
          track: "Track Request",
          operator: "Operator Portal",
          formTitle: "Request Details",
          formSub:
            "Please complete the fields below. Once submitted, your request will receive a ticket number.",
          submit: "Submit Request",
          whatNext: "What Happens Next",
          step1t: "Request Received",
          step1b: "Your request is recorded in the municipal system.",
          step2t: "Team Review",
          step2b:
            "The internal team reviews the details and assigns the right service.",
          step3t: "Status Updates",
          step3b:
            "You can track progress using your ticket number or phone.",
          name: "Name",
          phone: "Phone",
          description: "Description",
          selectedService: "Selected Service",
          category: "Category",
          routedDepartment: "Suggested Department Route",
          noDepartment: "To be confirmed during review",
          infoStrip:
            "Your request will be routed to the appropriate municipal team after review.",
          summaryTitle: "Submission summary",
          summaryLine1:
            "Incomplete requests may need additional review before routing.",
          summaryLine2:
            "Make sure your description clearly explains the issue and location when possible.",
          namePlaceholder: "Enter your name",
          phonePlaceholder: "Enter your phone number",
          descriptionPlaceholder: "Describe the issue",
          submittedTitle: "Submitted",
          submittedMsg: "Request submitted. Your ticket number is",
          required: "Please fill in name, phone, and description.",
          validationTitle: "Validation",
          kicker: "Public Request Submission",
          accessibility: "Accessibility",
          accessibilityHelp: "Demo controls for a municipal portal.",
          largeText: "Large text",
          highContrast: "High contrast",
          reset: "Reset",
          done: "Done",
          language: "Language",
          languageHelp: "Choose the portal language.",
          systemStatus: "System Status",
          operational: "Operational",
          hours: "Hours",
          support: "Support",
          call311: "Talk to ISA",
          primaryNav: "Primary navigation",
          goHome: "Go to home",
          languageOptions: "Language options",
          accessibilityOptions: "Accessibility options",
          languageSelector: "Language selector",
          systemStatusAria: "System status",
          nameAria: "Full name",
          phoneAria: "Phone number",
          descriptionAria: "Issue description",
          helpTitle: "Need help?",
          helpText:
            "Call 311 for non-emergency requests. For emergencies, call 911.",
          requestTips: "Tips for faster intake",
          tip1: "Describe the issue clearly in a few sentences.",
          tip2: "Include the location or area in the description when possible.",
          tip3: "Use a valid phone number for follow-up.",
          footerHeroTag: "Municipal Service Portal",
        };

  const initialCategory = useMemo(() => {
    const raw = location?.state?.prefillCategory;
    if (!raw) return "";
    const map = {
      "Parking complaint": "Parking",
      "Sidewalk snow clearing": "Snow clearing",
    };
    return map[raw] || raw;
  }, [location]);

  const routedDepartment = useMemo(() => {
    if (!initialCategory) return "";
    return inferDepartmentFromCategory(initialCategory) || "";
  }, [initialCategory]);

  const storePublicRequest = (record) => {
    const key = "insight311_public_requests";
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify([record, ...current]));

    const ticketStoreCurrent = getTickets() || [];
    const exists = ticketStoreCurrent.some(
      (t) => String(t.ticketNumber) === String(record.ticketNumber)
    );

    if (!exists) {
      setTickets([
        {
          ...record,
          assignedDepartment: record.department || null,
          createdByType: "CITIZEN",
          createdByName: record.name || "Citizen",
          createdByRole: "CITIZEN",
          handledByType: "CITIZEN",
          handledByName: record.name || "Citizen",
          handledByRole: "CITIZEN",
          sessionHistory: [],
        },
        ...ticketStoreCurrent,
      ]);
    }
  };

  function submitRequest(e) {
    e.preventDefault();

    if (!name.trim() || !phone.trim() || !description.trim()) {
      toast.error(copy.required, { title: copy.validationTitle });
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    const ticketNumber = consumeNextTicketNumber();
    const createdAt = new Date().toISOString();

    const record = {
      ticketNumber,
      createdAt,
      status: "NEW",
      priority: "MEDIUM",
      confidence: "LOW",

      name: name.trim(),
      phone: normalizedPhone,
      email: "",

      category: initialCategory || "General Inquiry",
      department: routedDepartment || null,
      assignedDepartment: routedDepartment || null,

      location: "",
      description: description.trim(),

      source: "PUBLIC_PORTAL",
      channel: "Web",

      tone: "UNKNOWN",
      toneConfidence: "LOW",
      toneSource: "HUMAN",
    };

    storePublicRequest(record);

    toast.success(`${copy.submittedMsg} ${ticketNumber}.`, {
      title: copy.submittedTitle,
    });

    setName("");
    setPhone("");
    setDescription("");

    setTimeout(() => {
      nav("/lookup", {
        state: {
          ticketNumber,
          phone: normalizedPhone,
        },
      });
    }, 1400);
  }

  return (
    <div className="lpShell">
      <header className="lpTopbar">
        <div className="lpTopbarInner">
          <div
            className="lpBrand"
            onClick={() => nav("/")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && nav("/")}
            aria-label={copy.goHome}
          >
            <img className="lpLogo" src={logo} alt="INSIGHT-311 logo" />
            <div className="lpBrandText">
              <div className="lpBrandTitle">INSIGHT-311</div>
              <div className="lpBrandTag">{copy.footerHeroTag}</div>
            </div>
          </div>

          <nav className="lpNav" aria-label={copy.primaryNav}>
            <button
              className="lpNavLink"
              onClick={() => nav("/")}
              aria-label={copy.home}
            >
              {copy.home}
            </button>
            <button
              className="lpNavLink"
              onClick={() => nav("/lookup")}
              aria-label={copy.track}
            >
              {copy.track}
            </button>
            <button
              className="lpNavLink"
              onClick={() => nav("/login")}
              aria-label={copy.operator}
            >
              {copy.operator}
            </button>
          </nav>

          <div className="lpTopActions lpTopActionsRight" ref={actionsRef}>
            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label={copy.accessibilityOptions}
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
                aria-label={copy.languageOptions}
                onClick={() => {
                  setLangOpen((v) => !v);
                  setA11yOpen(false);
                }}
              >
                {lang}
              </button>

              {langOpen && (
                <div className="lpPopover" role="dialog" aria-label={copy.languageSelector}>
                  <div className="lpPopoverTitle">{copy.language}</div>
                  <div className="lpMuted">{copy.languageHelp}</div>
                  <div className="lpLangList">
                    <button
                      className={`lpLangItem ${lang === "EN" ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setLang("EN");
                        setLangOpen(false);
                      }}
                    >
                      English (EN)
                    </button>
                    <button
                      className={`lpLangItem ${lang === "FR" ? "active" : ""}`}
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

      <section
        className="lpHero lpHeroImageOnly"
        style={{ backgroundImage: `url(${heroCity})` }}
      >
        <div className="lpHeroFade" aria-hidden="true" />

        <div className="lpHeroStatusFloat" aria-label={copy.systemStatusAria}>
          <div className="lpHeroCard">
            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{copy.systemStatus}</div>
              <div className="lpMiniStatValue">
                <span className="lpDot" /> {copy.operational}
              </div>
            </div>

            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{copy.hours}</div>
              <div className="lpMiniStatValue">24/7</div>
            </div>

            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{copy.support}</div>
              <div className="lpMiniStatValue">{copy.call311}</div>
            </div>
          </div>
        </div>

        <div className="lpHeroInner">
          <div className="lpHeroLeft lpHeroLeftShift">
            <div className="lpHeroKicker">{copy.kicker}</div>
            <h1 className="lpHeroTitle">{copy.title}</h1>
            <div className="lpHeroSub">{copy.subtitle}</div>
          </div>
        </div>
      </section>

      <main className="lpMain lpShellMain">
        <div className="lpMainInner lpWider">
          <div className="lpPageBackRow">
            <button className="lpBackBtn" type="button" onClick={() => nav(-1)}>
              ← {copy.back}
            </button>
            <button className="lpBackBtn" type="button" onClick={() => nav("/")}>
              {copy.home}
            </button>
          </div>

          {(initialCategory || routedDepartment) && (
            <div className="lpInfo" style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                {copy.selectedService}
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>{copy.category}:</strong>{" "}
                {initialCategory || "General Inquiry"}
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>{copy.routedDepartment}:</strong>{" "}
                {routedDepartment || copy.noDepartment}
              </div>
              <div>{copy.infoStrip}</div>
            </div>
          )}

          <div className="lpGrid">
            <div className="lpCard">
              <div className="lpCardTitle">{copy.formTitle}</div>
              <div className="lpCardSub">{copy.formSub}</div>

              <div className="lpNotice" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  {copy.summaryTitle}
                </div>
                <div className="lpMuted" style={{ marginBottom: 8 }}>
                  {copy.summaryLine1}
                </div>
                <div className="lpMuted">{copy.summaryLine2}</div>
              </div>

              <form onSubmit={submitRequest} style={{ marginTop: 16 }}>
                <div className="lpFormGroup">
                  <label htmlFor="public-name">{copy.name}</label>
                  <input
                    id="public-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={copy.namePlaceholder}
                    aria-label={copy.nameAria}
                  />
                </div>

                <div className="lpFormGroup">
                  <label htmlFor="public-phone">{copy.phone}</label>
                  <input
                    id="public-phone"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={copy.phonePlaceholder}
                    aria-label={copy.phoneAria}
                  />
                </div>

                <div className="lpFormGroup">
                  <label htmlFor="public-description">{copy.description}</label>
                  <textarea
                    id="public-description"
                    rows="5"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={copy.descriptionPlaceholder}
                    aria-label={copy.descriptionAria}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <button type="submit" className="lpButton">
                    {copy.submit}
                  </button>
                  <button
                    type="button"
                    className="lpButtonSecondary"
                    onClick={() => nav("/")}
                  >
                    {copy.home}
                  </button>
                </div>
              </form>
            </div>

            <div className="lpCard">
              <div className="lpCardTitle">{copy.whatNext}</div>

              <div className="lpSteps" style={{ marginTop: 12 }}>
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

              <div className="lpNotice" style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  {copy.requestTips}
                </div>
                <ul className="lpAuthList" style={{ paddingLeft: 18 }}>
                  <li>{copy.tip1}</li>
                  <li>{copy.tip2}</li>
                  <li>{copy.tip3}</li>
                </ul>
              </div>

              <div className="lpNotice" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  {copy.helpTitle}
                </div>
                <div className="lpMuted">{copy.helpText}</div>
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