# INSIGHT-311 Web Agent (Frontend)

INSIGHT-311 is an AI-assisted municipal operations dashboard developed as part of the INFO8665 – Projects in Machine Learning and CSCN8030 – AI for Business Decision & Transformation courses at Conestoga College.

This web-agent application is the operational interface used by:

- Operators (e.g., Jerry, Tom)
- Supervisor (Nagavalli)
- AI Voice Bot intake system

## System Overview

INSIGHT-311 is a fully integrated AI-enabled municipal 311 system with:
- Live FastAPI backend (port 8311) with PostgreSQL (Neon Cloud)
- Real-time voice bot intake via Whisper STT + NLU pipeline (DistilBERT)
- Automated duplicate ticket detection with fuzzy scoring
- Role-based ticket workflow with supervisor governance
- SMS citizen notifications via Twilio + RAG-generated messages

## Tech Stack

- React (Vite), JavaScript ES6+
- Context API + Hooks
- Component-driven architecture
- Toast notification system
- Skeleton loading states
- Live REST API integration (`VITE_API_BASE_URL`)

## Folder Structure

```
ui/web-agent/
│
├── public/
│   └── mock/                 # Sample call recordings
│
├── src/
│   ├── api/                  # API client (live backend)
│   ├── assets/               # Images and icons
│   ├── components/
│   │   ├── TicketTable           # Sortable ticket list, role-based action buttons
│   │   ├── TicketDetailsDrawer   # Slide-in detail + audio player + transcript
│   │   ├── VoiceAssistantModal   # ISA voice chat (citizen + dev mode)
│   │   ├── TicketForm            # Human operator ticket creation
│   │   ├── TicketStatusOverview  # Status count summary
│   │   ├── DonutChart            # Voice Bot vs Human breakdown
│   │   ├── TicketTableControls   # Search + filter controls
│   │   └── ToastProvider         # Global toast notifications
│   │
│   ├── data/                 # Static operators + supervisor config
│   ├── pages/
│   │   ├── IntakePage            # Main operator work queue
│   │   ├── QueueOverviewPanel    # Analytics, KPIs, duplicate detection panel
│   │   ├── DashboardLayout       # Top nav shell
│   │   ├── LoginPage
│   │   ├── LandingPage
│   │   └── StatusLookupPage
│   ├── utils/                # Routing + ticket utilities
│   ├── App.jsx
│   └── main.jsx
│
├── vite.config.js
├── package.json
└── README.md
```

## Core Features

### 1. Voice Bot Ticket Creation
- Live voice intake via browser mic (WebSpeech API)
- Per-turn audio sent to Whisper STT → NLU pipeline
- Auto-detected: category, location, caller name, phone number
- Tone detection: CALM / AGITATED / ANGRY (from RoBERTa sentiment)
- Confidence scoring per field with LOW_CONFIDENCE alert
- Confirmation loop with correction support
- Escalation to live agent after 3 failed attempts on a field
- Bot-created tickets routed to Supervisor for approval

### 2. Human Operator Ticket Creation
- Structured form with manual field entry
- Department auto-assigned by category
- Round-robin operator assignment
- Triggers duplicate detection on save

### 3. Role-Based Visibility

| Role | Access |
|------|--------|
| Operator | Own assigned tickets; no approval lane |
| Supervisor | All tickets; approval lane; duplicate Merge/Dismiss controls |

### 4. Duplicate Ticket Detection

Automatically runs on every ticket creation. Scoring:

| Dimension | Weight |
|-----------|--------|
| Category | 25% |
| Location | 45% |
| Text similarity | 20% |
| Time proximity | 10% |

Location scoring applies two penalties before fuzzy string match:
- **Direction mismatch** (e.g. "King St North" vs "King St West") → score capped at 10
- **Civic number distance** (diff > 50 → cap 35; diff > 20 → cap 60)

Pairs scoring ≥ 60 are surfaced in the Duplicate Detection panel. Pairs ≥ 80 show a Merge suggestion.

**Merge behavior:**
- Merged duplicate inherits the parent ticket's current status at merge time
- If the parent ticket's status later changes (approved, resolved, etc.), all its merged duplicates are automatically updated to match

**Merge button UX:** Button is disabled with "Merging…" label while a merge request is in-flight, preventing double-submission.

### 5. Workflow & Governance

```
Voice Bot Ticket → Supervisor Approval → Operator Assignment → In Progress → Resolved / Escalated
Human Ticket    → Direct Assignment   → In Progress          → Resolved / Escalated
```

Ticket statuses: `NEW` · `SUBMITTED` · `NEEDS_REVIEW` · `IN_PROGRESS` · `ESCALATED` · `RESOLVED` · `REJECTED` · `DELETED`

### 6. Dashboard & Analytics (QueueOverviewPanel)

- KPI cards: Total / Needs Review / Escalated / Active / Overdue / Resolved
- Voice Bot vs Human ticket source breakdown
- Tickets by category (bar chart, filterable by month)
- Ticket volume trends (Today / Week / Month)
- Duplicate detection panel with Merge / Dismiss actions
- SLA tracking: Overdue / Due <24h / On Track
- Complaint heatmap (geographic)
- False report penalty scores per operator

### 7. Filtering & Controls

- Search by ticket number, name, location, keyword
- Quick filters: Needs Review, Escalated
- Queue lanes: All / Mine / In Progress / Resolved / Approval (supervisor)

### 8. UI/UX Details

- Skeleton loading states on all async fetches
- Toast notifications (success/error with rollback)
- Percentage-based column widths + `vw`-relative font sizes for zoom responsiveness
- `ToneBadge` hides label at viewport < 900px; font scales via `min(10px, 0.65vw)`
- `ConfidenceBadge` uses `white-space: nowrap` to prevent wrapping at small sizes
- Parallel data loading (`Promise.all`) for ticket list + duplicate candidates after any mutation

## How to Run

### Prerequisites
- Backend running at `http://localhost:8311` (see root `insight311/` for backend setup)

### Install & start

```bash
npm install
npm run dev
```

Default URL: `http://localhost:5173`

### Environment

Set `VITE_API_BASE_URL` if the backend is not at the default address:

```
VITE_API_BASE_URL=http://localhost:8311/api
```
