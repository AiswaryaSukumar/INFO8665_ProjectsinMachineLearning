import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import logo from "../assets/insight311-logo.png";
import PublicFooter from "../components/PublicFooter";
import { useToast } from "../components/Toast";
import { getTickets, updateTicketByNumber } from "../utils/ticketStore";

const PUBLIC_KEY = "insight311_public_requests";
const HISTORY_KEY = "insight311.status_history.v1";
const ESCALATION_KEY = "insight311.status_escalations.v1";

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
  return /^311-\d{4}-\d{4,8}$/i.test(String(input).trim());
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readPublicRequests() {
  return safeParse(localStorage.getItem(PUBLIC_KEY), []);
}

function writePublicRequests(next) {
  localStorage.setItem(PUBLIC_KEY, JSON.stringify(next));
}

function readHistoryMap() {
  return safeParse(localStorage.getItem(HISTORY_KEY), {});
}

function writeHistoryMap(next) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function readEscalationMap() {
  return safeParse(localStorage.getItem(ESCALATION_KEY), {});
}

function writeEscalationMap(next) {
  localStorage.setItem(ESCALATION_KEY, JSON.stringify(next));
}

function formatDateTime(value, lang) {
  if (!value) return lang === "FR" ? "Non disponible" : "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(lang === "FR" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatInternalStatus(value = "", lang = "EN") {
  const normalized = String(value).toUpperCase();

  if (lang === "FR") {
    if (normalized === "NEW") return "Nouvelle";
    if (normalized === "IN_PROGRESS") return "En cours";
    if (normalized === "NEEDS_REVIEW") return "En révision";
    if (normalized === "RESOLVED") return "Résolue";
  }

  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPublicStatusBadge(ticket, lang) {
  const status = String(ticket?.status || "NEW").toUpperCase();
  const routingStatus = String(ticket?.routingStatus || "").toUpperCase();

  if (status === "RESOLVED") {
    return lang === "FR" ? "Résolue" : "Resolved";
  }

  if (status === "IN_PROGRESS") {
    return lang === "FR" ? "En cours" : "In progress";
  }

  if (routingStatus === "PENDING_APPROVAL" || status === "NEEDS_REVIEW") {
    return lang === "FR" ? "En révision" : "Under review";
  }

  return lang === "FR" ? "Reçue" : "Received";
}

function makeCitizenStatus(ticket, lang) {
  const status = String(ticket?.status || "NEW").toUpperCase();
  const routingStatus = String(ticket?.routingStatus || "").toUpperCase();
  const dept =
    ticket?.assignedDepartment ||
    ticket?.department ||
    (lang === "FR" ? "service municipal" : "municipal department");

  if (status === "RESOLVED") {
    return {
      headline: lang === "FR" ? "Travaux terminés" : "Work completed",
      detail:
        lang === "FR"
          ? `Votre demande a été marquée comme résolue. Le ${dept} a terminé l’intervention ou fermé le dossier.`
          : `Your request has been marked resolved. ${dept} has completed the work or closed the case.`,
      step:
        lang === "FR"
          ? "Aucune autre action n’est requise pour le moment."
          : "No further action is needed right now.",
      tone: "resolved",
    };
  }

  if (status === "IN_PROGRESS") {
    return {
      headline: lang === "FR" ? "En cours de traitement" : "In progress",
      detail:
        lang === "FR"
          ? `Le ${dept} a reçu votre demande et travaille actuellement sur le suivi ou la planification.`
          : `${dept} has received your request and is actively working on follow-up or scheduling.`,
      step:
        lang === "FR"
          ? "Vous pouvez revenir plus tard pour voir la prochaine mise à jour."
          : "You can check back later for the next update.",
      tone: "progress",
    };
  }

  if (routingStatus === "PENDING_APPROVAL" || status === "NEEDS_REVIEW") {
    return {
      headline: lang === "FR" ? "En révision" : "Under review",
      detail:
        lang === "FR"
          ? "Votre demande est en cours de validation afin de confirmer la catégorie, la priorité ou le bon service responsable."
          : "Your request is being validated so the category, priority, or responsible department can be confirmed.",
      step:
        lang === "FR"
          ? "Une fois vérifiée, elle sera transmise au bon service municipal."
          : "Once verified, it will be routed to the right municipal department.",
      tone: "review",
    };
  }

  return {
    headline: lang === "FR" ? "Demande reçue" : "Request received",
    detail:
      lang === "FR"
        ? "Votre demande a été enregistrée dans le système et attend la prochaine étape de traitement."
        : "Your request has been logged in the system and is waiting for the next processing step.",
    step:
      lang === "FR"
        ? `Prochaine étape prévue : acheminement vers ${dept}.`
        : `Expected next step: routing to ${dept}.`,
    tone: "new",
  };
}

function buildHistory(ticket, historyMap, escalationMap, lang) {
  const ticketNumber = ticket?.ticketNumber;
  const items = [];

  if (ticket?.createdAt) {
    items.push({
      at: ticket.createdAt,
      type: "system",
      title: lang === "FR" ? "Demande soumise" : "Request submitted",
      detail:
        lang === "FR"
          ? "Le dossier a été créé et enregistré dans INSIGHT-311."
          : "The service request was created and logged in INSIGHT-311.",
    });
  }

  const citizenStatus = makeCitizenStatus(ticket, lang);
  items.push({
    at:
      ticket?.updatedAt ||
      ticket?.approvedAt ||
      ticket?.createdAt ||
      new Date().toISOString(),
    type: "status",
    title: citizenStatus.headline,
    detail: citizenStatus.detail,
  });

  (historyMap[ticketNumber] || []).forEach((entry) => {
    items.push({
      at: entry.at,
      type: entry.type || "note",
      title: entry.title,
      detail: entry.detail,
    });
  });

  if (escalationMap[ticketNumber]) {
    items.push({
      at: escalationMap[ticketNumber].at,
      type: "escalation",
      title: lang === "FR" ? "Suivi humain demandé" : "Human follow-up requested",
      detail:
        lang === "FR"
          ? "Votre demande a été signalée pour un suivi par un agent municipal."
          : "Your request has been flagged for follow-up by a municipal agent.",
    });
  }

  return items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

export default function PublicLookupPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const actionsRef = useRef(null);

  const [lang, setLang] = useState(
    localStorage.getItem("insight311_lang") || "EN"
  );
  const [a11yOpen, setA11yOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const [filterType, setFilterType] = useState("ticketNumber");
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedTicketNumber, setSelectedTicketNumber] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

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

  const t = (en, fr) => (lang === "FR" ? fr : en);

  const copy = useMemo(
    () => ({
      pageTitle: t("Track My 311 Request", "Suivre ma demande 311"),
      pageSub: t(
        "Search by ticket number or phone number to view updates.",
        "Recherchez par numéro de billet ou numéro de téléphone pour voir les mises à jour."
      ),
      privacy: t(
        "Public access: citizen-friendly status only. Personal details and internal notes remain hidden.",
        "Accès public : statut simplifié pour le citoyen uniquement. Les renseignements personnels et notes internes restent masqués."
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
      helpSub: t(
        "Common ways to find your request.",
        "Façons courantes de retrouver votre demande."
      ),
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
      selectPrompt: t(
        "Select a result to see a plain-language status update, history, and next steps.",
        "Sélectionnez un résultat pour voir un statut simplifié, l’historique et les prochaines étapes."
      ),
      statusCardTitle: t(
        "AI-assisted status visibility",
        "Visibilité du statut assistée par l’IA"
      ),
      internalLabel: t("Internal status", "Statut interne"),
      citizenLabel: t("Citizen update", "Mise à jour citoyenne"),
      nextStep: t("Next step", "Prochaine étape"),
      timeline: t("Communication history", "Historique des communications"),
      timelineMore: t(
        "More updates will appear here as your request progresses.",
        "D’autres mises à jour apparaîtront ici à mesure que votre demande progresse."
      ),
      addInfoTitle: t("Share more information", "Ajouter de l’information"),
      addInfoHint: t(
        "Optional: append extra details to this request for staff review.",
        "Optionnel : ajoutez des détails à cette demande pour examen par le personnel."
      ),
      addInfoPlaceholder: t(
        "Example: the issue is getting worse, or there is a better landmark.",
        "Exemple : le problème s’aggrave ou il y a un meilleur point de repère."
      ),
      appendInfo: t("Add to ticket", "Ajouter au billet"),
      requestHuman: t("Request human follow-up", "Demander un suivi humain"),
      requestLogged: t("Follow-up requested", "Suivi demandé"),
      loggedLabel: t(
        "Status summary and communication history",
        "Résumé du statut et historique des communications"
      ),
      privacyStrip: t(
        "AI shows clear public-friendly updates while sensitive internal notes remain private.",
        "L’IA affiche des mises à jour claires pour le public tout en gardant les notes internes sensibles privées."
      ),
      noteUsage: t(
        "Use this if your issue has changed or needs urgent clarification.",
        "Utilisez ceci si votre situation a changé ou nécessite une clarification urgente."
      ),
      goHomeAria: t("Go to home", "Aller à l’accueil"),
      lookupIntroAria: t("Lookup intro", "Introduction de recherche"),
      brandTag: t("Municipal Service Portal", "Portail de services municipaux"),
      noteSavedTitle: t("Information added", "Information ajoutée"),
      noteSavedMsg: t(
        "Your additional information was saved to the request history.",
        "Votre information supplémentaire a été enregistrée dans l’historique de la demande."
      ),
      escalationTitle: t("Follow-up requested", "Suivi demandé"),
      escalationMsg: t(
        "Your request has been flagged for human follow-up.",
        "Votre demande a été signalée pour un suivi humain."
      ),
      selectedTicket: t("Selected ticket", "Billet sélectionné"),
      selectedCategory: t("Category", "Catégorie"),
      selectedDepartment: t("Department", "Service"),
      selectedUpdated: t("Last updated", "Dernière mise à jour"),
      notAvailable: t("Not available", "Non disponible"),
    }),
    [lang]
  );

  useEffect(() => {
    const stateTicket = location.state?.ticketNumber;
    const statePhone = location.state?.phone;

    if (stateTicket) {
      setFilterType("ticketNumber");
      setKeyword(String(stateTicket));
      setSubmitted(true);
      setErrorMsg("");
      setRefreshTick((v) => v + 1);
      return;
    }

    if (statePhone) {
      setFilterType("phone");
      setKeyword(String(statePhone));
      setSubmitted(true);
      setErrorMsg("");
      setRefreshTick((v) => v + 1);
    }
  }, [location.state]);

  const results = useMemo(() => {
    if (!submitted) return [];
    const raw = keyword.trim();
    if (!raw) return [];

    const publicRequests = readPublicRequests().map((r) => ({
      ...r,
      sourceType: "public",
    }));
    const storeTickets = getTickets().map((r) => ({
      ...r,
      sourceType: "ticketStore",
    }));

    const merged = [...publicRequests, ...storeTickets].reduce((acc, item) => {
      const key = String(item.ticketNumber || "");
      if (!key) return acc;
      if (!acc.has(key)) acc.set(key, item);
      else acc.set(key, { ...acc.get(key), ...item });
      return acc;
    }, new Map());

    const all = Array.from(merged.values());

    if (filterType === "ticketNumber") {
      const k = raw.toLowerCase();
      return all.filter((r) =>
        String(r.ticketNumber || "").toLowerCase().includes(k)
      );
    }

    const k = phoneDigits(raw);
    return all.filter((r) => phoneDigits(r.phone || "").includes(k));
  }, [submitted, keyword, filterType, refreshTick]);

  const selectedTicket = useMemo(
    () =>
      results.find(
        (r) => String(r.ticketNumber) === String(selectedTicketNumber)
      ) ||
      results[0] ||
      null,
    [results, selectedTicketNumber]
  );

  const citizenStatus = useMemo(
    () => (selectedTicket ? makeCitizenStatus(selectedTicket, lang) : null),
    [selectedTicket, lang]
  );

  const history = useMemo(() => {
    if (!selectedTicket) return [];
    return buildHistory(
      selectedTicket,
      readHistoryMap(),
      readEscalationMap(),
      lang
    );
  }, [selectedTicket, lang, refreshTick]);

  useEffect(() => {
    if (
      results.length &&
      !results.some(
        (r) => String(r.ticketNumber) === String(selectedTicketNumber)
      )
    ) {
      setSelectedTicketNumber(results[0].ticketNumber);
    }
    if (!results.length) {
      setSelectedTicketNumber("");
    }
  }, [results, selectedTicketNumber]);

  const validate = () => {
    const raw = keyword.trim();
    if (!raw)
      return t(
        "Please enter a value to search.",
        "Veuillez entrer une valeur à rechercher."
      );

    if (filterType === "ticketNumber" && !isValidTicketNumber(raw)) {
      return t(
        "Ticket number format should look like 311-2026-001234.",
        "Le format doit ressembler à 311-2026-001234."
      );
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
    setRefreshTick((v2) => v2 + 1);
  };

  const onClear = () => {
    setKeyword("");
    setSubmitted(false);
    setErrorMsg("");
    setSelectedTicketNumber("");
    setNoteDraft("");
  };

  const appendCitizenUpdate = () => {
    if (!selectedTicket || !noteDraft.trim()) return;

    const now = new Date().toISOString();
    const historyMap = readHistoryMap();
    const current = historyMap[selectedTicket.ticketNumber] || [];

    historyMap[selectedTicket.ticketNumber] = [
      {
        at: now,
        type: "citizen",
        title:
          lang === "FR"
            ? "Information ajoutée par le citoyen"
            : "Citizen added information",
        detail: noteDraft.trim(),
      },
      ...current,
    ];

    writeHistoryMap(historyMap);

    const storeResult = updateTicketByNumber(selectedTicket.ticketNumber, {
      updatedAt: now,
      citizenLastUpdateAt: now,
      citizenLastUpdateText: noteDraft.trim(),
    });

    if (!storeResult?.ok) {
      const publicRequests = readPublicRequests();
      const next = publicRequests.map((item) =>
        String(item.ticketNumber) === String(selectedTicket.ticketNumber)
          ? {
              ...item,
              updatedAt: now,
              citizenLastUpdateAt: now,
              citizenLastUpdateText: noteDraft.trim(),
            }
          : item
      );
      writePublicRequests(next);
    }

    setNoteDraft("");
    setRefreshTick((v) => v + 1);
    toast.success(copy.noteSavedMsg, { title: copy.noteSavedTitle });
  };

  const requestEscalation = () => {
    if (!selectedTicket) return;

    const escalationMap = readEscalationMap();
    escalationMap[selectedTicket.ticketNumber] = {
      at: new Date().toISOString(),
      requestedBy: "citizen",
    };
    writeEscalationMap(escalationMap);
    setRefreshTick((v) => v + 1);
    toast.success(copy.escalationMsg, { title: copy.escalationTitle });
  };

  const escalationRequested = selectedTicket
    ? !!readEscalationMap()[selectedTicket.ticketNumber]
    : false;

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
            aria-label={copy.goHomeAria}
          >
            <img className="lpLogo" src={logo} alt="INSIGHT-311 logo" />
            <div className="lpBrandText">
              <div className="lpBrandTitle">INSIGHT-311</div>
              <div className="lpBrandTag">{copy.brandTag}</div>
            </div>
          </div>

          <div className="lpHeaderCenter">{copy.cardTitle}</div>

          <div className="lpTopActions lpTopActionsRight" ref={actionsRef}>
            <button
              className="lpPill"
              type="button"
              onClick={() => (window.history.length > 1 ? nav(-1) : nav("/"))}
            >
              {copy.back}
            </button>

            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
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

            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
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
          <section className="plLookupIntro" aria-label={copy.lookupIntroAria}>
            <div className="plLookupH1">{copy.pageTitle}</div>
            <div className="plLookupSub">{copy.pageSub}</div>
            <div className="plLookupNote">{copy.privacy}</div>
          </section>

          <section className="plLookupStrip">{copy.privacyStrip}</section>

          <div className="plTwoCardGrid">
            <div className="lpCard plCard">
              <div className="plCardHeader">
                <div className="plCardTitleRow">{copy.cardTitle}</div>
                <div className="plCardSubRow">{copy.cardSub}</div>
              </div>

              <form onSubmit={onSubmit}>
                <div className="plLookupGrid">
                  <div className="plField">
                    <label htmlFor="lookup-filter">{copy.searchBy}</label>
                    <select
                      id="lookup-filter"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="ticketNumber">{copy.ticket}</option>
                      <option value="phone">{copy.phone}</option>
                    </select>
                  </div>

                  <div className="plField">
                    <label htmlFor="lookup-keyword">
                      {filterType === "ticketNumber" ? copy.ticket : copy.phone}
                    </label>
                    <input
                      id="lookup-keyword"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder={
                        filterType === "ticketNumber"
                          ? copy.placeholderTicket
                          : copy.placeholderPhone
                      }
                      aria-label={
                        filterType === "ticketNumber" ? copy.ticket : copy.phone
                      }
                      aria-invalid={!!errorMsg}
                      autoComplete={filterType === "phone" ? "tel" : "off"}
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
                            <button
                              key={r.ticketNumber}
                              type="button"
                              className={`plResultCard ${
                                selectedTicket?.ticketNumber === r.ticketNumber
                                  ? "active"
                                  : ""
                              }`}
                              onClick={() =>
                                setSelectedTicketNumber(r.ticketNumber)
                              }
                            >
                              <div className="plResultTop">
                                <div className="plTicket">{r.ticketNumber}</div>
                                <div className="plStatus">
                                  {getPublicStatusBadge(r, lang)}
                                </div>
                              </div>
                              <div className="plMeta">
                                <span>
                                  {r.assignedDepartment || r.department || "-"}
                                </span>
                                <span className="lpFooterDot">•</span>
                                <span>{r.category}</span>
                              </div>
                              <div className="plDesc">{r.description}</div>
                              <div className="plSmall">
                                {copy.phoneLabel}: {normalizePhone(r.phone)}
                              </div>
                            </button>
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

            <div className="lpCard plCard plHelpCard">
              <div className="plCardHeader">
                <div className="plCardTitleRow">{copy.help}</div>
                <div className="plCardSubRow">{copy.helpSub}</div>
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

          <section className="lpCard plStatusVisibilityCard">
            <div className="plCardHeader">
              <div className="plCardTitleRow">{copy.statusCardTitle}</div>
              <div className="plCardSubRow">
                {submitted && selectedTicket
                  ? copy.loggedLabel
                  : copy.selectPrompt}
              </div>
            </div>

            {!submitted || !selectedTicket || !citizenStatus ? (
              <div className="lpMuted">{copy.selectPrompt}</div>
            ) : (
              <div className="plVisibilityGrid">
                <div className="plStatusSummary">
                  <div className={`plCitizenBanner ${citizenStatus.tone}`}>
                    <div className="plBannerEyebrow">{copy.citizenLabel}</div>
                    <div className="plBannerTitle">{citizenStatus.headline}</div>
                    <div className="plBannerText">{citizenStatus.detail}</div>
                  </div>

                  <div className="plInfoGrid">
                    <div className="plInfoCard">
                      <div className="plInfoLabel">{copy.selectedTicket}</div>
                      <div className="plInfoValue">
                        {selectedTicket.ticketNumber || copy.notAvailable}
                      </div>
                    </div>
                    <div className="plInfoCard">
                      <div className="plInfoLabel">{copy.selectedCategory}</div>
                      <div className="plInfoValue">
                        {selectedTicket.category || copy.notAvailable}
                      </div>
                    </div>
                    <div className="plInfoCard">
                      <div className="plInfoLabel">{copy.selectedDepartment}</div>
                      <div className="plInfoValue">
                        {selectedTicket.assignedDepartment ||
                          selectedTicket.department ||
                          copy.notAvailable}
                      </div>
                    </div>
                    <div className="plInfoCard">
                      <div className="plInfoLabel">{copy.selectedUpdated}</div>
                      <div className="plInfoValue plInfoValueSmall">
                        {formatDateTime(
                          selectedTicket.updatedAt || selectedTicket.createdAt,
                          lang
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="plInfoGrid">
                    <div className="plInfoCard">
                      <div className="plInfoLabel">{copy.internalLabel}</div>
                      <div className="plInfoValue">
                        {formatInternalStatus(selectedTicket.status || "NEW", lang)}
                      </div>
                    </div>
                    <div className="plInfoCard">
                      <div className="plInfoLabel">{copy.nextStep}</div>
                      <div className="plInfoValue plInfoValueSmall">
                        {citizenStatus.step}
                      </div>
                    </div>
                  </div>

                  <div className="plInfoCard">
                    <div className="plInfoLabel">{copy.addInfoTitle}</div>
                    <div className="lpMuted" style={{ marginBottom: 10 }}>
                      {copy.addInfoHint}
                    </div>
                    <textarea
                      className="plNoteBox"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder={copy.addInfoPlaceholder}
                      rows={4}
                    />
                    <div className="plActions" style={{ marginTop: 12 }}>
                      <button
                        className="btn primary"
                        type="button"
                        onClick={appendCitizenUpdate}
                        disabled={!noteDraft.trim()}
                      >
                        {copy.appendInfo}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={requestEscalation}
                        disabled={escalationRequested}
                      >
                        {escalationRequested
                          ? copy.requestLogged
                          : copy.requestHuman}
                      </button>
                    </div>
                    <div className="plSmall" style={{ marginTop: 8 }}>
                      {copy.noteUsage}
                    </div>
                  </div>
                </div>

                <div className="plTimelineCard">
                  <div className="plInfoLabel" style={{ marginBottom: 12 }}>
                    {copy.timeline}
                  </div>

                  <div className="plTimelineList">
                    {history.map((item, idx) => (
                      <div key={`${item.at}-${idx}`} className="plTimelineItem">
                        <div className="plTimelineDot" />
                        <div>
                          <div className="plTimelineTitle">{item.title}</div>
                          <div className="plTimelineMeta">
                            {formatDateTime(item.at, lang)}
                          </div>
                          <div className="plTimelineText">{item.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="plTimelineMore">{copy.timelineMore}</div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <PublicFooter showNav={true} active="lookup" />
    </div>
  );
}