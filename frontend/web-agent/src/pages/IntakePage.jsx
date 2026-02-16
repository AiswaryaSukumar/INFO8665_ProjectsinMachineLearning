// src/pages/IntakePage.jsx
import { useMemo, useState, useEffect, useCallback } from "react";

// mock fallback (still used if API unavailable or fails)
import { mockTickets } from "../mock/mockTickets.js";

import VoiceIntakePanel from "../components/VoiceIntakePanel";
import TicketForm from "../components/TicketForm";
import TicketTable from "../components/TicketTable";
import TicketDetailsDrawer from "../components/TicketDetailsDrawer";
import TicketStatusOverview from "../components/TicketStatusOverview";
import DonutChart from "../components/DonutChart";

// controls + toast
import TicketTableControls from "../components/TicketTableControls";
import { useToast } from "../components/Toast";

// routing imports
import { OPERATORS, SUPERVISOR } from "../data/operators";
import { decideHandoffTarget } from "../utils/routing";

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

function inferDepartmentFromCategory(category = "") {
  const c = String(category || "").toLowerCase();
  if (c.includes("pothole") || c.includes("road")) return "Roads";
  if (c.includes("waste") || c.includes("garbage") || c.includes("pickup")) return "Waste";
  if (c.includes("streetlight") || c.includes("lighting") || c.includes("light")) return "Lighting";
  return "General";
}

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
  if (text.includes("pothole")) category = "Road - Pothole";
  else if (text.includes("streetlight") || text.includes("light")) category = "Streetlight";
  else if (text.includes("garbage") || text.includes("pickup")) category = "Waste - Missed Pickup";

  let location = "";
  if (text.includes("king") && text.includes("weber")) location = "King St & Weber St";

  const confidence = category ? (location ? "HIGH" : "MEDIUM") : "LOW";
  const status = confidence === "LOW" ? "NEEDS_REVIEW" : "NEW";
  const priority = text.includes("danger") || text.includes("hazard") ? "HIGH" : "MEDIUM";

  return { category, location, confidence, status, priority };
}

function normalizeTicket(t, fallbackAssignee = "") {
  const createdType = t?.createdByType || "OPERATOR";
  const createdName = t?.createdByName || fallbackAssignee || "";

  const assignedDepartment =
    t?.assignedDepartment ??
    (String(createdType).toUpperCase() !== "VOICE_BOT"
      ? inferDepartmentFromCategory(t?.category)
      : null);

  return {
    ...(t || {}),
    createdByType: createdType,
    createdByName: createdName,
    createdByRole: t?.createdByRole || "OPERATOR",

    handledByType: t?.handledByType || (createdType === "VOICE_BOT" ? "VOICE_BOT" : "OPERATOR"),
    handledByRole: t?.handledByRole || (createdType === "VOICE_BOT" ? "VOICE_BOT" : "OPERATOR"),
    handledByName: t?.handledByName || createdName || fallbackAssignee || "",

    escalatedToRole: t?.escalatedToRole || null,
    escalatedToName: t?.escalatedToName || null,
    escalationReason: t?.escalationReason || null,

    routingStatus: t?.routingStatus || "PENDING_APPROVAL",
    assignedDepartment,
    approvedAt: t?.approvedAt || null,

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
  return (
    createdByType === "VOICE_BOT" && handledByRole === "VOICE_BOT" && handledByType === "VOICE_BOT"
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

export default function IntakePage() {
  const { toast } = useToast();

  const [transcript, setTranscript] = useState("");
  const [lastHandoff, setLastHandoff] = useState({ type: "VOICE_BOT" });

  const [userName, setUserName] = useState(localStorage.getItem("userName") || "Jerry");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "OPERATOR");

  const [queueFilter, setQueueFilter] = useState("ALL");
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  // ✅ High Priority removed
  const [chips, setChips] = useState({
    needsReview: false,
    escalated: false,
  });

  const [chartFilter, setChartFilter] = useState(null);

  // seed normalized mock tickets
  const [tickets, setTickets] = useState(() =>
    (mockTickets || []).map((t, idx) => {
      const seededCreator = idx % 2 === 0 ? "Jerry" : "Tom";
      return normalizeTicket(t, seededCreator);
    })
  );

  // ✅ central fetch function (Retry + initial load)
  // ✅ MOCK-FIRST: If VITE_API_BASE_URL is missing, do NOT call API and do NOT show error UI
  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setTicketsError("");

    // keep sequence aligned with whatever data we use
    initTicketSequence(1);

    const apiBase = String(import.meta?.env?.VITE_API_BASE_URL || "").trim();

    // always align to mock dataset at minimum (so ticket numbers remain stable)
    const normalizedMock = (mockTickets || []).map((t, idx) =>
      normalizeTicket(t, idx % 2 === 0 ? "Jerry" : "Tom")
    );

    const maxFromMock = Math.max(
      0,
      ...normalizedMock
        .map((t) => extractSeq(t.ticketNumber))
        .filter((n) => typeof n === "number" && !Number.isNaN(n))
    );
    ensureSequenceAtLeast(maxFromMock + 1);

    // ✅ no API configured -> stay mock-only, no banner/pill
    if (!apiBase) {
      setTickets(normalizedMock);
      setTicketsError("");
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
      setTicketsError("");
    } catch (e) {
      // ✅ API exists but fails -> keep UI clean + keep mock data
      console.warn("[Mock mode] fetchTickets failed:", e);
      setTickets(normalizedMock);
      setTicketsError("");
    } finally {
      setLoadingTickets(false);
    }
  }, []);

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
    toneConfidence: "OPERATOR",
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
      toast.warning("No transcript yet. Simulate a call first.");
      return;
    }

    const inferred = inferFieldsFromTranscript(t);
    const toneGuess = inferToneFromTranscript(t);

    const ticketDraft = {
      category: inferred.category || "General",
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

    const aiTicket = normalizeTicket(
      {
        id: `T-${String(tickets.length + 1).padStart(3, "0")}`,
        ticketNumber: serialNumber,
        createdAt: nowStamp(),
        name: "",
        phone: "",
        description: t,
        category: inferred.category || "General",
        location: inferred.location || "",
        priority: inferred.priority,
        status: inferred.status,
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
        assignedDepartment: null,
        approvedAt: null,
        recordingUrl: "/mock/call_sample.wav",
        transcript: t,
      },
      "INSIGHT VoiceBot"
    );

    setTickets((prev) => [aiTicket, ...prev]);

    const handlerLabel =
      handledByRole === "SUPERVISOR"
        ? `Supervisor (${handledByName})`
        : handledByRole === "OPERATOR"
        ? `Operator (${handledByName})`
        : "Voice Bot";

    toast.success(`AI ticket created: ${aiTicket.ticketNumber}`, { title: handlerLabel });
  };

  const submitTicket = (enhancedFormMaybe) => {
    const incoming = enhancedFormMaybe || form;

    if (!incoming.description || !incoming.category) {
      toast.error("Please ensure at least Category + Description are filled.");
      return;
    }

    const ticketNumberToUse = incoming.ticketNumber || draftTicketNumber;

    const newTicket = normalizeTicket(
      {
        id: `T-${String(tickets.length + 1).padStart(3, "0")}`,
        ticketNumber: ticketNumberToUse,
        createdAt: nowStamp(),
        ...incoming,
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

    setTickets((prev) => [newTicket, ...prev]);

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
      toneConfidence: "OPERATOR",
      toneSource: "HUMAN",
    }));

    consumeManualDraftNumber();
    toast.success(`Manual ticket created: ${newTicket.ticketNumber}`);
  };

  const approveTicket = async (ticketId) => {
    const roleUpper = String(userRole || "").toUpperCase();
    if (roleUpper !== "SUPERVISOR") {
      toast.warning("Only the Supervisor can approve bot-only tickets.");
      return;
    }

    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error("Ticket not found.");
      return;
    }
    if (!current.assignedDepartment) {
      toast.warning("Please select an Assigned Department before approving.");
      return;
    }

    const assignedOperatorName = pickNextOperatorName();

    const optimisticPatch = {
      routingStatus: "APPROVED",
      assignedDepartment: current.assignedDepartment,
      approvedAt: new Date().toISOString(),
      approvedByName: userName,
      approvedByRole: roleUpper,

      handledByType: "VOICE_BOT_TO_HUMAN",
      handledByRole: "OPERATOR",
      handledByName: assignedOperatorName,

      status: current.status === "NEW" ? "IN_PROGRESS" : current.status,
    };

    const prevSnapshot = tickets;
    const nextTickets = tickets.map((t) => (t.id === ticketId ? { ...t, ...optimisticPatch } : t));
    setTickets(nextTickets);

    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (prev ? { ...prev, ...optimisticPatch } : prev));
    }

    try {
      // await approveTicketApi(ticketId, optimisticPatch);
      toast.success(`Approved: ${current.ticketNumber}`, {
        title: `Routed to ${current.assignedDepartment} • Assigned to ${assignedOperatorName}`,
      });
    } catch (e) {
      setTickets(prevSnapshot);
      if (selectedTicket?.id === ticketId) setSelectedTicket(current);
      toast.error(e?.message || "Approve failed. Please try again.");
    }
  };

  const updateTicket = async (ticketId, patch) => {
    const current = tickets.find((t) => t.id === ticketId);
    if (!current) {
      toast.error("Ticket not found.");
      return;
    }

    const prevSnapshot = tickets;

    const nextTickets = tickets.map((t) => (t.id === ticketId ? { ...t, ...patch } : t));
    setTickets(nextTickets);
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (prev ? { ...prev, ...patch } : prev));
    }

    try {
      // await updateTicketApi(ticketId, patch);
      toast.success("Ticket updated.");
    } catch (e) {
      setTickets(prevSnapshot);
      if (selectedTicket?.id === ticketId) setSelectedTicket(current);
      toast.error(e?.message || "Update failed. Please try again.");
    }
  };

  const selectedSummary = useMemo(() => {
    return transcript
      ? `"${transcript.slice(0, 80)}${transcript.length > 80 ? "..." : ""}"`
      : "No transcript yet.";
  }, [transcript]);

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

  const sessionRoleUpper = String(userRole || "").toUpperCase();

  const roleVisibleTickets = useMemo(() => {
    if (sessionRoleUpper === "SUPERVISOR") return tickets;
    return tickets.filter((t) => !isPureVoiceBotTicket(t));
  }, [tickets, sessionRoleUpper]);

  const laneTickets = useMemo(() => {
    const sessionName = low(localStorage.getItem("userName"));

    const isApproved = (t) => String(t?.routingStatus || "").toUpperCase() === "APPROVED";
    const isResolved = (t) => (t?.status || "").toUpperCase() === "RESOLVED";
    const isBotOnlyPendingApproval = (t) =>
      isPureVoiceBotTicket(t) && !isApproved(t) && !isResolved(t);

    let base = roleVisibleTickets;

    if (sessionRoleUpper !== "SUPERVISOR") {
      base = base.filter((t) => {
        const handled = low(t?.handledByName) === sessionName;
        const legacy = low(t?.createdByName) === sessionName;
        return handled || legacy;
      });
    }

    switch (queueFilter) {
      case "APPROVAL":
        return sessionRoleUpper === "SUPERVISOR" ? base.filter(isBotOnlyPendingApproval) : [];
      case "MINE":
        return base.filter(
          (t) => low(t?.handledByName) === sessionName || low(t?.createdByName) === sessionName
        );
      case "IN_PROGRESS":
        return base.filter(
          (t) => !isResolved(t) && String(t?.status || "").toUpperCase() === "IN_PROGRESS"
        );
      case "RESOLVED":
        return base.filter(isResolved);
      case "ALL":
      default:
        return base.filter((t) => !isResolved(t));
    }
  }, [roleVisibleTickets, queueFilter, sessionRoleUpper]);

  const filteredTickets = useMemo(() => {
    let base = laneTickets;

    // chart filtering
    let chartFiltered = base;
    if (chartFilter?.type === "SOURCE") {
      chartFiltered = base.filter((t) => {
        const created = String(t?.createdByType || "").toUpperCase();
        if (chartFilter.value === "VOICE_BOT") return created === "VOICE_BOT";
        if (chartFilter.value === "HUMAN") return created !== "VOICE_BOT";
        return true;
      });
    } else if (chartFilter?.type === "STATUS") {
      chartFiltered = base.filter(
        (t) =>
          String(t?.status || "").toUpperCase() === String(chartFilter.value || "").toUpperCase()
      );
    }

    // chips filtering (High Priority removed)
    let chipFiltered = chartFiltered;
    if (chips.needsReview) {
      chipFiltered = chipFiltered.filter(
        (t) => String(t?.status || "").toUpperCase() === "NEEDS_REVIEW"
      );
    }
    if (chips.escalated) {
      chipFiltered = chipFiltered.filter((t) => String(t?.status || "").toUpperCase() === "ESCALATED");
    }

    // search filtering
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
  }, [laneTickets, searchQuery, chips, chartFilter]);

  const queueStats = useMemo(() => {
    const sessionName = low(localStorage.getItem("userName"));
    const isResolved = (t) => (t?.status || "").toUpperCase() === "RESOLVED";

    let base = roleVisibleTickets;

    if (sessionRoleUpper !== "SUPERVISOR") {
      base = base.filter((t) => {
        const handled = low(t?.handledByName) === sessionName;
        const legacy = low(t?.createdByName) === sessionName;
        return handled || legacy;
      });
    }

    const active = base.filter((t) => !isResolved(t));
    const allActiveCount = active.length;

    const voiceBotCount = active.filter(
      (t) => (t?.createdByType || "").toUpperCase() === "VOICE_BOT"
    ).length;
    const humanCount = Math.max(0, allActiveCount - voiceBotCount);

    const outerSegments = [
      { label: "Voice Bot", value: voiceBotCount },
      { label: "Human", value: humanCount },
    ].filter((x) => x.value > 0);

    const statusCounts = active.reduce((acc, t) => {
      const s = String(t?.status || "NEW").toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const innerSegments = [
      { label: "NEW", value: statusCounts.NEW || 0 },
      { label: "IN_PROGRESS", value: statusCounts.IN_PROGRESS || 0 },
      { label: "NEEDS_REVIEW", value: statusCounts.NEEDS_REVIEW || 0 },
      { label: "ESCALATED", value: statusCounts.ESCALATED || 0 },
      { label: "RESOLVED", value: statusCounts.RESOLVED || 0 },
      {
        label: "OTHER",
        value: Math.max(
          0,
          allActiveCount -
            (statusCounts.NEW || 0) -
            (statusCounts.IN_PROGRESS || 0) -
            (statusCounts.NEEDS_REVIEW || 0) -
            (statusCounts.ESCALATED || 0) -
            (statusCounts.RESOLVED || 0)
        ),
      },
    ].filter((x) => x.value > 0);

    return { allActiveCount, outerSegments, innerSegments };
  }, [roleVisibleTickets, sessionRoleUpper]);

  const emptyMessage = useMemo(() => {
    if ((laneTickets || []).length === 0) return "No tickets in this lane yet.";
    return "No tickets match your filters/search. Try clearing filters.";
  }, [laneTickets]);

  return (
    <>
      <ErrorBanner message={ticketsError} onRetry={loadTickets} />

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Current session: <b>{userName}</b> ({userRole})
        </div>

        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
          Last handoff: {JSON.stringify(lastHandoff)}
        </div>
      </div>

      <div className="grid2">
        <VoiceIntakePanel transcript={transcript} setTranscript={setTranscript} onExtract={aiCreateTicketFromTranscript} />

        <TicketForm
          form={form}
          setForm={setForm}
          onSubmit={submitTicket}
          draftTicketNumber={draftTicketNumber}
          onConsumeDraftNumber={consumeManualDraftNumber}
        />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <TicketStatusOverview
          tickets={roleVisibleTickets}
          queueFilter={queueFilter}
          onChangeFilter={setQueueFilter}
          loading={loadingTickets}
          error={!!ticketsError}
          onRefresh={loadTickets}
        />

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <DonutChart
            outerSegments={queueStats.outerSegments}
            innerSegments={queueStats.innerSegments}
            total={queueStats.allActiveCount}
            size={300}
            outerStroke={26}
            innerStroke={20}
            gap={12}
            onLegendClick={onDonutLegendClick}
          />
        </div>

        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b", textAlign: "center" }}>
          Showing tickets visible to you{" "}
          ({sessionRoleUpper === "SUPERVISOR"
            ? "Supervisor sees all"
            : "Operator does not see bot-only tickets"}
          ).
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Recent Tickets</h3>

        <p style={{ fontSize: 12, color: "#6b7280", marginTop: -6 }}>
          Filtered by queue lanes above. Approval applies only to bot-only (HITL) tickets.
        </p>

        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <b>AI transcript summary:</b> {selectedSummary}
        </div>

        <TicketTableControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          chips={chips}
          onToggleChip={toggleChip}
          onClearAll={clearAllFilters}
        />

        <TicketTable
          tickets={filteredTickets}
          loading={loadingTickets}
          loadingLabel="Refreshing…"
          emptyMessage={emptyMessage}
          mode="operator"
          onApprove={approveTicket}
          onRowClick={(t) => {
            setSelectedTicket(t);
            setDrawerOpen(true);
          }}
        />
      </div>

      <TicketDetailsDrawer
        open={drawerOpen}
        ticket={selectedTicket}
        onClose={() => setDrawerOpen(false)}
        mode="operator"
        onApprove={approveTicket}
        onUpdate={updateTicket}
      />
    </>
  );
}
