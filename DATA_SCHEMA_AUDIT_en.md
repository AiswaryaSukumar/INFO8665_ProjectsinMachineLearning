# Data Schema Audit — Backend ↔ DB ↔ UI

> Created on: 2026-03-20  
> Purpose: To identify the current implementation status and use it as a reference for future consistency work

---

## 1. Neon DB — `tickets` Table Columns (based on `db_service/main.py`)

| Column Name          | Type     | Default Value | Nullable |
|----------------------|----------|---------------|----------|
| `ticket_id`          | String   | —             | No (PK)  |
| `session_id`         | String   | —             | Yes      |
| `ticket_status`      | String   | `"NEW"`       | Yes      |
| `channel`            | String   | —             | No       |
| `department`         | String   | —             | Yes      |
| `category`           | String   | —             | Yes      |
| `location`           | String   | —             | Yes      |
| `description`        | Text     | —             | Yes      |
| `caller_name`        | String   | —             | Yes      |
| `phone_number`       | String   | —             | Yes      |
| `severity`           | String   | —             | Yes      |
| `created_at`         | DateTime | utcnow        | Yes      |
| `updated_at`         | DateTime | utcnow        | Yes      |
| `routing_status`     | String   | —             | Yes      |
| `workflow_stage`     | String   | —             | Yes      |
| `created_by_type`    | String   | —             | Yes      |
| `created_by_name`    | String   | —             | Yes      |
| `created_by_role`    | String   | —             | Yes      |
| `handled_by_type`    | String   | —             | Yes      |
| `handled_by_name`    | String   | —             | Yes      |
| `handled_by_role`    | String   | —             | Yes      |
| `notes`              | Text     | —             | Yes      |
| `transcript`         | Text     | —             | Yes      |
| `recording_url`      | String   | —             | Yes      |
| `rejected_reason`    | Text     | —             | Yes      |
| `deleted_reason`     | Text     | —             | Yes      |

---

## 2. Backend API — `ticket_service/main.py`

### 2-1. `POST /tickets/` — Create Ticket

**Request body (TicketCreateRequest)**:
```json
{
  "channel":          "string (required)",
  "session_id":       "string | null",
  "category":         "string | null",
  "department":       "string | null",
  "location":         "string | null",
  "description":      "string | null",
  "caller_name":      "string | null",
  "phone_number":     "string | null",
  "severity":         "string | null",
  "ticket_status":    "string (default: NEW)",
  "routing_status":   "string | null",
  "workflow_stage":   "string | null",
  "created_by_type":  "string | null",
  "created_by_name":  "string | null",
  "created_by_role":  "string | null",
  "notes":            "string | null",
  "transcript":       "string | null",
  "recording_url":    "string | null"
}
```

**Response**: Result of `ticket_to_dict()` (see section 3 below)

---

### 2-2. `GET /tickets/` — Retrieve Ticket List

Query params: `ticket_status`, `channel`

**Response**:
```json
{
  "total": 0,
  "tickets": [ ...ticket_to_dict()... ]
}
```

---

### 2-3. `PUT /tickets/{ticket_id}` — Update

**Request body (TicketUpdateRequest)**:
```json
{
  "ticket_status": "string | null",
  "updates": { "any_field": "value" }
}
```

> ⚠️ **Mismatch warning**: Fields must be placed inside the `updates` dictionary.  
> Since the UI's `mapUiPatchToBackend()` returns a flat object,  
> only `ticket_status` is recognized, and the remaining fields (`department`, `category`, etc.) are ignored.

---

### 2-4. `POST /tickets/{ticket_id}/approve`

No body required. The following fields are set automatically:
- `ticket_status` → `"APPROVED"`
- `workflow_stage` → `"APPROVED_BY_SUPERVISOR"`
- `routing_status` → `"APPROVED"`

---

### 2-5. `POST /tickets/{ticket_id}/reject`

**Request body**:
```json
{ "rejected_reason": "string" }
```
- `ticket_status` → `"REJECTED"`
- `workflow_stage` → `"REJECTED_BY_SUPERVISOR"`
- `routing_status` → `"REJECTED"`

---

### 2-6. `POST /tickets/{ticket_id}/resolve`

No body required.
- `ticket_status` → `"RESOLVED"`
- `workflow_stage` → `"COMPLETED"`

---

### 2-7. Backend Response Fields (return value of `ticket_to_dict`)

```json
{
  "ticket_id":        "311-2026-000001",
  "session_id":       "string | null",
  "ticket_status":    "NEW | NEEDS_REVIEW | APPROVED | REJECTED | RESOLVED | DELETE",
  "channel":          "string",
  "department":       "string | null",
  "category":         "string | null",
  "location":         "string | null",
  "description":      "string | null",
  "caller_name":      "string | null",
  "phone_number":     "string | null",
  "severity":         "string | null",
  "created_at":       "ISO8601 string | null",
  "updated_at":       "ISO8601 string | null",
  "routing_status":   "string | null",
  "workflow_stage":   "string | null",
  "created_by_type":  "string | null",
  "created_by_name":  "string | null",
  "created_by_role":  "string | null",
  "handled_by_type":  "string | null",
  "handled_by_name":  "string | null",
  "handled_by_role":  "string | null",
  "notes":            "string | null",
  "transcript":       "string | null",
  "recording_url":    "string | null",
  "rejected_reason":  "string | null",
  "deleted_reason":   "string | null"
}
```

---

## 3. UI Internal Field Names ↔ Backend Field Name Mapping

Based on `mapBackendTicketToUi()` / `mapUiPatchToBackend()` / `mapUiCreateToBackend()`

| UI Internal (camelCase) | Backend / DB (snake_case) | Notes |
|-------------------------|---------------------------|-------|
| `id`, `ticketId`        | `ticket_id`               | |
| `ticketNumber`          | `ticket_number`           | ⚠️ Column does not exist in DB |
| `name`, `callerName`    | `caller_name`             | |
| `phone`, `phoneNumber`  | `phone_number`            | |
| `status`, `ticketStatus` | `ticket_status`          | |
| `assignedDepartment`, `department` | `department`   | |
| `category`              | `category`                | |
| `location`              | `location`                | |
| `description`           | `description`             | |
| `severity`              | `severity`                | |
| `channel`               | `channel`                 | |
| `sessionId`             | `session_id`              | |
| `routingStatus`         | `routing_status`          | |
| `workflowStage`         | `workflow_stage`          | |
| `createdAt`             | `created_at`              | |
| `updatedAt`             | `updated_at`              | |
| `createdByType`         | `created_by_type`         | |
| `createdByName`         | `created_by_name`         | |
| `createdByRole`         | `created_by_role`         | |
| `handledByType`         | `handled_by_type`         | |
| `handledByName`         | `handled_by_name`         | |
| `handledByRole`         | `handled_by_role`         | |
| `recordingUrl`          | `recording_url`           | |
| `rejectedReason`        | `rejected_reason`         | |
| `deletedReason`         | `deleted_reason`          | |
| `notes`                 | `notes`                   | |
| `transcript`            | `transcript`              | |
| **`sessionHistory`**    | `session_history`         | ⚠️ Column does not exist in DB |
| **`confidence`**        | `confidence`              | ⚠️ Column does not exist in DB |
| **`approvedAt`**        | `approved_at`             | ⚠️ Column does not exist in DB |

---

## 4. Identified Mismatches (Items Requiring Fixes)

### 🔴 HIGH — Likely to Cause Functional Errors

| # | Location | Issue | Suggested Fix |
|---|----------|-------|---------------|
| 1 | `PUT /tickets/{id}` | The UI sends a flat object, but the backend expects the structure `{ticket_status, updates:{}}`. All fields except `ticket_status` are ignored. | Wrap the value returned by `mapUiPatchToBackend()` as `{updates: {...}}` in the UI, or modify backend `TicketUpdateRequest` to accept a flat structure |
| 2 | `ui/web-agent/.env` | `VITE_API_BASE_URL=http://127.0.0.1:8000/api` (port 8000), but the backend runs on port **8311** | Change the port to 8311 in `.env` |

### 🟡 MEDIUM — Data Omission / Silently Ignored

| # | Location | Issue | Suggested Fix |
|---|----------|-------|---------------|
| 3 | UI → Backend Create | The UI sends the `session_history` field, but there is no corresponding DB column. The backend silently ignores it. | Add the column to the DB or remove it from the UI |
| 4 | UI display | The UI tries to read `ticketNumber` from `ticket_number`, but it does not exist in the DB/backend. It falls back to `ticket_id`. | Explicitly set `ticketNumber = ticket_id` in the UI |
| 5 | UI display | The UI tries to display `confidence` and `approvedAt`, but they do not exist in the DB. | Add DB columns or remove them from the UI |

### 🟢 LOW — Currently Works but Needs Verification

| # | Location | Issue | Suggested Fix |
|---|----------|-------|---------------|
| 6 | Voice → DB | `_create_ticket()` in `orchestrator/main.py` saves `ticket_status: "submitted"` (lowercase). The UI expects uppercase values such as `"NEW"`, `"APPROVED"`, etc. | Standardize it to `"NEW"` or `"NEEDS_REVIEW"` in the orchestrator |
| 7 | `deleteTicket()` | The UI sends `status: DELETE` via PUT, but the backend has no dedicated `/delete` endpoint. Due to the PUT mismatch (#1), this is not actually saved. | Add a dedicated `/delete` endpoint, or first fix the PUT mismatch |

---

## 5. Ticket Status Definitions

| Value           | Meaning              | Where Set |
|----------------|----------------------|-----------|
| `NEW`          | Newly submitted      | Default value |
| `NEEDS_REVIEW` | Needs review         | orchestrator or UI |
| `APPROVED`     | Approved             | `/approve` endpoint |
| `REJECTED`     | Rejected             | `/reject` endpoint |
| `RESOLVED`     | Resolved             | `/resolve` endpoint |
| `DELETE`       | Deleted (soft delete) | UI only (via PUT) |

---

## 6. Ticket ID Format

```
311-{YYYY}-{000001}

Example: 311-2026-000001  (first ticket of 2026)
         311-2026-000010  (tenth ticket of 2026)
```

Generation logic: Count the number of tickets with the same yearly prefix in the DB, then add +1 (`generate_ticket_id()` in `db_service/main.py`)

---

## 7. Current API URL Status

| Service | Current Setting | Correct Value |
|---------|-----------------|---------------|
| Backend (FastAPI) | `:8311` | `:8311` ✅ |
| UI `.env` `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api` | `http://127.0.0.1:8311/api` ❌ |


## 🔴 Two Things That Must Be Fixed Immediately

1. **`PUT /tickets/{id}` structure mismatch** — The UI sends a flat object, but the backend expects `{updates: {...}}` wrapping → most fields such as `department`, `category`, etc. are ignored.  
2. **UI port error** — `.env` points to `:8000`, but the backend runs on `:8311`.

## 🟡 Three Medium-Priority Items

- `session_history` field: sent by the UI, but no DB column exists  
- `ticketNumber`, `confidence`, `approvedAt`: referenced by the UI, but do not exist in the DB

## 🟢 Low Priority

- Voice ticket `ticket_status` is stored as `"submitted"` (lowercase), which differs from the UI's expected values  
- `deleteTicket()` — not actually saved due to the PUT mismatch
