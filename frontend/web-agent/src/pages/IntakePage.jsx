// src/pages/IntakePage.jsx
import { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";

// localStorage-backed ticket store (prototype)
import {
  getTickets as getStoredTickets,
  setTickets as setStoredTickets,
} from "../utils/ticketStore";

import TicketForm from "../components/TicketForm";
import TicketTable from "../components/TicketTable";
import TicketDetailsDrawer from "../components/TicketDetailsDrawer";
import DonutChart from "../components/DonutChart";
import TicketReportsPanel from "../components/TicketReportsPanel";
import TicketViewDropdown from "../components/TicketViewDropdown";

// controls + toast
import TicketTableControls from "../components/TicketTableControls";
import { useToast } from "../components/Toast";

// routing imports
import { OPERATORS, SUPERVISOR } from "../data/operators";
import { decideHandoffTarget } from "../utils/routing";

import { inferDepartmentFromCategory } from "../utils/categoryRouting";

// serial ticket number utils
import {
  initTicketSequence,
  consumeNextTicketNumber,
  ensureSequenceAtLeast,
} from "../utils/ticketNumber";

// ✅ API (will fail until backend exists, but we handle mock-mode gracefully)
import { fetchTickets } from "../api/tickets";
// OPTIONAL (when backend is wired):
// import { approveTicket as approveTicketApi, updateTicket as updateTicketApi } from "../api/tickets";

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

  // ✅ IMPORTANT: NEEDS_REVIEW is reserved for Supervisor approval only.
  // Low confidence is represented ONLY via `confidence`, not status.
  const status = "NEW";

  const priority = text.includes("danger") || text.includes("hazard") ? "HIGH" : "MEDIUM";

  return { category, location, confidence, status, priority };
}

/**
 * ✅ normalizeTicket
 * Required patch: bot-only legacy/mock tickets MUST become NEEDS_REVIEW
 * so Supervisor approval lane + counts work consistently.
 */
function normalizeTicket(t, fallbackAssignee = "") {
  const createdNameRaw = String(t?.createdByName || fallbackAssignee || "");
  const handledNameRaw = String(t?.handledByName || "");

  // ✅ IMPORTANT: Do NOT infer VoiceBot just because `channel` mentions "voice".
  // Only treat as bot-created when explicit types exist OR creator/handler names indicate VoiceBot.
  const createdTypeUpper = String(t?.createdByType || "").toUpperCase();
  const handledTypeUpper = String(t?.handledByType || "").toUpperCase();

  const looksLikeBot =
    createdTypeUpper === "VOICE_BOT" ||
    handledTypeUpper === "VOICE_BOT" ||
    createdNameRaw.toLowerCase().includes("voicebot") ||
    handledNameRaw.toLowerCase().includes("voicebot");

  const createdType = t?.createdByType || (looksLikeBot ? "VOICE_BOT" : "OPERATOR");
  const createdName = createdNameRaw;

  // ✅ Always derive department from category when missing.
  const assignedDepartment = t?.assignedDepartment ?? inferDepartmentFromCategory(t?.category);

  // ✅ Enterprise workflow stage (UI-only until backend integration)
  const routingUpper = String(t?.routingStatus || "").toUpperCase();
  const createdUpper = String(createdType || "").toUpperCase();
  const derivedHandledRole = String(
    t?.handledByRole || (createdUpper === "VOICE_BOT" ? "VOICE_BOT" : "OPERATOR")
  ).toUpperCase();
  const derivedHandledType = String(
    t?.handledByType || (createdUpper === "VOICE_BOT" ? "VOICE_BOT" : "OPERATOR")
  ).toUpperCase();

  const derivedPureBot =
    createdUpper === "VOICE_BOT" &&
    derivedHandledRole === "VOICE_BOT" &&
    derivedHandledType === "VOICE_BOT";

  const incomingWorkflowStage = String(t?.workflowStage || "").toUpperCase();
  const rejectedLike =
    routingUpper === "REJECTED" ||
    incomingWorkflowStage === "REJECTED" ||
    incomingWorkflowStage === "REJECTED_BY_SUPERVISOR";

  // ✅ Workflow stage rules (UI-only)
  // - Bot-only tickets require Supervisor approval: PENDING_APPROVAL
  // - After approval: ROUTED_TO_DEPARTMENT
  // - Rejected tickets: preserve rejection stage
  // - Everything else: STANDARD
  const workflowStage =
    t?.workflowStage ||
    (rejectedLike
      ? "REJECTED_BY_SUPERVISOR"
      : routingUpper === "APPROVED"
      ? "ROUTED_TO_DEPARTMENT"
      : derivedPureBot
      ? "PENDING_APPROVAL"
      : "STANDARD");

  // ✅ FIX: Preserve rejected tickets as REJECTED
  // ✅ FIX: Force bot-only tickets to NEEDS_REVIEW unless RESOLVED/DELETE/REJECTED
  const statusUpper = String(t?.status || "").toUpperCase();
  const derivedStatus = rejectedLike
    ? "REJECTED"
    : derivedPureBot && statusUpper !== "RESOLVED" && statusUpper !== "DELETE"
    ? "NEEDS_REVIEW"
    : t?.status || "NEW";

  // --- Session history normalization (supports old + new formats) ---
  const baseTime = t?.createdAt || t?.created_at || t?.created || new Date().toISOString();

  const normalizedSessionHistory = Array.isArray(t?.sessionHistory)
    ? t.sessionHistory
        .map((m, idx) => {
          if (!m) return null;

          const speaker = String(m.speaker || m.from || m.role || "System").trim();
          const text = String(m.text || m.message || m.content || "").trim();

          // if "at" missing, derive something stable-ish
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
    id: t?.id || t?.ticketNumber || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: derivedStatus,

    createdByType: createdType,
    createdByName: createdName,
    createdByRole: t?.createdByRole || "OPERATOR",

    handledByType: t?.handledByType || (createdType === "VOICE_BOT" ? "VOICE_BOT" : "OPERATOR"),
    handledByRole: t?.handledByRole || (createdType === "VOICE_BOT" ? "VOICE_BOT" : "OPERATOR"),
    handledByName: t?.handledByName || createdName || fallbackAssignee || "",

    escalatedToRole: t?.escalatedToRole || null,
    escalatedToName: t?.escalatedToName || null,
    escalationReason: t?.escalationReason || null,

    routingStatus: t?.routingStatus || (derivedPureBot ? "PENDING_APPROVAL" : "ROUTED"),
    workflowStage,
    assignedDepartment,
    approvedAt: t?.approvedAt || null,

    // ✅ ADD THIS (so SessionHistory actually renders)
    sessionHistory: normalizedSessionHistory,

    tone: t?.tone || "UNKNOWN",
    toneConfidence: t?.toneConfidence || "LOW",
    toneSource: t?.toneSource || "AI",
  };
}

// ✅ shared helper: pure voice-bot-only ticket detector (case-safe)
function isPureVoiceBotTicket(t) {
  const createdByType = String(t?.createdByType || "").toUpperCase();
  const handledByRole = String(t?.handledByRole || "VOICE_BOT").toUpperCase();
  const handledByType = String(t?.handledByType || "VOICE_BOT").toUpperCase();
  return createdByType === "VOICE_BOT" && handledByRole === "VOICE_BOT" && handledByType === "VOICE_BOT";
}

// ✅ shared helper: rejected ticket detector
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

function extractSeq(ticketNumber) {
  const m = String(ticketNumber || "").match(/311-\d{4}-(\d{6})$/);
  return m ? Number(m[1]) : null;
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
  // DashboardLayout provides { lang } via Outlet context
  const outlet = useOutletContext?.() || {};
  const lang = outlet?.lang || "EN";
  const isFR = lang === "FR";

  // ✅ Session is owned by DashboardLayout; fall back to local storage for safety
  const outletUserName = outlet?.userName;
  const outletUserRole = outlet?.userRole;

  const nav = useNavigate();
  const loc = useLocation();

  // ✅ Row open handler (TicketTable now passes: (ticket, backTo))
  const handleRowClick = useCallback(
    (t, backTo) => {
      const id = t?.ticketNumber || t?.id;
      if (!id) return;

      // If parent didn't pass a backTo, fall back to current route.
      const safeBackTo = backTo || `${loc.pathname}${loc.search || ""}`;

      nav(`/dashboard/ticket/${encodeURIComponent(id)}`, {
        state: { ticket: t, backTo: safeBackTo },
      });
    },
    [nav, loc.pathname, loc.search]
  );

  // Map route view -> internal section
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

  // ✅ Prefer Outlet-provided session when available (prevents role drift)
  const sessionUserName = outletUserName || userName;
  const sessionUserRole = outletUserRole || userRole;
  const sessionRoleUpper = String(sessionUserRole || "OPERATOR").toUpperCase();

  const [queueFilter, setQueueFilter] = useState("ALL");
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [chips, setChips] = useState({ needsReview: false, escalated: false });

  const [chartFilter, setChartFilter] = useState(null);

  // ✅ Ticket bucket switcher (Recent / History / Reports / Deleted) — only relevant for My Work Queue view
  const [ticketView, setTicketView] = useState("RECENT");

  // ✅ Optional: coming from Queue Overview KPI click (navigates to My Work Queue with a preset)
  useEffect(() => {
    const preset = loc?.state?.queuePreset;
    if (!preset) return;

    // Reset quick filters
    setSearchQuery("");
    setChartFilter(null);

    // Map presets to existing queue filters
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
      // NEW / IN_PROGRESS / DELETE / MINE / REJECTED / etc.
      setTicketView("RECENT");
      setQueueFilter(preset);
      setChips({ needsReview: false, escalated: false });
    }

    // Clear navigation state so it doesn't re-apply on refresh
    nav(loc.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.state?.queuePreset]);

  useEffect(() => {
    // In System Registry, default should show ALL tickets (including resolved/deleted)
    if (ticketView === "HISTORY" && queueFilter === "ALL") setQueueFilter("ALL_TICKETS");
    // When returning to My Work Queue, restore the default "All Active" behavior
    if (ticketView === "RECENT" && queueFilter === "ALL_TICKETS") setQueueFilter("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketView]);

  // seed normalized tickets from local store (seeded from mockTickets)
  const [tickets, setTickets] = useState(() =>
    (getStoredTickets() || []).map((t, idx) => {
      const seededCreator = idx % 2 === 0 ? "Jerry" : "Tom";
      return normalizeTicket(t, seededCreator);
    })
  );

  // ✅ central fetch function (Retry + initial load)
  // ✅ MOCK-FIRST: If VITE_API_BASE_URL is missing, do NOT call API and do NOT show error UI
  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setTicketsError("");

    initTicketSequence(1);

    const apiBase = String(import.meta?.env?.VITE_API_BASE_URL || "").trim();

    const normalizedMock = (getStoredTickets() || []).map((t, idx) =>
      normalizeTicket(t, idx % 2 === 0 ? "Jerry" : "Tom")
    );

    const maxFromMock = Math.max(
      0,
      ...normalizedMock
        .map((t) => extractSeq(t.ticketNumber))
        .filter((n) => typeof n === "number" && !Number.isNaN(n))
    );
    ensureSequenceAtLeast(maxFromMock + 1);

    if (!apiBase) {
      setTickets(normalizedMock);
      setStoredTickets(normalizedMock);
      setTicketsError("");
      setLastRefreshedAt(new Date());
      setLoadingTickets(false);
      return;
    }

    try {
      const apiTickets = await fetchTickets();

      const normalizedApi = (apiTickets || []).map((t, idx) =>
        normalizeTicket(t, idx % 2 === 0 ? "Jerry" : "Tom")
      );

      const maxFromApi = Math.max(
        0,
        ...normalizedApi
          .map((t) => extractSeq(t.ticketNumber))
          .filter((n) => typeof n === "number" && !Number.isNaN(n))
      );
      ensureSequenceAtLeast(Math.max(maxFromMock, maxFromApi) + 1);

      setTickets(normalizedApi);
      setStoredTickets(normalizedApi);
      setTicketsError("");
    } catch (e) {
      console.warn("[Mock mode] fetchTickets failed:", e);
      setTickets(normalizedMock);
      setTicketsError("");
    } finally {
      setLoadingTickets(false);
      setLastRefreshedAt(new Date());
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await loadTickets();
    toast.success(isFR ? `Mis à jour à ${nowStamp()}` : `Updated at ${nowStamp()}`);
  }, [loadTickets, toast, isFR]);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draftTicketNumber, setDraftTicketNumber] = useState(() => consumeNextTicketNumber());

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
    phone: "",
    location: "",
    category: "",
    description: "",
    priority: "MEDIUM",
    status: "NEW",
    confidence: "MEDIUM",
    channel: "phone (human operator)",
    assignedDepartment: "",
    tone: "UNKNOWN",
    toneConfidence: "LOW",
    toneSource: "HUMAN",
  });

  const consumeManualDraftNumber = () => {
    setDraftTicketNumber(consumeNextTicketNumber());
  };

  const toggleChip = (chipKey) => {
    setChips((prev) => ({ ...prev, [chipKey]: !prev[chipKey] }));
  };

  const clearAllFilters = () => {
    setChips({ needsReview: false, escalated: false });
    setChartFilter(null);
  };

  const aiCreateTicketFromTranscript = (handoffPayload = { type: "VOICE_BOT" }) => {
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
      // ✅ Must be a dropdown-valid category (prevents blank category in drawer)
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
        handoffPayload.preferredOperatorName ||
        (Array.isArray(OPERATORS) ? OPERATORS[0]?.name || "Jerry" : "Jerry");

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

    const serialNumber = consumeNextTicketNumber();

    const isBotOnly =
      String(handledByRole || "").toUpperCase() === "VOICE_BOT" &&
      String(handledByType || "").toUpperCase() === "VOICE_BOT";

    const statusForAiTicket = isBotOnly ? "NEEDS_REVIEW" : inferred.status;

    const aiTicket = normalizeTicket(
      {
        id: `T-${String(tickets.length + 1).padStart(3, "0")}`,
        ticketNumber: serialNumber,
        createdAt: nowStamp(),
        name: "",
        phone: "",
        description: t,
        // ✅ Must be a dropdown-valid category (prevents blank category in drawer)
        category: inferred.category || "Other",
        location: inferred.location || "",
        priority: inferred.priority,
        status: statusForAiTicket,
        confidence: inferred.confidence,
        channel:
          handledByRole === "SUPERVISOR"
            ? "phone (AI voice bot → supervisor)"
            : handledByRole === "OPERATOR"
            ? "phone (AI voice bot → operator)"
            : "phone (AI voice bot)",
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
        toneConfidence: toneGuess.toneConfidence,
        toneSource: "AI",
        routingStatus: "PENDING_APPROVAL",
        workflowStage: isBotOnly ? "PENDING_APPROVAL" : undefined,
        assignedDepartment: null,
        approvedAt: null,
        recordingUrl: "/mock/call_dash.wav",
        transcript: t,
      },
      "INSIGHT VoiceBot"
    );

    setTickets((prev) => {
      const next = [aiTicket, ...prev];
      setStoredTickets(next);
      return next;
    });

    const handlerLabel =
      handledByRole === "SUPERVISOR"
        ? `Supervisor (${handledByName})`
        : handledByRole === "OPERATOR"
        ? `Operator (${handledByName})`
        : "Voice Bot";

    toast.success(
      isFR ? `Ticket IA créé : ${aiTicket.ticketNumber}` : `AI ticket created: ${aiTicket.ticketNumber}`,
      { title: handlerLabel }
    );
  };

  const submitTicket = (enhancedFormMaybe) => {
    const incoming = enhancedFormMaybe || form;

    if (!incoming.description || !incoming.category) {
      toast.error(
        isFR ? "Veuillez remplir Catégorie + Description." : "Please ensure at least Category + Description are filled."
      );
      return;
    }

    const ticketNumberToUse = incoming.ticketNumber || draftTicketNumber;

    const newTicket = normalizeTicket(
      {
        id: `T-${String(tickets.length + 1).padStart(3, "0")}`,
        ticketNumber: ticketNumberToUse,
        createdAt: nowStamp(),
        ...incoming,
        tone: incoming.tone || "UNKNOWN",
        toneConfidence: incoming.toneConfidence || "LOW",
        toneSource: incoming.toneSource || "HUMAN",
        createdByType: incoming.createdByType || "OPERATOR",
        createdByName: incoming.createdByName || userName,
        createdByRole: incoming.createdByRole || userRole,
        handledByType: incoming.handledByType || "OPERATOR",
        handledByRole: incoming.handledByRole || "OPERATOR",
        handledByName: incoming.handledByName || userName,
        routingStatus: incoming.routingStatus || "PENDING_APPROVAL",
        assignedDepartment: incoming.assignedDepartment || null,
        approvedAt: incoming.approvedAt || null,
      },
      userName
    );

    setTickets((prev) => {
      const next = [newTicket, ...prev];
      setStoredTickets(next);
      return next;
    });

    setForm((prev) => ({
      ...prev,
      name: "",
      phone: "",
      location: "",
      category: "",
      description: "",
      priority: "MEDIUM",
      status: "NEW",
      confidence: "MEDIUM",
      channel: "phone (human operator)",
      assignedDepartment: "",
      tone: "UNKNOWN",
      toneConfidence: "LOW",
      toneSource: "HUMAN",
    }));

    consumeManualDraftNumber();
    toast.success(isFR ? `Ticket manuel créé : ${newTicket.ticketNumber}` : `Manual ticket created: ${newTicket.ticketNumber}`);
  };

  const approveTicket = (ticketId) => {
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";
    if (!isSupervisor) {
      toast.error(isFR ? "Accès refusé." : "Not allowed. Supervisor only.");
      return;
    }

    setTickets((prev) => {
      const current = prev.find((t) => t.id === ticketId);
      if (!current) return prev;

      const stage = String(current.workflowStage || "").toUpperCase();
      const routing = String(current.routingStatus || "").toUpperCase();

      const isBotOnly = isPureVoiceBotTicket(current);
      const isPendingApproval = stage === "PENDING_APPROVAL";

      if (!isBotOnly) {
        toast.error(
          isFR
            ? "Éligibilité: uniquement tickets créés ET traités par Voice Bot."
            : "Not eligible. Approve is only for tickets created AND handled by the Voice Bot."
        );
        return prev;
      }

      if (!isPendingApproval) {
        toast.error(
          isFR ? "Ce ticket n’est pas en attente d’approbation." : "This ticket is not in PENDING_APPROVAL."
        );
        return prev;
      }

      if (routing === "APPROVED") return prev;

      const dept = current.assignedDepartment || inferDepartmentFromCategory(current.category) || "General";
      const now = new Date().toISOString();

      const next = prev.map((t) => {
        if (t.id !== ticketId) return t;

        const nextSession = Array.isArray(t.sessionHistory) ? [...t.sessionHistory] : [];
        nextSession.push({
          at: now,
          speaker: `Supervisor (${sessionUserName})`,
          text: `Approved & routed to Department Queue — ${dept}.`,
        });

        return {
          ...t,
          routingStatus: "APPROVED",
          workflowStage: "ROUTED_TO_DEPARTMENT",
          assignedDepartment: dept,
          routedToDepartment: dept,
          approvedAt: now,
          approvedByRole: "SUPERVISOR",
          approvedByName: sessionUserName,
          sessionHistory: nextSession,

          // Optional: after approval, move out of NEEDS_REVIEW
          status: String(t.status || "").toUpperCase() === "NEEDS_REVIEW" ? "IN_PROGRESS" : t.status,
        };
      });

      toast.success(
        isFR ? `Approbation réussie. Routé vers ${dept}.` : `Approve & routing was successful. Routed to Department Queue — ${dept}.`
      );

      setStoredTickets(next);

      if (selectedTicket?.id === ticketId) {
        const updatedTicket = next.find((x) => x.id === ticketId);
        setSelectedTicket(updatedTicket || null);
      }

      return next;
    });
  };

  const rejectTicket = (ticketId, reason = "") => {
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";
    if (!isSupervisor) {
      toast.error(isFR ? "Accès refusé." : "Not allowed. Supervisor only.");
      return;
    }

    setTickets((prev) => {
      const current = prev.find((t) => t.id === ticketId);
      if (!current) return prev;

      const stage = String(current.workflowStage || "").toUpperCase();
      const routing = String(current.routingStatus || "").toUpperCase();

      const isBotOnly = isPureVoiceBotTicket(current);
      const isPendingApproval =
        stage === "PENDING_APPROVAL" ||
        stage === "PENDING_SUPERVISOR_APPROVAL" ||
        routing === "PENDING_APPROVAL";

      if (!isBotOnly) {
        toast.error(
          isFR
            ? "Éligibilité: uniquement tickets créés ET traités par Voice Bot."
            : "Not eligible. Reject is only for tickets created AND handled by the Voice Bot."
        );
        return prev;
      }

      if (!isPendingApproval) {
        toast.error(
          isFR
            ? "Ce ticket n’est pas en attente d’approbation."
            : "This ticket is not in PENDING_APPROVAL."
        );
        return prev;
      }

      if (routing === "REJECTED") return prev;

      const now = new Date().toISOString();
      const cleanReason = String(reason || "").trim();

      const next = prev.map((t) => {
        if (t.id !== ticketId) return t;

        const nextSession = Array.isArray(t.sessionHistory) ? [...t.sessionHistory] : [];
        nextSession.push({
          at: now,
          speaker: `Supervisor (${sessionUserName})`,
          text: cleanReason
            ? `Rejected by supervisor — ${cleanReason}.`
            : "Rejected by supervisor. No routing action will be taken.",
        });

        return {
          ...t,
          status: "REJECTED",
          routingStatus: "REJECTED",
          workflowStage: "REJECTED_BY_SUPERVISOR",
          rejectedAt: now,
          rejectedByRole: "SUPERVISOR",
          rejectedByName: sessionUserName,
          rejectedReason: cleanReason || "Rejected by supervisor",
          sessionHistory: nextSession,
        };
      });

      toast.success(
        isFR
          ? "Rejet enregistré avec succès."
          : "Reject was successful. Ticket will not be routed."
      );

      setStoredTickets(next);

      if (selectedTicket?.id === ticketId) {
        const updatedTicket = next.find((x) => x.id === ticketId);
        setSelectedTicket(updatedTicket || null);
      }

      return next;
    });
  };

  const updateTicket = async (ticketId, patch) => {
    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error(isFR ? "Ticket introuvable." : "Ticket not found.");
      return;
    }

    const prevSnapshot = tickets;

    const nextTickets = tickets.map((t) => (t.id === ticketId ? { ...t, ...patch } : t));
    setTickets(nextTickets);
    setStoredTickets(nextTickets);
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (prev ? { ...prev, ...patch } : prev));
    }

    try {
      // await updateTicketApi(ticketId, patch);
      toast.success(isFR ? "Ticket mis à jour." : "Ticket updated.");
    } catch (e) {
      setTickets(prevSnapshot);
      setStoredTickets(prevSnapshot);
      if (selectedTicket?.id === ticketId) setSelectedTicket(current);
      toast.error(e?.message || (isFR ? "Échec de la mise à jour." : "Update failed. Please try again."));
    }
  };

  // ✅ Supervisor soft-delete: keep ticket visible but mark status as DELETE
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

  // ✅ Queue Overview helpers (enterprise polish)
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

    return { visible: visible.length, needsReview, escalated, resolved, active };
  }, [roleVisibleTickets]);

  const parseTicketDate = (createdAt) => {
    const s = String(createdAt || "").trim();
    if (!s) return null;
    // Supports "YYYY-MM-DD HH:mm"
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
    list.sort((a, b) => {
      const da = parseTicketDate(a?.createdAt)?.getTime() || 0;
      const db = parseTicketDate(b?.createdAt)?.getTime() || 0;
      return db - da;
    });
    return list.slice(0, 6);
  }, [roleVisibleTickets]);

  const laneTickets = useMemo(() => {
    const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";
    const isResolved = (t) => (t?.status || "").toUpperCase() === "RESOLVED";
    const isBotOnlyPendingApproval = (t) => {
      const stage = String(t?.workflowStage || "").toUpperCase();
      const legacyPending = isPureVoiceBotTicket(t) && !isApproved(t) && !isResolved(t) && !isRejectedTicket(t);
      return stage === "PENDING_APPROVAL" || stage === "PENDING_SUPERVISOR_APPROVAL" || legacyPending;
    };

    let base = roleVisibleTickets;

    const isSupervisor = sessionRoleUpper === "SUPERVISOR";

    base = base.filter((t) => {
      const handled = low(t?.handledByName) === sessionName;
      const legacy = low(t?.createdByName) === sessionName;
      const involved = handled || legacy;

      const supervisorSeesAllBotOnly = isSupervisor && isPureVoiceBotTicket(t);

      return involved || supervisorSeesAllBotOnly;
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
      case "IN_PROGRESS":
        return base.filter((t) => String(t?.status || "").toUpperCase() === "IN_PROGRESS");
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

    const base =
      ticketView === "RECENT"
        ? (roleVisibleTickets || []).filter((t) => {
            const createdBy = low(t?.createdByName);
            const handledBy = low(t?.handledByName);
            const involved = createdBy === sessionName || handledBy === sessionName;

            // ✅ Supervisor must also see bot-only tickets in counts (otherwise everything shows 0)
            const supervisorSeesAllBotOnly = isSupervisor && isPureVoiceBotTicket(t);

            return involved || supervisorSeesAllBotOnly;
          })
        : roleVisibleTickets || [];

    const isDeleted = (t) => String(t?.status || "").toUpperCase() === "DELETE";
    const isNew = (t) => String(t?.status || "").toUpperCase() === "NEW";
    const isInProgress = (t) => String(t?.status || "").toUpperCase() === "IN_PROGRESS";
    const isEscalated = (t) => String(t?.status || "").toUpperCase() === "ESCALATED";
    const isResolvedLocal = (t) => String(t?.status || "").toUpperCase() === "RESOLVED";

    const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";
    const isPureVoiceBot = (t) =>
      String(t?.createdByType || "").toUpperCase() === "VOICE_BOT" &&
      String(t?.handledByRole || "VOICE_BOT").toUpperCase() === "VOICE_BOT" &&
      String(t?.handledByType || "VOICE_BOT").toUpperCase() === "VOICE_BOT";
    const isBotOnlyPendingApproval = (t) => {
      const stage = String(t?.workflowStage || "").toUpperCase();
      const legacyPending = isPureVoiceBot(t) && !isApproved(t) && !isResolvedLocal(t) && !isRejectedTicket(t);
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
      inProgress: base.filter((t) => isInProgress(t) && !isDeleted(t) && !isRejectedTicket(t)).length,
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
        case "IN_PROGRESS":
          base = base.filter((t) => String(t?.status || "").toUpperCase() === "IN_PROGRESS");
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
    if (!q) return chipFiltered;

    return chipFiltered.filter((t) => {
      const hay = [
        t?.ticketNumber,
        t?.name,
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
    });
  }, [laneTickets, historyTickets, searchQuery, chips, chartFilter, ticketView, queueFilter, sessionName]);

  const recentTicketsLimited = useMemo(() => {
    const parseDate = (s) => {
      const str = String(s || "");
      const iso = str.includes("T") ? str : str.replace(" ", "T");
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const isDeleted = (t) => String(t?.status || "").toUpperCase() === "DELETE";
    const isSupervisor = sessionRoleUpper === "SUPERVISOR";

    const involved = (t) => low(t?.createdByName) === sessionName || low(t?.handledByName) === sessionName;
    const supervisorSeesBotOnly = (t) => isSupervisor && isPureVoiceBotTicket(t);

    const base = filteredTickets.filter(
      (t) => (involved(t) || supervisorSeesBotOnly(t)) && !isDeleted(t) && !isRejectedTicket(t)
    );

    const sorted = [...base].sort((a, b) => {
      const ta = parseDate(a?.createdAt) || 0;
      const tb = parseDate(b?.createdAt) || 0;
      if (tb !== ta) return tb - ta;
      const sa = extractSeq(a?.ticketNumber) || 0;
      const sb = extractSeq(b?.ticketNumber) || 0;
      return sb - sa;
    });

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
      { label: "IN_PROGRESS", value: statusCounts.IN_PROGRESS || 0 },
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
            (statusCounts.IN_PROGRESS || 0) -
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
      const legacyPending = isPureVoiceBotTicket(t) && !isApproved(t) && !isResolved(t) && !isRejectedTicket(t);
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
      { label: "IN_PROGRESS", value: statusCounts.IN_PROGRESS || 0 },
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
            (statusCounts.IN_PROGRESS || 0) -
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

      {/* Session card (optional diagnostics) */}
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

      {/* Manual Ticket Intake */}
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

      {/* Queue Overview */}
      {activeView === "QUEUE_OVERVIEW" && (
        <div id="queue-overview" className="card" style={{ marginTop: 12, scrollMarginTop: 92 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>{isFR ? "Vue d’ensemble" : "Queue Overview"}</h3>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {isFR
                  ? "Aperçu opérationnel : volume, sources et statuts."
                  : "Operational snapshot of ticket volume, sources, and status distribution."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {loadingTickets && <span className="pill">{isFR ? "Actualisation…" : "Refreshing…"}</span>}
              {!!ticketsError && !loadingTickets && <span className="pill pillError">Offline / error</span>}

              {lastRefreshedAt && !loadingTickets ? (
                <span className="pill" title="Last refresh time">
                  {isFR ? "Dernière actualisation" : "Last refreshed"}:{" "}
                  {new Date(lastRefreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}

              <button className="btn" type="button" onClick={handleRefresh} disabled={loadingTickets}>
                {isFR ? "Actualiser" : "Refresh"}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <KpiCard
              title={isFR ? "Tickets visibles" : "Visible tickets"}
              value={qoCounts.visible}
              sub={isFR ? "Selon votre rôle" : "Tickets visible to your role"}
              onClick={() => nav("/dashboard/my-work", { state: { queuePreset: "ACTIVE" } })}
            />
            <KpiCard
              title={isFR ? "Actifs" : "Active"}
              value={qoCounts.active}
              sub={isFR ? "Non résolus" : "Not resolved"}
              onClick={() => nav("/dashboard/my-work", { state: { queuePreset: "ACTIVE" } })}
            />
            <KpiCard
              title={isFR ? "À valider" : "Needs review"}
              value={qoCounts.needsReview}
              sub={isFR ? "Triage" : "Triage attention"}
              onClick={() => nav("/dashboard/my-work", { state: { queuePreset: "NEEDS_REVIEW" } })}
            />
            <KpiCard
              title={isFR ? "Escaladés" : "Escalated"}
              value={qoCounts.escalated}
              sub={isFR ? "Superviseur/spécialiste" : "Supervisor / specialist"}
              onClick={() => nav("/dashboard/my-work", { state: { queuePreset: "ESCALATED" } })}
            />
            <KpiCard
              title={isFR ? "Résolus" : "Resolved"}
              value={qoCounts.resolved}
              sub={isFR ? "Fermés" : "Closed"}
              onClick={() => nav("/dashboard/my-work", { state: { queuePreset: "RESOLVED" } })}
            />
          </div>

          {/* ✅ Operational alerts strip (enterprise) */}
          <div className="qoAlertStrip" role="status" aria-label="Operational alerts">
            {qoCounts.needsReview > 0 ? (
              <span className="pill pillWarn">
                ⚠️ {qoCounts.needsReview} {isFR ? "à valider" : "need review"}
              </span>
            ) : (
              <span className="pill pillOk">✓ {isFR ? "Aucun triage en attente" : "No triage backlog"}</span>
            )}

            {qoCounts.escalated > 0 ? (
              <span className="pill pillEsc">
                🔺 {qoCounts.escalated} {isFR ? "escaladé(s)" : "escalated"}
              </span>
            ) : (
              <span className="pill">{isFR ? "Escalade : 0" : "Escalations: 0"}</span>
            )}

            <span className="pill">
              ⏱ {isFR ? "Âge (dernier)" : "Newest age"}:{" "}
              {qoRecentActivity[0] ? formatAge(qoRecentActivity[0]?.createdAt) : "—"}
            </span>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div className="card" style={{ background: "#fbfbff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>
                  {isFR ? "Aperçu système" : "System Overview"}
                </div>
                <span className="pill">{isFR ? "Registre" : "History bucket"}</span>
              </div>
              <div style={{ marginTop: 10, display: "grid", justifyItems: "center" }}>
                <DonutChart
                  outerSegments={systemDonutStats.outerSegments}
                  innerSegments={systemDonutStats.innerSegments}
                  total={systemDonutStats.totalCount}
                  size={240}
                  outerStroke={24}
                  innerStroke={18}
                  gap={12}
                  onLegendClick={onDonutLegendClick}
                />
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                {isFR ? (
                  <>
                    Anneau externe = <b>source</b>; anneau interne = <b>statut</b>.
                  </>
                ) : (
                  <>
                    Outer ring shows <b>source</b>; inner ring shows <b>status</b>.
                  </>
                )}
              </div>
            </div>

            <div className="card" style={{ background: "#fbfbff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>
                  {isFR ? "Mes tickets" : "My Ticket Overview"}
                </div>
                <span className="pill">{isFR ? "Session" : "Session scope"}</span>
              </div>
              <div style={{ marginTop: 10, display: "grid", justifyItems: "center" }}>
                <DonutChart
                  outerSegments={myAllDonutStats.outerSegments}
                  innerSegments={myAllDonutStats.innerSegments}
                  total={myAllDonutStats.totalCount}
                  size={240}
                  outerStroke={24}
                  innerStroke={18}
                  gap={12}
                />
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                {sessionRoleUpper === "SUPERVISOR" ? (
                  <>
                    {isFR ? (
                      <>
                        Inclut les <b>approbations bot-only</b> du superviseur.
                      </>
                    ) : (
                      <>
                        Includes <b>bot-only approvals</b> as part of supervisor workload.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {isFR ? (
                      <>
                        Tickets créés/traités par <b>{userName}</b>.
                      </>
                    ) : (
                      <>
                        All tickets created/handled by <b>{userName}</b>.
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ✅ Recent activity */}
          <div className="card qoActivityCard" style={{ marginTop: 14 }}>
            <div className="qoActivityHeader">
              <div>
                <div className="qoActivityTitle">{isFR ? "Activité récente" : "Recent activity"}</div>
                <div className="qoActivitySub">
                  {isFR ? "Derniers tickets visibles pour votre rôle." : "Latest tickets visible to your role."}
                </div>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() => nav("/dashboard/my-work")}
                title={isFR ? "Ouvrir ma file" : "Open My Work Queue"}
              >
                {isFR ? "Ouvrir la file" : "Open queue"}
              </button>
            </div>

            <div className="recentActivityGrid" aria-label={isFR ? "Activité récente" : "Recent activity"}>
              {qoRecentActivity.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  {isFR ? "Aucune activité récente." : "No recent activity."}
                </div>
              ) : (
                qoRecentActivity.map((t) => (
                  <div className="qoRow" role="row" key={t.id || t.ticketNumber}>
                    <div className="qoCell" role="cell">
                      <b>{t.ticketNumber}</b>
                      <div className="qoMuted">{t.location}</div>
                    </div>

                    <div className="qoCell" role="cell">
                      <span className={`pill pillStatus pillStatus-${String(t.status || "").toUpperCase()}`}>
                        {String(t.status || "").replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="qoCell" role="cell">
                      <div style={{ fontWeight: 800 }}>{t.assignedDepartment || t.department || "—"}</div>
                      <div className="qoMuted">{t.category || "—"}</div>
                    </div>

                    <div className="qoCell" role="cell">{formatAge(t.createdAt)}</div>

                    <div className="qoCell qoCellAction" role="cell">
                      <button
                        type="button"
                        className="raButton primary"
                        onClick={() => handleRowClick(t, "/dashboard/overview")}
                      >
                        {isFR ? "Voir" : "View"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* My Work Queue */}
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
                onChangeQueueFilter={setQueueFilter}
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
                  : recentTicketsLimited
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
              onRowClick={handleRowClick}
              backTo={ticketView === "HISTORY" ? "/dashboard/overview" : "/dashboard/my-work"}
            />
          )}
        </div>
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