# **INSIGHT-311 Web Agent (Frontend)**

INSIGHT-311 is an AI-assisted municipal operations dashboard prototype developed as part of the INFO8665 – Projects in Machine Learning and CSCN8030 – AI for Business Decision & Transformation courses at Conestoga College.

This web-agent application represents the operational interface used by:

- Operators (e.g., Jerry, Tom)
- Supervisor (Nagavalli)
- AI Voice Bot intake system

The frontend simulates an AI-enabled municipal 311 system with structured workflows, routing logic, and role-based governance.

## **System Overview**

INSIGHT-311 demonstrates:
* AI-assisted ticket intake (voice transcript simulation)
* AI-driven category & tone detection
* Confidence-based approval workflow
* Role-based ticket visibility
* Operational queue management
* Supervisor-controlled governance layer

This version represents UI-complete (Mock Mode) with backend integration prepared.

## **Tech Stack**

* React (Vite)
* JavaScript (ES6+)
* Context API + Hooks
* Component-driven architecture
* Toast notification system
* Skeleton loading states
* Mock data (temporary)
* API client scaffold (backend-ready)

## **Folder Structure**

```text
frontend/web-agent/
│
├── public/
│   └── mock/                 # Sample call recordings
│
├── src/
│   ├── api/                  # API client scaffold (future backend)
│   ├── assets/               # Images and icons
│   ├── components/           # UI components
│   │   ├── TicketTable
│   │   ├── TicketDetailsDrawer
│   │   ├── VoiceIntakePanel
│   │   ├── TicketForm
│   │   ├── TicketStatusOverview
│   │   ├── DonutChart
│   │   ├── TicketTableControls
│   │   └── ToastProvider
│   │
│   ├── data/                 # Static operators + supervisor config
│   ├── mock/                 # Mock ticket data
│   ├── pages/                # Application pages
│   ├── utils/                # Routing + ticket utilities
│   │   ├── routing logic
│   │   ├── serial ticket number generator
│   │   └── assignment utilities
│   │
│   ├── App.jsx
│   └── main.jsx
│
├── vite.config.js
├── package.json
└── README.md
```

## **Core Features Implemented**

### *1. Voice Bot Ticket Creation*
- Transcript simulation panel
- Listening state indicator
- Auto category detection
- Auto tone detection (calm / frustrated / urgent)
- Confidence scoring
- Structured transcript display
- Bot-only tickets routed to Supervisor for approval

### *2. Human Operator Ticket Creation*
- Manual structured ticket entry
- Auto-generated serial ticket numbers
- Department-based routing logic
- Operator assignment logic (round-robin)

### *3. Role-Based Visibility*
- Operators
  * See assigned tickets
  * Cannot see pure bot-only tickets
  * No access to approval lane

- Supervisor
  * Sees all tickets
  * Approval lane visible
  * Can approve / reject bot tickets
  * Controls workflow transitions

### *4. Workflow & Governance Logic*
- Voice Bot Ticket →
- Supervisor Approval →
- Operator Assignment →
- In Progress →
- Resolved / Escalated

Routing includes:
  * Round-robin operator assignment
  * Escalation status handling
  * Needs Review lane
  * Department-based routing logic

### *5. Dashboard & Analytics*
- Donut chart (Voice Bot vs Human)
- Status segmentation:
  * NEW
  * IN_PROGRESS
  * NEEDS_REVIEW
  * ESCALATED
  * RESOLVED
- Real-time lane filtering
- Split-view layout (Ticket List + Detail Drawer)
- Context-preserving master-detail design

### *6. Advanced Filtering & Controls*
- Search:
  * Ticket number
  * Name
  * Location
  * Keywords

- Quick filters:
  * Needs Review
  * Escalated
  
- Queue lanes:
  * All Tickets
  * Mine
  * In Progress
  * Resolved
  * Approval (Supervisor only)

### *7. UI Resilience & UX Enhancements*

- Skeleton loading states
- Empty lane states
- Toast notifications (success/error)
- Error handling scaffold
- Clean status vocabulary
- Responsive layout structure
- Keyboard focus visibility (accessibility-ready)

## **Current Mode: Mock-Only**
The frontend currently operates in Mock Mode.

All ticket data loads from:

```
src/mock/mockTickets.js
```

Backend integration is scaffolded but not yet active.

The API client (src/api/client.js) is intentionally configured to throw an error unless VITE_API_BASE_URL is defined.

This enforces controlled backend activation.

## **Backend Integration Status**

- Prepared:
  * API client abstraction
  * Error handling strategy
  * Loading states
  * Toast rollback logic
  * Separation of UI vs data layer

- Pending:
  * REST API endpoints
  * WebSocket streaming for transcript partial/final segments
  * Persistent database integration
  * Authentication layer

## **How to Run Locally**

### *Install dependencies*

```bash
npm install
```
### *Start development server*
```bash
npm run dev
```
### *Default Vite URL:*
http://localhost:5173

