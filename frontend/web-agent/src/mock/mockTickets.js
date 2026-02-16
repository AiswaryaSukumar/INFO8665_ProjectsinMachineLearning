// src/data/mockTickets.js
export const mockTickets = [
  // 1) ✅ Voice Bot + Jerry (handoff) — TONE: AGITATED
  {
    id: "T-001",
    ticketNumber: "311-2026-001234",
    createdAt: "2026-02-02 15:30",
    name: "Nora",
    phone: "647-555-0111",
    location: "King St & Weber St",
    category: "Pothole",
    description: "Pothole near King Street and Weber Street, causing rough driving.",
    status: "NEW",
    confidence: "HIGH",

    tone: "AGITATED",
    toneConfidence: "MEDIUM",
    toneSource: "AI",

    channel: "phone (AI voice bot → operator)",

    createdByType: "VOICE_BOT",
    createdByName: "INSIGHT VoiceBot",
    createdByRole: "SYSTEM",
    recordingUrl: "/mock/call_nora.wav",
    transcript:
      "Hi, I want to report a pothole near King Street and Weber Street. It's causing rough driving. Please fix it soon.",

    handledByType: "VOICE_BOT_TO_HUMAN",
    handledByRole: "OPERATOR",
    handledByName: "Jerry",

    escalatedToRole: "OPERATOR",
    escalatedToName: "Jerry",
    escalationReason: "Voice bot transferred to operator (handoff selected)",

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: "Roads", // ✅ FILLED (human handled)
    approvedAt: null,
  },

  // 2) ✅ Pure Voice Bot (bot-only, pending approval) — TONE: ANGRY
  {
    id: "T-002",
    ticketNumber: "311-2026-001235",
    createdAt: "2026-02-02 15:33",
    name: "Dash",
    phone: "905-555-0144",
    location: "Victoria St",
    category: "Noise complaint", // ✅ FIXED (was Parking complaint)
    description: "Loud noise reported late at night. Caller demanded immediate action.",
    status: "NEW",
    confidence: "MEDIUM",

    tone: "ANGRY",
    toneConfidence: "HIGH",
    toneSource: "AI",

    channel: "phone (AI voice bot)",

    createdByType: "VOICE_BOT",
    createdByName: "INSIGHT VoiceBot",
    createdByRole: "SYSTEM",
    recordingUrl: "/mock/call_dash.wav",
    transcript:
      "There’s loud noise late at night on Victoria Street. I’m really upset and need this fixed now.",

    handledByType: "VOICE_BOT",
    handledByRole: "VOICE_BOT",
    handledByName: "INSIGHT VoiceBot",

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: null, // ✅ BLANK (bot-only until Supervisor picks + approves)
    approvedAt: null,
  },

  // 3) ✅ Jerry handled (human) — TONE: CALM
  {
    id: "T-003",
    ticketNumber: "311-2026-001236",
    createdAt: "2026-02-02 15:38",
    name: "Jaden",
    phone: "519-555-0202",
    location: "Bridgeport Rd",
    category: "Illegal sign",
    description: "Streetlight flickering at night near Bridgeport Road.",
    status: "IN_PROGRESS",
    confidence: "MEDIUM",

    tone: "CALM",
    toneConfidence: "LOW",
    toneSource: "HUMAN",

    channel: "phone (human operator)",

    createdByType: "OPERATOR",
    createdByName: "Jerry",
    createdByRole: "OPERATOR",
    recordingUrl: null,
    transcript: null,

    handledByType: "OPERATOR",
    handledByRole: "OPERATOR",
    handledByName: "Jerry",

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: "General", // ✅ FILLED (human)
    approvedAt: null,
  },

  // 4) ✅ Tom handled (human) — TONE: THREAT
  {
    id: "T-004",
    ticketNumber: "311-2026-001237",
    createdAt: "2026-02-02 15:45",
    name: "Liam",
    phone: "416-555-0199",
    location: "University Ave",
    category: "Property standards complaint",
    description:
      "Garbage has not been collected. Caller made threatening statements if not handled urgently.",
    status: "NEEDS_REVIEW",
    confidence: "LOW",

    tone: "THREAT",
    toneConfidence: "HIGH",
    toneSource: "HUMAN",

    channel: "phone (human operator)",

    createdByType: "OPERATOR",
    createdByName: "Tom",
    createdByRole: "OPERATOR",
    recordingUrl: null,
    transcript: null,

    handledByType: "OPERATOR",
    handledByRole: "OPERATOR",
    handledByName: "Tom",

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: "General", // ✅ FILLED (human)
    approvedAt: null,
  },

  // 5) ✅ Voice Bot + Supervisor (handoff/escalation) — TONE: ABUSIVE
  {
    id: "T-005",
    ticketNumber: "311-2026-001238",
    createdAt: "2026-02-02 16:02",
    name: "Maya",
    phone: "416-555-0188",
    location: "Queen St W",
    category: "Needles",
    description: "Caller used abusive language and demanded supervisor intervention immediately.",
    status: "ESCALATED",
    confidence: "HIGH",

    tone: "ABUSIVE",
    toneConfidence: "HIGH",
    toneSource: "AI",

    channel: "phone (AI voice bot → supervisor)",

    createdByType: "VOICE_BOT",
    createdByName: "INSIGHT VoiceBot",
    createdByRole: "SYSTEM",
    recordingUrl: "/mock/call_maya.wav",
    transcript:
      "There is water leaking on Queen Street West and this is ridiculous. I want a supervisor right now!",

    handledByType: "VOICE_BOT_TO_HUMAN",
    handledByRole: "SUPERVISOR",
    handledByName: "Nagavalli",

    escalatedToRole: "SUPERVISOR",
    escalatedToName: "Nagavalli",
    escalationReason: "High-risk tone/category triggered supervisor escalation",

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: "General", // ✅ FILLED (human handled)
    approvedAt: null,
  },

    // 6) ✅ Pure Voice Bot (RESET: pending approval again) — TONE: UNKNOWN
  {
    id: "T-006",
    ticketNumber: "311-2026-001239",
    createdAt: "2026-02-02 16:10",
    name: "Daniel",
    phone: "416-555-0222",
    location: "Charles St",
    category: "Other",
    description: "Debris reported; caller provided minimal details.",
    status: "NEW", // ✅ reset (was IN_PROGRESS)
    confidence: "LOW",

    tone: "UNKNOWN",
    toneConfidence: "LOW",
    toneSource: "AI",

    channel: "phone (AI voice bot)",

    createdByType: "VOICE_BOT",
    createdByName: "INSIGHT VoiceBot",
    createdByRole: "SYSTEM",
    recordingUrl: "/mock/call_daniel.wav",
    transcript: "Hi, there is some debris on Charles Street. Not sure exactly where.",

    handledByType: "VOICE_BOT",
    handledByRole: "VOICE_BOT",
    handledByName: "INSIGHT VoiceBot",

    routingStatus: "PENDING_APPROVAL", // ✅ reset (was APPROVED)
    assignedDepartment: null,          // ✅ reset (bot-only must be blank)
    approvedAt: null,                  // ✅ reset
  },

  // 7) ✅ RESOLVED ticket (tests donut + All Active + disables actions)
  {
    id: "T-007",
    ticketNumber: "311-2026-001240",
    createdAt: "2026-02-02 17:10",
    name: "Olivia",
    phone: "647-555-0300",
    location: "Erb St",
    category: "Streetlight",
    description: "Streetlight fixed successfully.",
    status: "RESOLVED",
    confidence: "HIGH",

    tone: "CALM",
    toneConfidence: "HIGH",
    toneSource: "HUMAN",

    channel: "web",

    createdByType: "CITIZEN",
    createdByName: "Olivia",
    createdByRole: "CITIZEN",

    recordingUrl: null,
    transcript: null,

    handledByType: "OPERATOR",
    handledByRole: "OPERATOR",
    handledByName: "Jerry",

    routingStatus: "APPROVED",
    assignedDepartment: "Electrical",
    approvedAt: "2026-02-02T17:15:00.000Z",
  },

  // 8) ✅ REJECTED ticket (tests failure lane + no approve button)
  {
    id: "T-008",
    ticketNumber: "311-2026-001241",
    createdAt: "2026-02-02 17:22",
    name: "Ava",
    phone: "416-555-0404",
    location: "Duke St",
    category: "Graffiti",
    description: "Graffiti reported, but location details were insufficient.",
    status: "NEEDS_REVIEW",
    confidence: "LOW",

    tone: "UNKNOWN",
    toneConfidence: "LOW",
    toneSource: "AI",

    channel: "phone (AI voice bot)",

    createdByType: "VOICE_BOT",
    createdByName: "INSIGHT VoiceBot",
    createdByRole: "SYSTEM",
    recordingUrl: "/mock/call_ava.wav",
    transcript: "There is graffiti… somewhere near Duke Street. I'm not sure exactly where.",

    handledByType: "VOICE_BOT",
    handledByRole: "VOICE_BOT",
    handledByName: "INSIGHT VoiceBot",

    routingStatus: "REJECTED",
    assignedDepartment: null, // ✅ BLANK (bot-only rejected)
    approvedAt: null,
  },

  // 9) ✅ Missing optional fields (tests null safety + drawer stability)
  {
    id: "T-009",
    ticketNumber: "311-2026-001242",
    createdAt: "2026-02-02 17:40",
    name: "Noah",
    phone: "905-555-0555",
    location: "Weber St",
    category: "Other",
    description: "Minimal data ticket to test UI null handling.",
    status: "NEW",
    confidence: "MEDIUM",

    tone: null,
    toneConfidence: null,
    toneSource: null,

    channel: "web",

    createdByType: "CITIZEN",
    createdByName: "Noah",
    createdByRole: "CITIZEN",

    recordingUrl: null,
    transcript: null,

    handledByType: null,
    handledByRole: null,
    handledByName: null,

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: "General", // ✅ FILLED (not bot-only)
    approvedAt: null,
  },

  // 10) ✅ Long description + old date (tests wrapping + sorting + aging)
  {
    id: "T-010",
    ticketNumber: "311-2025-009999",
    createdAt: "2025-11-15 08:22",
    name: "Sophia",
    phone: "647-555-0666",
    location: "University Ave",
    category: "Pothole",
    description:
      "This pothole has been growing for weeks and now it’s so large that vehicles swerve into the next lane to avoid it. " +
      "It becomes especially dangerous at night and in rain because it’s hard to see. Please inspect and repair as soon as possible. " +
      "I’ve seen multiple near-misses and I’m worried someone will get hurt.",
    status: "NEW",
    confidence: "HIGH",

    tone: "AGITATED",
    toneConfidence: "MEDIUM",
    toneSource: "AI",

    channel: "phone (AI voice bot)",

    createdByType: "VOICE_BOT",
    createdByName: "INSIGHT VoiceBot",
    createdByRole: "SYSTEM",
    recordingUrl: "/mock/call_sophia.wav",
    transcript:
      "There’s a pothole that keeps getting worse. Cars are swerving to avoid it. It’s dangerous at night and in the rain.",

    handledByType: "VOICE_BOT",
    handledByRole: "VOICE_BOT",
    handledByName: "INSIGHT VoiceBot",

    routingStatus: "PENDING_APPROVAL",
    assignedDepartment: null, // ✅ BLANK (bot-only until Supervisor picks + approves)
    approvedAt: null,
  },
];
