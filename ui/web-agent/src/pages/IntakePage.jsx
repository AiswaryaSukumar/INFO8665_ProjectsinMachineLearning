// src/pages/IntakePage.jsx
import { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";

import TicketForm from "../components/TicketForm";
import TicketTable from "../components/TicketTable";
import TicketDetailsDrawer from "../components/TicketDetailsDrawer";
import DonutChart from "../components/DonutChart";
import TicketReportsPanel from "../components/TicketReportsPanel";
import TicketViewDropdown from "../components/TicketViewDropdown";
import Floating311Button from "../components/Floating311Button";
import QueueOverviewPanel from "./QueueOverviewPanel";

// controls + toast
import TicketTableControls from "../components/TicketTableControls";
import { useToast } from "../components/Toast";

// routing imports
import { OPERATORS, SUPERVISOR } from "../data/operators";
import { decideHandoffTarget } from "../utils/routing";

import { inferDepartmentFromCategory } from "../utils/categoryRouting";

// API
import {
  fetchTickets,
  createTicket as createTicketApi,
  updateTicket as updateTicketApi,
  approveTicket as approveTicketApi,
  rejectTicket as rejectTicketApi,
} from "../api/tickets";
import { fetchDuplicates, mergeDuplicate } from "../api/duplicates";

function parseSortableTicketDate(value) {
  const s = String(value || "").trim();
  if (!s) return 0;
  const isoish = s.includes("T") ? s : s.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoish);
  const d = new Date(hasTimezone ? isoish : `${isoish}Z`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function ticketSortKey(ticket = {}) {
  return String(
    ticket.ticketNumber ||
      ticket.ticketId ||
      ticket.ticket_id ||
      ticket.id ||
      ""
  );
}

function compareNewestTickets(a, b) {
  const byCreated =
    parseSortableTicketDate(b?.createdAt || b?.created_at) -
    parseSortableTicketDate(a?.createdAt || a?.created_at);
  if (byCreated !== 0) return byCreated;

  return ticketSortKey(b).localeCompare(ticketSortKey(a), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const low = (v) => String(v ?? "").trim().toLowerCase();

function inferToneFromTranscript(text = "") {
  const t = String(text || "").toLowerCase();
  const angryWords = ["angry", "furious", "outrage", "ridiculous", "unacceptable"];
  const agitatedWords = ["frustrat", "upset", "annoy", "worried", "stress", "urgent"];
  const hasAngry = angryWords.some((w) => t.includes(w));
  const hasAgitated = agitatedWords.some((w) => t.includes(w));
  if (hasAngry) return { tone: "ANGRY", toneConfidence: "MEDIUM" };
  if (hasAgitated) return { tone: "AGITATED", toneConfidence: "MEDIUM" };
  if (t.trim().length > 0) return { tone: "CALM", toneConfidence: "LOW" };
  return { tone: "UNKNOWN", toneConfidence: "LOW" };
}

function inferFieldsFromTranscript(transcript = "") {
  const text = String(transcript || "").toLowerCase();

  let category = "";
  if (text.includes("pothole")) category = "Pothole";
  else if (text.includes("graffiti") || text.includes("spray paint")) category = "Graffiti";
  else if (text.includes("illegal sign") || (text.includes("sign") && text.includes("illegal")))
    category = "Illegal sign";
  else if (text.includes("needle") || text.includes("syringe")) category = "Needles";
  else if (text.includes("litter") || text.includes("trash") || text.includes("garbage"))
    category = "Litter in a playground, park or trail";
  else if (text.includes("snow") && text.includes("sidewalk")) category = "Sidewalk snow clearing";
  else if ((text.includes("trip") || text.includes("tripping")) && text.includes("sidewalk"))
    category = "Sidewalk trip hazard";
  else if (text.includes("trail") && (text.includes("surface") || text.includes("maintenance")))
    category = "Trail surface maintenance";
  else if (text.includes("parking")) category = "Parking complaint";
  else if (text.includes("property") && (text.includes("standards") || text.includes("maintenance")))
    category = "Property standards complaint";

  let location = "";
  if (text.includes("king") && text.includes("weber")) location = "King St & Weber St";

  const confidence = category ? (location ? "HIGH" : "MEDIUM") : "LOW";
  const status = "NEW";
  const priority = text.includes("danger") || text.includes("hazard") ? "HIGH" : "MEDIUM";

  return { category, location, confidence, status, priority };
}

function normalizeChannel(value = "", fallback = "PHONE") {
  const raw = String(value || "").trim().toUpperCase();

  if (!raw) return fallback;

  if (
    raw === "WEB" ||
    raw === "WEB_FORM" ||
    raw === "WEBFORM" ||
    raw === "ONLINE" ||
    raw === "PUBLIC_WEB"
  ) {
    return "WEB";
  }

  if (
    raw === "PHONE" ||
    raw === "CALL" ||
    raw === "VOICE" ||
    raw === "PHONE (HUMAN OPERATOR)" ||
    raw === "PHONE (AI VOICE BOT)" ||
    raw === "PHONE (AI VOICE BOT → OPERATOR)" ||
    raw === "PHONE (AI VOICE BOT → SUPERVISOR)"
  ) {
    return "PHONE";
  }

  if (raw === "EMAIL" || raw === "E-MAIL") return "EMAIL";

  if (
    raw === "IN_PERSON" ||
    raw === "IN-PERSON" ||
    raw === "IN PERSON" ||
    raw === "COUNTER"
  ) {
    return "IN_PERSON";
  }

  return fallback;
}

function normalizeTone(value = "", fallback = "UNKNOWN") {
  const raw = String(value || "").trim().toUpperCase();

  if (!raw) return fallback;
  if (raw === "UPSET") return "AGITATED";
  if (raw === "FRUSTRATED") return "AGITATED";
  if (raw === "THREATENING") return "THREAT";

  const allowed = ["UNKNOWN", "CALM", "NEUTRAL", "AGITATED", "ANGRY", "THREAT", "ABUSIVE"];
  return allowed.includes(raw) ? raw : fallback;
}

/**
 * normalizeTicket
 *
 * Final business rule:
 * - created by Voice Bot + handled by Voice Bot => NEEDS_REVIEW
 * - created by Voice Bot + handled by Operator/Supervisor => NEW
 * - created by Operator + handled by Operator => NEW
 *
 * Rejected / Resolved / Delete must stay as-is.
 */
function normalizeTicket(t, fallbackAssignee = "") {
  const createdNameRaw = String(t?.createdByName || fallbackAssignee || "");
  const handledNameRaw = String(t?.handledByName || "");

  const createdTypeUpper = String(t?.createdByType || "").toUpperCase();
  const handledTypeUpper = String(t?.handledByType || "").toUpperCase();
  const handledRoleUpper = String(t?.handledByRole || "").toUpperCase();

  const createdLooksLikeBot =
    createdTypeUpper === "VOICE_BOT" ||
    createdNameRaw.toLowerCase().includes("voicebot");

  const handledLooksLikeBot =
    handledTypeUpper === "VOICE_BOT" ||
    handledRoleUpper === "VOICE_BOT" ||
    handledNameRaw.toLowerCase().includes("voicebot");

  const createdType = t?.createdByType || (createdLooksLikeBot ? "VOICE_BOT" : "OPERATOR");
  const createdName = createdNameRaw;

  const handledByType =
    t?.handledByType || (handledLooksLikeBot ? "VOICE_BOT" : "OPERATOR");

  const handledByRole =
    t?.handledByRole || (handledLooksLikeBot ? "VOICE_BOT" : "OPERATOR");

  const handledByName =
    t?.handledByName || createdName || fallbackAssignee || "";

  const assignedDepartment =
    t?.assignedDepartment ??
    t?.department ??
    inferDepartmentFromCategory(t?.category);

  const routingUpper = String(t?.routingStatus || "").toUpperCase();
  const incomingWorkflowStage = String(t?.workflowStage || "").toUpperCase();
  const statusUpper = String(
    t?.status || t?.ticketStatus || t?.ticket_status || ""
  ).toUpperCase();

  const createdUpper = String(createdType || "").toUpperCase();
  const derivedHandledRole = String(handledByRole || "").toUpperCase();
  const derivedHandledType = String(handledByType || "").toUpperCase();

  const derivedPureBot =
    createdUpper === "VOICE_BOT" &&
    derivedHandledRole === "VOICE_BOT" &&
    derivedHandledType === "VOICE_BOT";

  const rejectedLike =
    routingUpper === "REJECTED" ||
    incomingWorkflowStage === "REJECTED" ||
    incomingWorkflowStage === "REJECTED_BY_SUPERVISOR" ||
    statusUpper === "REJECTED";

  const workflowStage =
    t?.workflowStage ||
    (rejectedLike
      ? "REJECTED_BY_SUPERVISOR"
      : routingUpper === "APPROVED"
      ? "ROUTED_TO_DEPARTMENT"
      : derivedPureBot
      ? "PENDING_APPROVAL"
      : "STANDARD");

  let derivedStatus = "NEW";

  if (statusUpper === "DELETE") {
    derivedStatus = "DELETE";
  } else if (statusUpper === "RESOLVED") {
    derivedStatus = "RESOLVED";
  } else if (rejectedLike) {
    derivedStatus = "REJECTED";
  } else if (derivedPureBot) {
    derivedStatus = "NEEDS_REVIEW";
  } else {
    if (statusUpper === "NEEDS_REVIEW") {
      derivedStatus = "NEW";
    } else if (statusUpper) {
      derivedStatus = statusUpper;
    } else {
      derivedStatus = "NEW";
    }
  }

  const baseTime = t?.createdAt || t?.created_at || t?.created || new Date().toISOString();

  const normalizedSessionHistory = Array.isArray(t?.sessionHistory)
    ? t.sessionHistory
        .map((m, idx) => {
          if (!m) return null;

          const speaker = String(m.speaker || m.from || m.role || "System").trim();
          const text = String(m.text || m.message || m.content || "").trim();

          const at =
            m.at ||
            m.time ||
            m.ts ||
            baseTime ||
            new Date(Date.now() - (t.sessionHistory.length - idx) * 1000).toISOString();

          if (!speaker || !text) return null;
          return { at, speaker, text };
        })
        .filter(Boolean)
    : [];

  return {
    ...(t || {}),
    id: t?.id || t?.ticketId || t?.ticket_id || t?.ticketNumber || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ticketId: t?.ticketId || t?.ticket_id || t?.id || t?.ticketNumber,
    ticketNumber: t?.ticketNumber || t?.ticket_id || t?.ticketId || t?.id,
    status: derivedStatus,

    createdByType: createdType,
    createdByName: createdName,
    createdByRole: t?.createdByRole || (createdUpper === "VOICE_BOT" ? "SYSTEM" : "OPERATOR"),

    handledByType,
    handledByRole,
    handledByName,

    escalatedToRole: t?.escalatedToRole || null,
    escalatedToName: t?.escalatedToName || null,
    escalationReason: t?.escalationReason || null,

    routingStatus: t?.routingStatus || (derivedPureBot ? "PENDING_APPROVAL" : "ROUTED"),
    workflowStage,
    assignedDepartment,
    approvedAt: t?.approvedAt || null,

    sessionHistory: normalizedSessionHistory,

    channel: normalizeChannel(t?.channel, "PHONE"),
    tone: normalizeTone(t?.tone || t?.callerTone, "UNKNOWN"),
    callerTone: normalizeTone(t?.callerTone || t?.tone, "UNKNOWN"),
    toneConfidence: t?.toneConfidence || "LOW",
    toneSource: t?.toneSource || "AI",
    confidenceScores: t?.confidenceScores || t?.confidence_scores || null,
    confidenceAlert: t?.confidenceAlert || t?.confidence_alert || "",
    alertedFields: t?.alertedFields || t?.alerted_fields || [],
    sentimentScore: t?.sentimentScore || t?.sentiment_score || null,

    createdAt: t?.createdAt || t?.created_at || t?.created || "",
    updatedAt: t?.updatedAt || t?.updated_at || "",
    name: t?.name || t?.callerName || t?.caller_name || t?.fullName || "",
    fullName: t?.fullName || t?.name || t?.callerName || t?.caller_name || "",
    phone: t?.phone || t?.phoneNumber || t?.phone_number || "",
  };
}

function isPureVoiceBotTicket(t) {
  const createdByType = String(t?.createdByType || "").toUpperCase();
  const handledByRole = String(t?.handledByRole || "").toUpperCase();
  const handledByType = String(t?.handledByType || "").toUpperCase();

  return (
    createdByType === "VOICE_BOT" &&
    handledByRole === "VOICE_BOT" &&
    handledByType === "VOICE_BOT"
  );
}

function isRejectedTicket(t) {
  const routing = String(t?.routingStatus || "").toUpperCase();
  const stage = String(t?.workflowStage || "").toUpperCase();
  const status = String(t?.status || "").toUpperCase();
  return (
    status === "REJECTED" ||
    routing === "REJECTED" ||
    stage === "REJECTED" ||
    stage === "REJECTED_BY_SUPERVISOR"
  );
}

function pickNextOperatorName() {
  const names =
    Array.isArray(OPERATORS) && OPERATORS.length > 0
      ? OPERATORS.map((o) => o?.name).filter(Boolean)
      : ["Jerry", "Tom"];

  if (names.length === 0) return "Jerry";

  const key = "insight_rr_operator_index";
  const raw = Number(localStorage.getItem(key));
  const lastIdx = Number.isFinite(raw) ? raw : -1;

  const nextIdx = (lastIdx + 1) % names.length;
  localStorage.setItem(key, String(nextIdx));
  return names[nextIdx];
}

function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="errorBanner" role="alert">
      <div className="errorBannerText">
        <b>Couldn’t load tickets.</b> {message}
      </div>
      <button className="btn" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export default function IntakePage({ activeView: routeActiveView, view = "myWork" }) {
  const outlet = useOutletContext?.() || {};
  const lang = outlet?.lang || "EN";
  const isFR = lang === "FR";

  const outletUserName = outlet?.userName;
  const outletUserRole = outlet?.userRole;

  const nav = useNavigate();
  const loc = useLocation();

  const handleRowClick = useCallback(
    (t, backTo) => {
      const id = t?.ticketNumber || t?.id;
      if (!id) return;

      const safeBackTo = backTo || `${loc.pathname}${loc.search || ""}`;

      nav(`/dashboard/ticket/${encodeURIComponent(id)}`, {
        state: { ticket: t, backTo: safeBackTo },
      });
    },
    [nav, loc.pathname, loc.search]
  );

  const activeView =
    routeActiveView ||
    (view === "overview"
      ? "QUEUE_OVERVIEW"
      : view === "manual"
      ? "MANUAL_TICKET"
      : "MY_WORK_QUEUE");

  const { toast } = useToast();

  const [transcript, setTranscript] = useState("");
  const [lastHandoff, setLastHandoff] = useState({ type: "VOICE_BOT" });

  const [userName, setUserName] = useState(localStorage.getItem("userName") || "Jerry");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "OPERATOR");

  const sessionUserName = outletUserName || userName;
  const sessionUserRole = outletUserRole || userRole;
  const sessionRoleUpper = String(sessionUserRole || "OPERATOR").toUpperCase();

  const [queueFilter, setQueueFilter] = useState("ALL");
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingManualSubmit, setLoadingManualSubmit] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [chips, setChips] = useState({ needsReview: false, escalated: false });

  const [chartFilter, setChartFilter] = useState(null);

  const [ticketView, setTicketView] = useState("RECENT");

  const handleQueueFilterChange = useCallback((nextFilter) => {
    setQueueFilter((current) => {
      const normalizedNext = String(nextFilter || "ALL").toUpperCase();
      if (!normalizedNext || normalizedNext === "ALL") return "ALL";
      if (current === normalizedNext) return "ALL";
      return normalizedNext;
    });
  }, []);

  useEffect(() => {
    const preset = loc?.state?.queuePreset;
    if (!preset) return;

    setSearchQuery("");
    setChartFilter(null);

    if (preset === "RESOLVED") {
      setTicketView("HISTORY");
      setQueueFilter("RESOLVED");
      setChips({ needsReview: false, escalated: false });
    } else if (preset === "NEEDS_REVIEW") {
      setTicketView("RECENT");
      setQueueFilter("ALL");
      setChips({ needsReview: true, escalated: false });
    } else if (preset === "ESCALATED") {
      setTicketView("RECENT");
      setQueueFilter("ESCALATED");
      setChips({ needsReview: false, escalated: true });
    } else if (preset === "ACTIVE") {
      setTicketView("RECENT");
      setQueueFilter("ALL");
      setChips({ needsReview: false, escalated: false });
    } else {
      setTicketView("RECENT");
      setQueueFilter(preset);
      setChips({ needsReview: false, escalated: false });
    }

    nav(loc.pathname, { replace: true, state: {} });
  }, [loc?.state?.queuePreset, nav, loc.pathname]);

  useEffect(() => {
    if (ticketView === "HISTORY" && queueFilter === "ALL") setQueueFilter("ALL_TICKETS");
    if (ticketView === "RECENT" && queueFilter === "ALL_TICKETS") setQueueFilter("ALL");
  }, [ticketView, queueFilter]);

  const [tickets, setTickets] = useState([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setTicketsError("");

    try {
      const apiTickets = await fetchTickets();

      const normalizedApi = (apiTickets || []).map((t, idx) =>
        normalizeTicket(
          {
            ...t,
            id: t.id || t.ticketId || t.ticket_id || t.ticketNumber,
            ticketId: t.ticketId || t.ticket_id || t.id,
            ticketNumber: t.ticketNumber || t.ticket_id || t.ticketId || t.id,
            name: t.name || t.callerName || t.caller_name || t.fullName || "",
            fullName: t.fullName || t.name || t.callerName || t.caller_name || "",
            phone: t.phone || t.phoneNumber || t.phone_number || "",
            assignedDepartment:
              t.assignedDepartment || t.department || inferDepartmentFromCategory(t.category),
          },
          idx % 2 === 0 ? "Jerry" : "Tom"
        )
      );

      setTickets([...normalizedApi].sort(compareNewestTickets));
      setTicketsError("");
    } catch (e) {
      console.error("[API mode] fetchTickets failed:", e);
      setTickets([]);
      setTicketsError(e?.message || "Failed to load tickets.");
    } finally {
      setLoadingTickets(false);
      setLastRefreshedAt(new Date());
    }
  }, []);

  const loadDuplicateCandidates = useCallback(async () => {
    try {
      const candidates = await fetchDuplicates({ limit: 200 });
      setDuplicateCandidates(candidates || []);
    } catch (e) {
      console.error("[API mode] fetchDuplicates failed:", e);
      setDuplicateCandidates([]);
    }
  }, []);

  useEffect(() => {
    const handleTicketsChanged = async () => {
      await loadTickets();
      await loadDuplicateCandidates();
    };

    window.addEventListener("tickets-changed", handleTicketsChanged);
    window.addEventListener("focus", handleTicketsChanged);

    return () => {
      window.removeEventListener("tickets-changed", handleTicketsChanged);
      window.removeEventListener("focus", handleTicketsChanged);
    };
  }, [loadTickets, loadDuplicateCandidates]);

  const handleRefresh = useCallback(async () => {
    await loadTickets();
    await loadDuplicateCandidates();
    toast.success(isFR ? `Mis à jour à ${nowStamp()}` : `Updated at ${nowStamp()}`);
  }, [loadTickets, loadDuplicateCandidates, toast, isFR]);

  useEffect(() => {
    loadTickets();
    loadDuplicateCandidates();
  }, [loadTickets, loadDuplicateCandidates]);

  const [draftTicketNumber, setDraftTicketNumber] = useState("Generated on submit");

  useEffect(() => {
    const onSessionChanged = () => {
      setUserName(localStorage.getItem("userName") || "Jerry");
      setUserRole(localStorage.getItem("userRole") || "OPERATOR");
    };
    window.addEventListener("session-changed", onSessionChanged);
    return () => window.removeEventListener("session-changed", onSessionChanged);
  }, []);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    fullName: "",
    phone: "",
    email: "",
    location: "",
    category: "",
    description: "",
    priority: "MEDIUM",
    status: "NEW",
    confidence: "MEDIUM",
    channel: "PHONE",
    assignedDepartment: "",
    tone: "NEUTRAL",
    callerTone: "NEUTRAL",
    toneConfidence: "LOW",
    toneSource: "HUMAN",
  });

  const resetManualForm = () => {
    setForm({
      name: "",
      fullName: "",
      phone: "",
      email: "",
      location: "",
      category: "",
      description: "",
      priority: "MEDIUM",
      status: "NEW",
      confidence: "MEDIUM",
      channel: "PHONE",
      assignedDepartment: "",
      tone: "NEUTRAL",
      callerTone: "NEUTRAL",
      toneConfidence: "LOW",
      toneSource: "HUMAN",
    });
  };

  const consumeManualDraftNumber = () => {
    setDraftTicketNumber("Generated on submit");
  };

  const toggleChip = (chipKey) => {
    setChips((prev) => ({ ...prev, [chipKey]: !prev[chipKey] }));
  };

  const clearAllFilters = () => {
    setChips({ needsReview: false, escalated: false });
    setChartFilter(null);
  };

  const aiCreateTicketFromTranscript = async (handoffPayload = { type: "VOICE_BOT" }) => {
    setLastHandoff(handoffPayload);

    const t = transcript.trim();
    if (!t) {
      toast.warning(
        isFR ? "Pas de transcription. Simulez un appel d’abord." : "No transcript yet. Simulate a call first."
      );
      return;
    }

    const inferred = inferFieldsFromTranscript(t);
    const toneGuess = inferToneFromTranscript(t);

    const ticketDraft = {
      category: inferred.category || "Other",
      priority: inferred.priority,
      status: inferred.status,
      tone: toneGuess.tone,
      toneConfidence: toneGuess.toneConfidence,
    };

    let handledByType = "VOICE_BOT";
    let handledByRole = "VOICE_BOT";
    let handledByName = "INSIGHT VoiceBot";
    let escalatedToRole = null;
    let escalatedToName = null;
    let escalationReason = null;

    if (handoffPayload?.type === "VOICE_BOT_TO_HUMAN") {
      const preferredOperatorName =
        handoffPayload.preferredOperatorName || pickNextOperatorName();

      const decision = decideHandoffTarget({
        ticketDraft,
        requestSupervisor: !!handoffPayload.requestSupervisor,
        supervisorName: SUPERVISOR?.name || "Nagavalli",
        operatorName: preferredOperatorName,
      });

      handledByType = decision.handledByType;
      handledByRole = decision.handledByRole;
      handledByName = decision.handledByName;

      if (decision.escalation) {
        escalatedToRole = decision.escalation.escalatedToRole;
        escalatedToName = decision.escalation.escalatedToName;
        escalationReason = decision.escalation.escalationReason;
      }
    }

    const isBotOnly =
      String(handledByRole || "").toUpperCase() === "VOICE_BOT" &&
      String(handledByType || "").toUpperCase() === "VOICE_BOT";

    const statusForAiTicket = isBotOnly ? "NEEDS_REVIEW" : "NEW";

    const payload = {
      category: inferred.category || "Other",
      description: t,
      location: inferred.location || "",
      severity: inferred.priority || "MEDIUM",
      channel: "PHONE",

      ticketStatus: statusForAiTicket,
      routingStatus: isBotOnly ? "PENDING_APPROVAL" : "ROUTED",
      workflowStage: isBotOnly ? "PENDING_APPROVAL" : "STANDARD",

      confidence: inferred.confidence || "LOW",
      transcript: t,
      recordingUrl: "/mock/call_dash.wav",

      createdByType: "VOICE_BOT",
      createdByName: "INSIGHT VoiceBot",
      createdByRole: "SYSTEM",

      handledByType,
      handledByRole,
      handledByName,

      escalatedToRole,
      escalatedToName,
      escalationReason,

      tone: toneGuess.tone,
      callerTone: toneGuess.tone,
      toneConfidence: toneGuess.toneConfidence,
      toneSource: "AI",

      assignedDepartment:
        inferDepartmentFromCategory(inferred.category || "Other") || "",
      department:
        inferDepartmentFromCategory(inferred.category || "Other") || "",
    };

    try {
      const created = await createTicketApi(payload);
      await loadTickets();
      window.dispatchEvent(new Event("tickets-changed"));

      const handlerLabel =
        handledByRole === "SUPERVISOR"
          ? `Supervisor (${handledByName})`
          : handledByRole === "OPERATOR"
          ? `Operator (${handledByName})`
          : "Voice Bot";

      toast.success(
        isFR
          ? `Ticket IA créé : ${created?.ticketNumber || ""}`
          : `AI ticket created: ${created?.ticketNumber || ""}`,
        { title: handlerLabel }
      );
    } catch (e) {
      toast.error(
        e?.message ||
          (isFR ? "Échec de la création du ticket IA." : "AI ticket creation failed.")
      );
    }
  };

  const submitTicket = async (enhancedFormMaybe) => {
    const incoming = enhancedFormMaybe || form;

    if (!incoming.description || !incoming.category) {
      toast.error(
        isFR ? "Veuillez remplir Catégorie + Description." : "Please ensure at least Category + Description are filled."
      );
      return;
    }

    const resolvedName = incoming.name || incoming.fullName || "";
    const resolvedTone = normalizeTone(incoming.tone || incoming.callerTone, "NEUTRAL");
    const resolvedChannel = normalizeChannel(incoming.channel, "PHONE");
    const resolvedDepartment =
      incoming.assignedDepartment ||
      incoming.department ||
      inferDepartmentFromCategory(incoming.category) ||
      "";

    const payload = {
      name: resolvedName,
      callerName: resolvedName,
      phone: incoming.phone || "",
      phoneNumber: incoming.phone || "",

      category: incoming.category,
      description: incoming.description,
      location: incoming.location || "",
      assignedDepartment: resolvedDepartment,
      department: resolvedDepartment,

      severity: incoming.priority || "MEDIUM",
      channel: resolvedChannel,

      ticketStatus: incoming.status || "NEW",
      routingStatus: incoming.routingStatus || "ROUTED",
      workflowStage: incoming.workflowStage || "STANDARD",

      notes: incoming.notes || "",
      transcript: incoming.transcript || "",
      sessionHistory: Array.isArray(incoming.sessionHistory) ? incoming.sessionHistory : [],

      tone: resolvedTone,
      callerTone: resolvedTone,
      toneConfidence: incoming.toneConfidence || "LOW",
      toneSource: incoming.toneSource || "HUMAN",

      createdByType: incoming.createdByType || "OPERATOR",
      createdByName: incoming.createdByName || sessionUserName,
      createdByRole: incoming.createdByRole || sessionUserRole,

      handledByType: incoming.handledByType || "OPERATOR",
      handledByRole: incoming.handledByRole || "OPERATOR",
      handledByName: incoming.handledByName || sessionUserName,
    };

    try {
      setLoadingManualSubmit(true);

      const created = await createTicketApi(payload);

      await loadTickets();

      resetManualForm();
      consumeManualDraftNumber();

      window.dispatchEvent(new Event("tickets-changed"));

      toast.success(
        isFR
          ? `Ticket manuel créé : ${created?.ticketNumber || ""}`
          : `Manual ticket created: ${created?.ticketNumber || ""}`
      );
    } catch (e) {
      toast.error(
        e?.message ||
          (isFR ? "Échec de la création du ticket manuel." : "Manual ticket creation failed.")
      );
    } finally {
      setLoadingManualSubmit(false);
    }
  };

  const approveTicket = async (ticketId) => {
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";
    if (!isSupervisor) {
      toast.error(isFR ? "Accès refusé." : "Not allowed. Supervisor only.");
      return;
    }

    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error(isFR ? "Ticket introuvable." : "Ticket not found.");
      return;
    }

    const stage = String(current.workflowStage || "").toUpperCase();
    const routing = String(current.routingStatus || "").toUpperCase();
    const status = String(current.status || "").toUpperCase();

    const isBotOnly = isPureVoiceBotTicket(current);
    const isPendingApproval =
      stage === "PENDING_APPROVAL" ||
      stage === "PENDING_SUPERVISOR_APPROVAL" ||
      routing === "PENDING_APPROVAL";

    const isRejected =
      status === "REJECTED" ||
      routing === "REJECTED" ||
      stage === "REJECTED" ||
      stage === "REJECTED_BY_SUPERVISOR";

    if (!isBotOnly) {
      toast.error(
        isFR
          ? "Éligibilité: uniquement tickets créés ET traités par Voice Bot."
          : "Not eligible. Approve is only for tickets created AND handled by the Voice Bot."
      );
      return;
    }

    if (isRejected) {
      toast.error(
        isFR
          ? "Ce ticket a déjà été rejeté."
          : "This ticket has already been rejected."
      );
      await loadTickets();
      return;
    }

    if (!isPendingApproval) {
      toast.error(
        isFR
          ? "Ce ticket n’est pas en attente d’approbation."
          : "This ticket is not in PENDING_APPROVAL."
      );
      await loadTickets();
      return;
    }

    if (routing === "APPROVED") return;

    const dept =
      current.assignedDepartment ||
      inferDepartmentFromCategory(current.category) ||
      "General";

    try {
      const apiId = current.ticketId || current.id;
      if (!apiId) throw new Error("Missing backend ticket ID.");

      await approveTicketApi(apiId, {
        department: dept,
        handledByType: "SUPERVISOR",
        handledByName: sessionUserName || "-",
        handledByRole: "SUPERVISOR",
      });

      await loadTickets();

      if (selectedTicket?.id === ticketId) {
        const refreshed = (await fetchTickets()).find(
          (t) => (t.ticketId || t.ticket_id || t.id) === apiId
        );

        if (refreshed) {
          setSelectedTicket(
            normalizeTicket(
              {
                ...refreshed,
                id: refreshed.id || refreshed.ticketId || refreshed.ticket_id || refreshed.ticketNumber,
                ticketNumber:
                  refreshed.ticketNumber ||
                  refreshed.ticketId ||
                  refreshed.ticket_id ||
                  refreshed.id,
                name:
                  refreshed.name ||
                  refreshed.callerName ||
                  refreshed.caller_name ||
                  refreshed.fullName ||
                  "",
                fullName:
                  refreshed.fullName ||
                  refreshed.name ||
                  refreshed.callerName ||
                  refreshed.caller_name ||
                  "",
                phone: refreshed.phone || refreshed.phoneNumber || refreshed.phone_number || "",
                assignedDepartment:
                  refreshed.assignedDepartment ||
                  refreshed.department ||
                  inferDepartmentFromCategory(refreshed.category),
              },
              sessionUserName
            )
          );
        }
      }

      toast.success(
        isFR
          ? `Approbation réussie. Routé vers ${dept}.`
          : `Approve & routing was successful. Routed to Department Queue — ${dept}.`
      );
    } catch (e) {
      toast.error(
        e?.message ||
          (isFR ? "Échec de l’approbation." : "Approve failed. Please try again.")
      );
    }
  };

  const rejectTicket = async (ticketId, reason = "") => {
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";
    if (!isSupervisor) {
      toast.error(isFR ? "Accès refusé." : "Not allowed. Supervisor only.");
      return;
    }

    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error(isFR ? "Ticket introuvable." : "Ticket not found.");
      return;
    }

    const stage = String(current.workflowStage || "").toUpperCase();
    const routing = String(current.routingStatus || "").toUpperCase();
    const status = String(current.status || "").toUpperCase();

    const isBotOnly = isPureVoiceBotTicket(current);
    const isPendingApproval =
      stage === "PENDING_APPROVAL" ||
      stage === "PENDING_SUPERVISOR_APPROVAL" ||
      routing === "PENDING_APPROVAL";

    const alreadyRejected =
      status === "REJECTED" ||
      routing === "REJECTED" ||
      stage === "REJECTED" ||
      stage === "REJECTED_BY_SUPERVISOR";

    if (!isBotOnly) {
      toast.error(
        isFR
          ? "Éligibilité: uniquement tickets créés ET traités par Voice Bot."
          : "Not eligible. Reject is only for tickets created AND handled by the Voice Bot."
      );
      return;
    }

    if (!isPendingApproval && !alreadyRejected) {
      toast.error(
        isFR
          ? "Ce ticket n’est pas en attente d’approbation."
          : "This ticket is not in PENDING_APPROVAL."
      );
      await loadTickets();
      return;
    }

    if (alreadyRejected) return;

    try {
      const apiId = current.ticketId || current.id;
      if (!apiId) throw new Error("Missing backend ticket ID.");

      await rejectTicketApi(apiId, {
        handledByType: "SUPERVISOR",
        handledByName: sessionUserName || "-",
        handledByRole: "SUPERVISOR",
        rejectedReason: String(reason || "").trim(),
      });

      await loadTickets();

      if (selectedTicket?.id === ticketId) {
        const refreshed = (await fetchTickets()).find(
          (t) => (t.ticketId || t.ticket_id || t.id) === apiId
        );
        if (refreshed) {
          setSelectedTicket(
            normalizeTicket(
              {
                ...refreshed,
                id: refreshed.id || refreshed.ticketId || refreshed.ticket_id || refreshed.ticketNumber,
                ticketNumber:
                  refreshed.ticketNumber ||
                  refreshed.ticketId ||
                  refreshed.ticket_id ||
                  refreshed.id,
                name:
                  refreshed.name ||
                  refreshed.callerName ||
                  refreshed.caller_name ||
                  refreshed.fullName ||
                  "",
                fullName:
                  refreshed.fullName ||
                  refreshed.name ||
                  refreshed.callerName ||
                  refreshed.caller_name ||
                  "",
                phone: refreshed.phone || refreshed.phoneNumber || refreshed.phone_number || "",
                assignedDepartment:
                  refreshed.assignedDepartment ||
                  refreshed.department ||
                  inferDepartmentFromCategory(refreshed.category),
              },
              sessionUserName
            )
          );
        }
      }

      toast.success(
        isFR
          ? "Rejet enregistré avec succès."
          : "Reject was successful. Ticket will not be routed."
      );
    } catch (e) {
      toast.error(
        e?.message ||
          (isFR ? "Échec du rejet." : "Reject failed. Please try again.")
      );
    }
  };

  const updateTicket = async (ticketId, patch) => {
    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error(isFR ? "Ticket introuvable." : "Ticket not found.");
      return;
    }

    const prevSnapshot = tickets;

    const normalizedPatch = {
      ...patch,
      ...(patch?.channel ? { channel: normalizeChannel(patch.channel, current.channel || "PHONE") } : {}),
      ...(patch?.tone || patch?.callerTone
        ? {
            tone: normalizeTone(patch.tone || patch.callerTone, current.tone || "UNKNOWN"),
            callerTone: normalizeTone(
              patch.callerTone || patch.tone,
              current.callerTone || current.tone || "UNKNOWN"
            ),
          }
        : {}),
    };

    const nextTickets = tickets.map((t) =>
      t.id === ticketId ? { ...t, ...normalizedPatch } : t
    );
    setTickets(nextTickets);
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (prev ? { ...prev, ...normalizedPatch } : prev));
    }

    try {
      const apiId = current.ticketId || current.id || ticketId;
      const updatedFromApi = await updateTicketApi(apiId, normalizedPatch);

      if (updatedFromApi) {
        const normalizedUpdated = normalizeTicket(
          {
            ...updatedFromApi,
            id:
              updatedFromApi.id ||
              updatedFromApi.ticketId ||
              updatedFromApi.ticket_id ||
              updatedFromApi.ticketNumber,
            ticketNumber:
              updatedFromApi.ticketNumber ||
              updatedFromApi.ticketId ||
              updatedFromApi.ticket_id ||
              updatedFromApi.id,
            name:
              updatedFromApi.name ||
              updatedFromApi.callerName ||
              updatedFromApi.caller_name ||
              updatedFromApi.fullName ||
              "",
            fullName:
              updatedFromApi.fullName ||
              updatedFromApi.name ||
              updatedFromApi.callerName ||
              updatedFromApi.caller_name ||
              "",
            phone:
              updatedFromApi.phone ||
              updatedFromApi.phoneNumber ||
              updatedFromApi.phone_number ||
              "",
            assignedDepartment:
              updatedFromApi.assignedDepartment ||
              updatedFromApi.department ||
              inferDepartmentFromCategory(updatedFromApi.category),
          },
          sessionUserName
        );

        const syncedTickets = prevSnapshot.map((t) =>
          t.id === ticketId ? normalizedUpdated : t
        );

        setTickets(syncedTickets);

        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(normalizedUpdated);
        }
      }

      window.dispatchEvent(new Event("tickets-changed"));
      toast.success(isFR ? "Ticket mis à jour." : "Ticket updated.");
    } catch (e) {
      setTickets(prevSnapshot);
      if (selectedTicket?.id === ticketId) setSelectedTicket(current);
      toast.error(
        e?.message || (isFR ? "Échec de la mise à jour." : "Update failed. Please try again.")
      );
    }
  };

  const deleteTicket = async (ticketId, patch) => {
    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error(isFR ? "Ticket introuvable." : "Ticket not found.");
      return;
    }

    const reason = patch?.deletedReason || patch?.deleteComment || patch?.reason || "No reason provided";

    const safePatch = {
      ...(patch || {}),
      status: "DELETE",
      deletedReason: reason,
      deleteComment: patch?.deleteComment || reason,
      deletedAt: patch?.deletedAt || new Date().toISOString(),
      deletedByName: patch?.deletedByName || sessionUserName,
      deletedByRole: patch?.deletedByRole || "SUPERVISOR",
    };

    await updateTicket(ticketId, safePatch);
  };

  const onDonutLegendClick = ({ ringId, label }) => {
    const ring = String(ringId || "").toUpperCase();
    const lab = String(label || "").toUpperCase();

    if (ring === "OUTER") {
      if (lab === "VOICE BOT") setChartFilter({ type: "SOURCE", value: "VOICE_BOT" });
      else if (lab === "HUMAN") setChartFilter({ type: "SOURCE", value: "HUMAN" });
      else setChartFilter(null);
    } else if (ring === "INNER") {
      setChartFilter({ type: "STATUS", value: lab });
    }
  };

  const sessionName = low(sessionUserName);

  const roleVisibleTickets = useMemo(() => {
    if (sessionRoleUpper !== "SUPERVISOR") {
      return tickets.filter((t) => !isPureVoiceBotTicket(t));
    }
    return tickets;
  }, [tickets, sessionRoleUpper]);

  const qoCounts = useMemo(() => {
    const upper = (x) => String(x || "").toUpperCase();
    const visible = roleVisibleTickets || [];

    const needsReview = visible.filter(
      (t) => upper(t?.status) === "NEEDS_REVIEW" && !isRejectedTicket(t)
    ).length;
    const escalated = visible.filter(
      (t) => upper(t?.status) === "ESCALATED" && !isRejectedTicket(t)
    ).length;
    const resolved = visible.filter((t) => upper(t?.status) === "RESOLVED").length;
    const active = visible.filter(
      (t) =>
        upper(t?.status) !== "RESOLVED" &&
        upper(t?.status) !== "DELETE" &&
        !isRejectedTicket(t)
    ).length;
    const overdue = visible.filter(
      (t) =>
        t?.isOverdue === true &&
        upper(t?.status) !== "RESOLVED" &&
        upper(t?.status) !== "DELETE" &&
        !isRejectedTicket(t)
    ).length;

    return { visible: visible.length, needsReview, escalated, resolved, active, overdue };
  }, [roleVisibleTickets]);

  const parseTicketDate = (createdAt) => {
    const s = String(createdAt || "").trim();
    if (!s) return null;
    const isoish = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(isoish);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatAge = (createdAt) => {
    const d = parseTicketDate(createdAt);
    if (!d) return "—";
    const ms = Date.now() - d.getTime();
    const mins = Math.max(0, Math.floor(ms / 60000));
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const qoRecentActivity = useMemo(() => {
    const list = [...(roleVisibleTickets || [])];
    list.sort(compareNewestTickets);
    return list.slice(0, 6);
  }, [roleVisibleTickets]);

  const laneTickets = useMemo(() => {
    const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";
    const isResolved = (t) => (t?.status || "").toUpperCase() === "RESOLVED";
    const isBotOnlyPendingApproval = (t) => {
      const stage = String(t?.workflowStage || "").toUpperCase();
      const legacyPending =
        isPureVoiceBotTicket(t) && !isApproved(t) && !isResolved(t) && !isRejectedTicket(t);
      return stage === "PENDING_APPROVAL" || stage === "PENDING_SUPERVISOR_APPROVAL" || legacyPending;
    };

    let base = roleVisibleTickets;

    const isSupervisor = sessionRoleUpper === "SUPERVISOR";

    base = base.filter((t) => {
      if (isSupervisor) return true;
      const handled = low(t?.handledByName) === sessionName;
      const legacy = low(t?.createdByName) === sessionName;
      return handled || legacy;
    });

    switch (queueFilter) {
      case "APPROVAL":
        return sessionRoleUpper === "SUPERVISOR" ? base.filter(isBotOnlyPendingApproval) : [];
      case "MINE":
        return base.filter((t) => low(t?.handledByName) === sessionName || low(t?.createdByName) === sessionName);
      case "NEW":
        return base.filter((t) => String(t?.status || "").toUpperCase() === "NEW");
      case "REJECTED":
        return base.filter(isRejectedTicket);
      case "DELETE":
        return base.filter((t) => String(t?.status || "").toUpperCase() === "DELETE");
      case "ESCALATED":
        return base.filter((t) => String(t?.status || "").toUpperCase() === "ESCALATED");
      case "RESOLVED":
        return base.filter(isResolved);
      case "ALL_TICKETS":
        return base;
      case "ALL":
      default:
        return base.filter(
          (t) =>
            !isResolved(t) &&
            String(t?.status || "").toUpperCase() !== "DELETE" &&
            !isRejectedTicket(t)
        );
    }
  }, [roleVisibleTickets, queueFilter, sessionRoleUpper, sessionName]);

  const laneStats = useMemo(() => {
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";

    // Always use the same visibility filter as laneTickets regardless of ticketView,
    // so that badge counts match what actually appears when the filter is clicked.
    const base = (roleVisibleTickets || []).filter((t) => {
      if (isSupervisor) return true;
      const createdBy = low(t?.createdByName);
      const handledBy = low(t?.handledByName);
      return createdBy === sessionName || handledBy === sessionName;
    });

    const isDeleted = (t) => String(t?.status || "").toUpperCase() === "DELETE";
    const isNew = (t) => String(t?.status || "").toUpperCase() === "NEW";
    const isEscalated = (t) => String(t?.status || "").toUpperCase() === "ESCALATED";
    const isResolvedLocal = (t) => String(t?.status || "").toUpperCase() === "RESOLVED";

    const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";
    const isPureVoiceBot = (t) =>
      String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" &&
      String(t?.handledByRole || "").toUpperCase() === "VOICE_BOT" &&
      String(t?.handledByType || "").toUpperCase() === "VOICE_BOT";
    const isBotOnlyPendingApproval = (t) => {
      const stage = String(t?.workflowStage || "").toUpperCase();
      const legacyPending =
        isPureVoiceBot(t) && !isApproved(t) && !isResolvedLocal(t) && !isRejectedTicket(t);
      return stage === "PENDING_APPROVAL" || stage === "PENDING_SUPERVISOR_APPROVAL" || legacyPending;
    };

    const approval = sessionRoleUpper === "SUPERVISOR" ? base.filter(isBotOnlyPendingApproval).length : 0;

    const mine = base
      .filter((t) => low(t?.handledByName) === sessionName || low(t?.createdByName) === sessionName)
      .filter((t) => !isResolvedLocal(t) && !isDeleted(t) && !isRejectedTicket(t)).length;

    return {
      new: base.filter((t) => isNew(t) && !isDeleted(t) && !isRejectedTicket(t)).length,
      approval,
      rejected: base.filter(isRejectedTicket).length,
      delete: base.filter(isDeleted).length,
      mine,
      escalated: base.filter((t) => isEscalated(t) && !isDeleted(t) && !isRejectedTicket(t)).length,
      resolved: base.filter(isResolvedLocal).length,
      allActive: base.filter((t) => !isResolvedLocal(t) && !isDeleted(t) && !isRejectedTicket(t)).length,
      showApproval: sessionRoleUpper === "SUPERVISOR",
    };
  }, [roleVisibleTickets, sessionName, sessionRoleUpper, ticketView]);

  const allSystemTickets = useMemo(() => tickets, [tickets]);
  const historyTickets = useMemo(() => allSystemTickets, [allSystemTickets]);

  const deletedTickets = useMemo(() => {
    return (allSystemTickets || []).filter((t) => String(t?.status || "").toUpperCase() === "DELETE");
  }, [allSystemTickets]);

  const filteredTickets = useMemo(() => {
    let base = ticketView === "HISTORY" || ticketView === "DELETED" ? historyTickets : laneTickets;

    if (ticketView === "HISTORY") {
      const isResolved = (t) => String(t?.status || "").toUpperCase() === "RESOLVED";
      const isDeleted = (t) => String(t?.status || "").toUpperCase() === "DELETE";
      const involved = (t) => low(t?.createdByName) === sessionName || low(t?.handledByName) === sessionName;

      switch (queueFilter) {
        case "MINE":
          base = base.filter(involved);
          break;
        case "ESCALATED":
          base = base.filter((t) => String(t?.status || "").toUpperCase() === "ESCALATED");
          break;
        case "REJECTED":
          base = base.filter(isRejectedTicket);
          break;
        case "RESOLVED":
          base = base.filter(isResolved);
          break;
        case "ALL":
          base = base.filter((t) => !isResolved(t) && !isDeleted(t) && !isRejectedTicket(t));
          break;
        case "ALL_TICKETS":
        default:
          break;
      }
    }

    let chartFiltered = base;
    if (chartFilter?.type === "SOURCE") {
      chartFiltered = base.filter((t) => {
        const created = String(t?.createdByType || "").toUpperCase();
        if (chartFilter.value === "VOICE_BOT") return created === "VOICE_BOT";
        if (chartFilter.value === "HUMAN") return created !== "VOICE_BOT";
        return true;
      });
    } else if (chartFilter?.type === "STATUS") {
      const value = String(chartFilter.value || "").toUpperCase();

      chartFiltered = base.filter((t) => {
        if (value === "REJECTED") return isRejectedTicket(t);
        return String(t?.status || "").toUpperCase() === value;
      });
    }

    let chipFiltered = chartFiltered;
    if (chips.needsReview) {
      chipFiltered = chipFiltered.filter(
        (t) => String(t?.status || "").toUpperCase() === "NEEDS_REVIEW" && !isRejectedTicket(t)
      );
    }
    if (chips.escalated) {
      chipFiltered = chipFiltered.filter(
        (t) => String(t?.status || "").toUpperCase() === "ESCALATED" && !isRejectedTicket(t)
      );
    }
    const q = low(searchQuery);
    if (!q) return [...chipFiltered].sort(compareNewestTickets);

    return chipFiltered.filter((t) => {
      const hay = [
        t?.ticketNumber,
        t?.name,
        t?.fullName,
        t?.phone,
        t?.location,
        t?.category,
        t?.description,
        t?.createdByName,
        t?.handledByName,
      ]
        .map((x) => low(x))
        .join(" | ");
      return hay.includes(q);
    }).sort(compareNewestTickets);
  }, [laneTickets, historyTickets, searchQuery, chips, chartFilter, ticketView, queueFilter, sessionName]);

  const recentTicketsLimited = useMemo(() => {
    const isDeleted = (t) => String(t?.status || "").toUpperCase() === "DELETE";
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";

    const involved = (t) => low(t?.createdByName) === sessionName || low(t?.handledByName) === sessionName;

    const base = filteredTickets.filter(
      (t) => (isSupervisor || involved(t)) && !isDeleted(t) && !isRejectedTicket(t)
    );

    const sorted = [...base].sort(compareNewestTickets);

    return sorted.slice(0, 20);
  }, [filteredTickets, sessionName, sessionRoleUpper]);

  const deletedTicketsFiltered = useMemo(() => {
    return (filteredTickets || []).filter((t) => String(t?.status || "").toUpperCase() === "DELETE");
  }, [filteredTickets]);

  const deletedByYear = useMemo(() => {
    const parseYear = (createdAt) => {
      const str = String(createdAt || "");
      const iso = str.includes("T") ? str : str.replace(" ", "T");
      const d = new Date(iso);
      const y = Number.isNaN(d.getTime()) ? null : d.getFullYear();
      return y;
    };

    const counts = {};
    for (const t of deletedTickets) {
      const y = parseYear(t?.createdAt) ?? "Unknown";
      counts[y] = (counts[y] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([year, count]) => ({ year: String(year), count }))
      .sort((a, b) => Number(b.year) - Number(a.year));
  }, [deletedTickets]);

  const systemDonutStats = useMemo(() => {
    const base = historyTickets || [];
    const totalCount = base.length;

    const voiceBotCount = base.filter((t) => (t?.createdByType || "").toUpperCase() === "VOICE_BOT").length;
    const humanCount = Math.max(0, totalCount - voiceBotCount);

    const outerSegments = [
      { label: "Voice Bot", value: voiceBotCount },
      { label: "Human", value: humanCount },
    ].filter((x) => x.value > 0);

    const statusCounts = base.reduce((acc, t) => {
      const s = isRejectedTicket(t) ? "REJECTED" : String(t?.status || "NEW").toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const innerSegments = [
      { label: "NEW", value: statusCounts.NEW || 0 },
      { label: "NEEDS_REVIEW", value: statusCounts.NEEDS_REVIEW || 0 },
      { label: "ESCALATED", value: statusCounts.ESCALATED || 0 },
      { label: "REJECTED", value: statusCounts.REJECTED || 0 },
      { label: "RESOLVED", value: statusCounts.RESOLVED || 0 },
      { label: "DELETE", value: statusCounts.DELETE || 0 },
      {
        label: "OTHER",
        value: Math.max(
          0,
          totalCount -
            (statusCounts.NEW || 0) -
            (statusCounts.NEEDS_REVIEW || 0) -
            (statusCounts.ESCALATED || 0) -
            (statusCounts.REJECTED || 0) -
            (statusCounts.RESOLVED || 0) -
            (statusCounts.DELETE || 0)
        ),
      },
    ].filter((x) => x.value > 0);

    return { totalCount, outerSegments, innerSegments };
  }, [historyTickets]);

  const myAllDonutStats = useMemo(() => {
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";

    const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";
    const isResolved = (t) => String(t?.status || "").toUpperCase() === "RESOLVED";
    const isBotOnlyPendingApproval = (t) => {
      const stage = String(t?.workflowStage || "").toUpperCase();
      const legacyPending =
        isPureVoiceBotTicket(t) && !isApproved(t) && !isResolved(t) && !isRejectedTicket(t);
      return stage === "PENDING_APPROVAL" || stage === "PENDING_SUPERVISOR_APPROVAL" || legacyPending;
    };

    const mineAll = (historyTickets || []).filter((t) => {
      const created = low(t?.createdByName) === sessionName;
      const handled = low(t?.handledByName) === sessionName;
      const supervisorWorkItem = isSupervisor && isBotOnlyPendingApproval(t);
      return created || handled || supervisorWorkItem;
    });

    const totalCount = mineAll.length;

    const voiceBotCount = mineAll.filter((t) => (t?.createdByType || "").toUpperCase() === "VOICE_BOT").length;
    const humanCount = Math.max(0, totalCount - voiceBotCount);

    const outerSegments = [
      { label: "Voice Bot", value: voiceBotCount },
      { label: "Human", value: humanCount },
    ].filter((x) => x.value > 0);

    const statusCounts = mineAll.reduce((acc, t) => {
      const s = isRejectedTicket(t) ? "REJECTED" : String(t?.status || "NEW").toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const innerSegments = [
      { label: "NEW", value: statusCounts.NEW || 0 },
      { label: "NEEDS_REVIEW", value: statusCounts.NEEDS_REVIEW || 0 },
      { label: "ESCALATED", value: statusCounts.ESCALATED || 0 },
      { label: "REJECTED", value: statusCounts.REJECTED || 0 },
      { label: "RESOLVED", value: statusCounts.RESOLVED || 0 },
      { label: "DELETE", value: statusCounts.DELETE || 0 },
      {
        label: "OTHER",
        value: Math.max(
          0,
          totalCount -
            (statusCounts.NEW || 0) -
            (statusCounts.NEEDS_REVIEW || 0) -
            (statusCounts.ESCALATED || 0) -
            (statusCounts.REJECTED || 0) -
            (statusCounts.RESOLVED || 0) -
            (statusCounts.DELETE || 0)
        ),
      },
    ].filter((x) => x.value > 0);

    return { totalCount, outerSegments, innerSegments };
  }, [historyTickets, sessionName, sessionRoleUpper]);

  const duplicateByTicketId = useMemo(() => {
    const map = {};
    for (const candidate of duplicateCandidates || []) {
      const score = Number(candidate?.matchScore || 0);
      if (score < 60) continue;
      const childId = candidate.ticketId || candidate.duplicate?.ticketId || candidate.duplicate?.id;
      const parentId =
        candidate.candidateTicketId ||
        candidate.original?.ticketId ||
        candidate.original?.id;
      if (!childId || !parentId || childId === parentId) continue;

      const item = {
        id: candidate.id,
        status: candidate.status,
        matchScore: score,
        parentTicketId: parentId,
        similarTicketId: parentId,
      };

      const existing = map[childId];
      if (
        !existing ||
        (existing.status !== "pending" && item.status === "pending") ||
        score > Number(existing.matchScore || 0)
      ) {
        map[childId] = item;
      }

      const reverseItem = { ...item, parentTicketId: childId, similarTicketId: childId };
      const reverseExisting = map[parentId];
      if (
        !reverseExisting ||
        (reverseExisting.status !== "pending" && reverseItem.status === "pending") ||
        score > Number(reverseExisting.matchScore || 0)
      ) {
        map[parentId] = reverseItem;
      }
    }
    return map;
  }, [duplicateCandidates]);

  const handleMergeDuplicateFromQueue = useCallback(
    async (duplicateId) => {
      if (!duplicateId) return;
      try {
        await mergeDuplicate(duplicateId, sessionUserName || "Supervisor");
        await loadTickets();
        await loadDuplicateCandidates();
        window.dispatchEvent(new Event("tickets-changed"));
        toast.success("Duplicate ticket merged.");
      } catch (e) {
        console.error("[API mode] mergeDuplicate failed:", e);
        toast.error(e?.message || "Unable to merge duplicate.");
      }
    },
    [sessionUserName, loadTickets, loadDuplicateCandidates, toast]
  );

  const emptyMessage = useMemo(() => {
    if ((laneTickets || []).length === 0) return isFR ? "Aucun ticket dans cette file." : "No tickets in this lane yet.";
    return isFR ? "Aucun ticket ne correspond aux filtres." : "No tickets match your filters/search. Try clearing filters.";
  }, [laneTickets, isFR]);

  const emptyHistoryMessage = useMemo(() => {
    if ((historyTickets || []).length === 0) return isFR ? "Aucun ticket dans le système." : "No tickets found in the system yet.";
    return isFR ? "Aucun ticket ne correspond." : "No tickets match your filters/search.";
  }, [historyTickets, isFR]);

  const isReadOnlyBucket = ticketView === "HISTORY" || ticketView === "DELETED";

  return (
    <>
      <ErrorBanner message={ticketsError} onRetry={loadTickets} />

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {isFR ? "Session actuelle" : "Current session"}: <b>{sessionUserName}</b> ({sessionUserRole})
        </div>

        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: "#9ca3af", cursor: "pointer" }}>
            {isFR ? "Diagnostics" : "Session diagnostics"}
          </summary>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
            {isFR ? "Dernier transfert" : "Last handoff"}: {JSON.stringify(lastHandoff)}
          </div>
        </details>
      </div>

      {activeView === "MANUAL_TICKET" && (
        <div id="manual-ticket-intake" className="card" style={{ marginTop: 12, scrollMarginTop: 92 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>{isFR ? "Saisie manuelle" : "Manual Ticket Intake"}</h3>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {isFR
                  ? "Créer un ticket au nom d’un citoyen (file opérateur)."
                  : "Create a new ticket on behalf of a citizen (human operator lane)."}
              </div>
            </div>

            {loadingManualSubmit && (
              <div className="pill">{isFR ? "Soumission…" : "Submitting…"}</div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <TicketForm
              form={form}
              setForm={setForm}
              onSubmit={submitTicket}
              draftTicketNumber={draftTicketNumber}
              onConsumeDraftNumber={consumeManualDraftNumber}
            />
          </div>
        </div>
      )}

      {activeView === "QUEUE_OVERVIEW" && (
        <QueueOverviewPanel
          tickets={roleVisibleTickets}
          isFR={isFR}
          userName={sessionUserName}
          userRole={sessionUserRole}
          loadingTickets={loadingTickets}
          ticketsError={ticketsError}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={handleRefresh}
          onRowClick={handleRowClick}
          onNavigate={(path, state) => nav(path, state)}
          qoCounts={qoCounts}
          qoRecentActivity={qoRecentActivity}
          systemDonutStats={systemDonutStats}
          myAllDonutStats={myAllDonutStats}
        />
      )}

      {activeView === "MY_WORK_QUEUE" && (
        <div id="my-work-queue" className="card" style={{ marginTop: 12, scrollMarginTop: 92 }}>
          <div className="bucketHeader">
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 2 }}>
                {ticketView === "RECENT"
                  ? isFR
                    ? "Ma file de travail"
                    : "My Work Queue"
                  : ticketView === "HISTORY"
                  ? isFR
                    ? "Registre système"
                    : "System Ticket Registry"
                  : ticketView === "DELETED"
                  ? isFR
                    ? "Journal d’audit (supprimés)"
                    : "Audit Log (Deleted Tickets)"
                  : isFR
                  ? "Analytique & rapports"
                  : "Analytics & Reporting"}
              </h3>

              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
                {ticketView === "RECENT"
                  ? isFR
                    ? "20 derniers tickets (hors supprimés)."
                    : "Latest 20 tickets you created or handled (excluding deleted)."
                  : ticketView === "HISTORY"
                  ? isFR
                    ? "Tous les tickets (résolus + supprimés inclus)."
                    : "All tickets in the system (includes resolved + deleted)."
                  : ticketView === "DELETED"
                  ? isFR
                    ? "Tous les tickets supprimés (audit + tendances)."
                    : "All deleted tickets (for audit + trend review)."
                  : isFR
                  ? "Filtrer, exporter et voir les tendances."
                  : "Filter a date range, export data, and view trends."}
              </p>
            </div>

            <div className="bucketSwitcher">
              <TicketViewDropdown value={ticketView} onChange={setTicketView} />
            </div>
          </div>

          {ticketView !== "REPORTS" && (
            <>
              <TicketTableControls
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                chips={chips}
                onToggleChip={toggleChip}
                onClearAll={clearAllFilters}
                queueFilter={queueFilter}
                onChangeQueueFilter={handleQueueFilterChange}
                laneStats={laneStats}
                showLaneFilters={true}
              />

              {ticketView === "DELETED" && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch" }}>
                    <div
                      style={{
                        flex: "1 1 260px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        padding: 12,
                        background: "#fbfbff",
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>{isFR ? "Suppression par année" : "Deleted tickets by year"}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{isFR ? "Vue rapide d’audit." : "Quick audit view of delete frequency."}</div>

                      {deletedByYear.length === 0 ? (
                        <div style={{ fontSize: 13, color: "#94a3b8" }}>{isFR ? "Aucun ticket supprimé." : "No deleted tickets yet."}</div>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {deletedByYear.map((x) => (
                            <div
                              key={x.year}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                fontSize: 13,
                              }}
                            >
                              <div style={{ fontWeight: 800 }}>{x.year}</div>
                              <div style={{ fontWeight: 900 }}>{x.count}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {ticketView === "REPORTS" ? (
            <TicketReportsPanel tickets={historyTickets} />
          ) : (
            <TicketTable
              tickets={
                ticketView === "HISTORY"
                  ? filteredTickets
                  : ticketView === "DELETED"
                  ? deletedTicketsFiltered
                  : queueFilter === "ALL" || queueFilter === "ALL_TICKETS"
                  ? recentTicketsLimited
                  : filteredTickets
              }
              loading={loadingTickets}
              loadingLabel={isFR ? "Actualisation…" : "Refreshing…"}
              emptyMessage={
                ticketView === "HISTORY"
                  ? emptyHistoryMessage
                  : ticketView === "DELETED"
                  ? isFR
                    ? "Aucun ticket supprimé."
                    : "No deleted tickets found."
                  : emptyMessage
              }
              mode={isReadOnlyBucket ? "readonly" : "operator"}
              sessionRole={sessionRoleUpper}
              sessionName={sessionUserName}
              onApprove={isReadOnlyBucket ? undefined : approveTicket}
              duplicateByTicketId={duplicateByTicketId}
              onMergeDuplicate={isReadOnlyBucket ? undefined : handleMergeDuplicateFromQueue}
              onDuplicateTicketClick={(targetTicketId) =>
                nav(`/dashboard/ticket/${encodeURIComponent(targetTicketId)}`, {
                  state: { backTo: ticketView === "HISTORY" ? "/dashboard/overview" : "/dashboard/my-work" },
                })
              }
              onRowClick={handleRowClick}
              backTo={ticketView === "HISTORY" ? "/dashboard/overview" : "/dashboard/my-work"}
            />
          )}
        </div>
      )}

      {activeView === "MY_WORK_QUEUE" && (
        <Floating311Button
          label={isFR ? "Parler au 311" : "Talk to ISA"}
          tooltip={isFR ? "Parler avec l'assistant vocal ISA" : "Talk to the ISA voice assistant"}
        />
      )}

      <TicketDetailsDrawer
        open={drawerOpen}
        ticket={selectedTicket}
        onClose={() => setDrawerOpen(false)}
        mode={isReadOnlyBucket ? "readonly" : "operator"}
        sessionRole={sessionRoleUpper}
        sessionName={sessionUserName}
        readOnly={isReadOnlyBucket}
        onApprove={isReadOnlyBucket ? undefined : approveTicket}
        onReject={isReadOnlyBucket ? undefined : rejectTicket}
        onUpdate={isReadOnlyBucket ? undefined : updateTicket}
        onDelete={isReadOnlyBucket ? undefined : deleteTicket}
      />
    </>
  );
}

function KpiCard({ title, value, sub, onClick }) {
  const clickable = typeof onClick === "function";

  return (
    <button
      type="button"
      className={`card kpiCard ${clickable ? "isClickable" : ""}`}
      onClick={onClick}
      disabled={!clickable}
      aria-disabled={!clickable}
    >
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
      <div className="kpiSub">{sub}</div>
    </button>
  );
}