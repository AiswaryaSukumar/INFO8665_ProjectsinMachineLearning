# **INSIGHT-311 Web Agent (Frontend)**

INSIGHT-311 is an AI-assisted municipal operations dashboard prototype developed for the INFO8665 Project in Machine Learning.

This `web-agent` folder contains the React + Vite frontend application used by Operators and Supervisors to manage service requests (311 tickets).

## **Tech Stack**

- React (Vite)
- JavaScript (ES6+)
- Context + Hooks
- Mock Data (temporary)
- Planned REST API integration

## **Folder Structure**

```text
frontend/web-agent/
│
├── public/
│   └── mock/                 # Sample call recordings
│
├── src/
│   ├── api/                  # API client (future backend integration)
│   ├── assets/               # Images and icons
│   ├── components/           # UI components
│   ├── data/                 # Static operator/supervisor config
│   ├── mock/                 # Mock ticket data
│   ├── pages/                # Application pages
│   ├── utils/                # Routing + ticket utilities
│   ├── App.jsx
│   └── main.jsx
│
├── vite.config.js
├── package.json
└── README.md
```

## **Core Features Implemented**

### *1. Voice Bot Ticket Creation*
- AI transcript simulation
- Auto category detection
- Auto tone detection
- Confidence scoring
- Bot-only tickets require Supervisor approval

### *2. Human Operator Ticket Creation*
- Manual ticket entry
- Auto serial ticket numbering
- Department routing logic

### *3. Role-Based Visibility*
- Operators cannot see pure bot-only tickets
- Supervisors see all tickets
- Approval lane only visible to Supervisor

### *4. Routing & Approval Workflow*
- Voice Bot → Supervisor
- Supervisor approval → Assigned to Operator
- Automatic round-robin operator assignment

### *5. Dashboard & Analytics*
- Donut chart (Voice Bot vs Human)
- Status segmentation (NEW / IN_PROGRESS / NEEDS_REVIEW / ESCALATED)
- Real-time lane filtering

### *6. Advanced Filtering*
- Search (ticket number, name, location, keywords)
- Quick filters:
  - Needs Review
  - Escalated
- Queue lanes:
  - All
  - Mine
  - In Progress
  - Resolved
  - Approval (Supervisor only)

## **Current Mode: Mock-Only**

The frontend currently runs in **mock mode**.

There is no backend connected yet.

All ticket data is loaded from:

```
src/mock/mockTickets.js
```

API integration is prepared but disabled until backend is available.

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

