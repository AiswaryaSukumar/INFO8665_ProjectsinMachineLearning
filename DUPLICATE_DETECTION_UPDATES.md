# INSIGHT-311 Duplicate Detection, Work Queue, and Ticket Workflow Handover

Last updated: 2026-04-25

This document is the technical handover for duplicate detection, My Work Queue, System Ticket Registry, approval timestamps, and low-confidence explanation work completed so far.

## Executive Summary

The system now supports deterministic duplicate candidate detection, supervisor merge review, canonical parent handling, duplicate chain repair, visible duplicate relationships in the queue, approval timestamp persistence, confidence explanations, scroll-safe queue tables, complete registry visibility, and consistent newest-first ordering.

Key behavior now in place:

- Duplicate candidates are generated at 60% similarity and above.
- The UI displays similar tickets at 60% and above.
- Merge is enabled only at 80% and above.
- The backend also rejects merge attempts below 80%.
- A merged child ticket is retained for audit, marked `RESOLVED / MERGED / MERGED_DUPLICATE`, and linked to the canonical parent.
- System Ticket Registry displays all tickets by default, including resolved, merged, dismissed, rejected, deleted, and any other workflow state.
- My Work Queue and System Ticket Registry are sorted newest-first by `created_at`; fallback is ticket number/id descending.
- My Work Queue table is scroll-safe for large result sets and zoomed layouts.
- Approved tickets persist and display `approved_at`.
- Low-confidence tickets show field-level explanation on the ticket detail page.

## Before vs After

### Duplicate Detection

Before:

- Duplicate detection was not fully persisted or consistently exposed in the operational UI.
- Merged chains could leave stale intermediate relationships.
- Child duplicate records could be hard to trace after merge.
- Merge eligibility was mostly a UI concern.

After:

- Duplicate candidates are stored in `duplicate_candidates`.
- Candidates include score breakdowns for category, location, text, and time.
- Existing final candidate rows (`MERGED`, `DISMISSED`) are preserved.
- Merge is blocked below 80% in both UI and API.
- Chain repair enforces one canonical parent and dismisses stale/self-link rows.
- Merged children stay visible in the registry and point back to the canonical parent through duplicate candidate metadata.

### My Work Queue

Before:

- Filtered views could appear in inconsistent order.
- Long ticket lists made the page grow vertically.
- Zoomed layouts could squeeze or break the wide table.
- Ticket number/date/description fields were dense and hard to scan.

After:

- All queue filters keep newest-first order.
- Ticket table has an internal max-height scroll area (`70vh`).
- Wide columns scroll horizontally instead of breaking the layout.
- Ticket number is split into two lines, for example `311-2026` / `000097`.
- Created and approved timestamps display as `yyyy/mm/dd` / `hh:mm:ss`.
- Description cell has a structured two-line summary plus score footer.
- Confidence Score and Tone Score appear at the bottom of each row description block.

### System Ticket Registry

Before:

- The registry could unintentionally behave like an active-ticket list when `ALL` was selected.
- Resolved, rejected, deleted, or merged records could disappear from the default registry view after actions.

After:

- `HISTORY` / System Ticket Registry treats both `ALL` and `ALL_TICKETS` as a full historical registry.
- Status filters still work when explicitly selected.
- All records remain searchable and traceable for audit/history.
- Sorting remains newest-first.

## Backend Changes

### `ticket_service/duplicate_detection.py`

Purpose: deterministic duplicate scoring, candidate generation, candidate persistence, and candidate listing.

Important constants:

- `MATCH_THRESHOLD = 60.0`
  - Required so similar tickets are available for display starting at 60%.
- `LOOKBACK_DAYS = 14`
  - Limits candidate search to recent tickets.
- `MAX_CANDIDATES = 8`
  - Caps saved candidates per detection run.
- `PAIR_FINAL_STATUSES = {"DISMISSED", "MERGED"}`
  - Prevents final reviewed decisions from being overwritten by later recomputation.

Implemented behavior:

- Normalizes categories and common aliases before scoring.
- Normalizes street/location text before comparison.
- Builds duplicate text body from description, transcript, and notes.
- Scores each pair using:
  - category score
  - location score
  - text score
  - time score
- Computes weighted `match_score`.
- Filters out deleted/rejected tickets as candidates.
- Filters out already-merged child tickets so they do not become new parent candidates.
- Upserts pending candidate pairs in either direction.
- Preserves existing `MERGED` and `DISMISSED` decisions.
- Lists candidates newest-first by candidate creation time.

Why:

- Deterministic scoring makes review reproducible.
- 60% threshold supports operator awareness without allowing premature merge.
- Preserving final decisions prevents dismissed or merged pairs from reappearing as pending work.

### `ticket_service/duplicates.py`

Purpose: duplicate REST API, merge action, canonical parent resolution, chain repair.

Important endpoints:

- `GET /api/duplicates/`
  - Lists duplicate candidates.
  - Default list excludes dismissed rows from the active duplicate panel.
- `GET /api/duplicates/ticket/{ticket_id}`
  - Lists duplicate candidates related to one ticket.
- `POST /api/duplicates/ticket/{ticket_id}/recompute`
  - Recomputes candidates for one ticket.
- `POST /api/duplicates/{duplicate_id}/dismiss`
  - Marks a candidate as dismissed.
- `POST /api/duplicates/{duplicate_id}/merge`
  - Merges a duplicate candidate.
  - Rejects requests below 80% similarity.
- `POST /api/duplicates/repair-chains`
  - Repairs already-merged chain data.

Canonical parent handling:

- `_resolve_canonical_parent_id(ticket_id, db)`
  - Follows `MERGED` links until an active canonical parent is found.
  - Stops when the current ticket is not an actual merged child.
- `_choose_group_parent_id(left_id, right_id, db)`
  - Chooses the parent for an immediate merge.
  - Preserves an active parent when one side is already a merged child.
- `_choose_component_parent_id(ticket_ids, db)`
  - Chooses one canonical parent for a connected duplicate group.
  - Prefers active non-merged tickets.
  - Then uses inbound merged-link strength.
  - Then falls back to oldest created ticket.

Merge behavior:

- `merge_duplicate(...)` verifies the candidate exists.
- It rejects merge requests when `match_score < 80`.
- It determines the canonical parent.
- It marks the duplicate child as:
  - `ticket_status = RESOLVED`
  - `routing_status = MERGED`
  - `workflow_stage = MERGED_DUPLICATE`
- It writes internal notes to preserve audit context.
- It relinks existing children from intermediate parents to the canonical parent.
- It enforces duplicate group invariants after merge.

Chain repair behavior:

- `_connected_merged_ticket_ids(seed_ids, db)` builds the connected duplicate component.
- `_ensure_group_candidate(child_id, parent_id, reviewer, db)` ensures every child has a direct child-to-parent row.
- `_enforce_duplicate_group(seed_ids, reviewer, db)` enforces:
  - one canonical parent
  - no self-links
  - no stale intermediate merged edges
  - all duplicate children closed as merged
  - stale rows dismissed
- `repair_merged_duplicate_chains(...)` scans existing merged candidates and repairs bad chains.

Why:

- Merged duplicates must be traceable, not deleted.
- Audit needs one clear canonical parent.
- Duplicate chains can form over time; repair prevents stale parent references from confusing the UI.

### `ticket_service/main.py`

Purpose: ticket API and ticket serialization.

Changes:

- `ticket_to_dict(...)` returns:
  - `approved_at`
  - ML confidence fields
  - tone/sentiment fields
  - department workflow fields
- `create_ticket(...)` calls `find_and_store_duplicates(...)` after creating a ticket.
- `update_ticket(...)` recomputes duplicate candidates when duplicate-relevant fields change:
  - `category`
  - `location`
  - `description`
  - `notes`
  - `transcript`
- `approve_ticket(...)` sets:
  - `ticket_status = APPROVED`
  - `workflow_stage = APPROVED_BY_SUPERVISOR`
  - `routing_status = APPROVED`
  - `approved_at = datetime.utcnow()`

Why:

- Duplicate detection must run when a ticket enters or changes in ways that affect similarity.
- Approval time must be persisted instead of inferred from generic `updated_at`.

### `db_service/main.py`

Purpose: SQLAlchemy models and repositories.

Model changes:

- `Ticket.approved_at`
  - Stores supervisor approval timestamp.
- `Ticket.confidence_scores`
  - JSON field for ML confidence details.
- `Ticket.confidence_alert`
  - Stores low-confidence alert flag.
- `Ticket.alerted_fields`
  - JSON list of low-confidence fields.
- `Ticket.sentiment_score`, `sentiment_label`, `sentiment_flag`
  - Store ML sentiment/tone evidence.
- `Ticket.tone`, `tone_confidence`, `tone_source`
  - Store caller tone information.
- `Ticket.priority`, `escalation`, `department_status`
  - Store workflow/department metadata.
- `DuplicateCandidate`
  - Stores candidate pair, score breakdown, status, reviewer, and timestamps.
  - Has unique constraint on `(ticket_id, candidate_ticket_id)`.

Repository changes:

- `TicketRepository.search_tickets(...)`
  - Returns tickets ordered by `created_at DESC NULLS LAST`, then `ticket_id DESC`.

Why:

- Backend response ordering now supports newest-first UI behavior.
- Frontend still sorts after filtering as a second guard.

### `orchestrator/main.py`

Purpose: voice ticket orchestration.

Change:

- Calls `find_and_store_duplicates(...)` after a voice-created ticket is submitted.

Why:

- Voice tickets participate in the same duplicate detection workflow as UI-created tickets.

### `ticket_service/test_duplicates.py`

Purpose: focused duplicate-chain regression tests.

Coverage added:

- Existing chain parent wins over an older newly compared ticket.
- Duplicate group enforcement closes children and dismisses self-links.
- Detection ignores already-merged child tickets.
- Stale intermediate merged edges are not left active.

## Database Migrations

### `db_service/migrations/add_duplicate_candidates.sql`

Adds:

- `duplicate_candidates` table.
- Candidate score columns:
  - `match_score`
  - `category_score`
  - `location_score`
  - `text_score`
  - `time_score`
- `reason_codes`
- status/reviewer/timestamp fields
- unique constraint on `(ticket_id, candidate_ticket_id)`
- indexes for ticket id, candidate ticket id, status, and created time.

Why:

- Persist duplicate evidence and review state.

### `db_service/migrations/add_approved_at.sql`

Adds:

- `tickets.approved_at`

Backfill logic:

- Sets `approved_at = COALESCE(updated_at, created_at)` for older tickets where:
  - `ticket_status = APPROVED`, or
  - `routing_status = APPROVED`
- Only fills records where `approved_at IS NULL`.

Why:

- Older approved tickets need a displayable approved timestamp without overwriting already-correct values.

### `db_service/migrations/add_ml_columns.sql`

Adds:

- `confidence_scores`
- `confidence_alert`
- `alerted_fields`
- `sentiment_score`
- `sentiment_label`
- `sentiment_flag`

Why:

- Ticket detail pages need stored confidence and sentiment evidence to explain low-confidence routing risks.

Known schema note:

- The checked-in `add_ml_columns.sql` covers confidence and sentiment fields. Some model fields such as tone/priority/escalation/department status are represented in ORM code and may rely on an existing database schema or separate environment migration history. Verify production schema before deploying to a fresh database.

## Frontend Changes

### `ui/web-agent/src/api/duplicates.js`

Purpose: duplicate candidate frontend API adapter.

Implemented:

- `fetchDuplicates(params)`
- `mergeDuplicate(duplicateId, reviewedBy)`
- `dismissDuplicate(duplicateId, reviewedBy)`
- `normalizeDuplicateCandidate(candidate)`
- `normalizeTicketSummary(ticket)`
- Score normalization from either 0-1 or 0-100 payloads into 0-100 display percentages.

Why:

- UI components should consume stable camelCase candidate data.
- Score normalization prevents threshold bugs if a payload uses fractional scores.

### `ui/web-agent/src/api/tickets.js`

Purpose: ticket API adapter.

Implemented:

- Maps backend `approved_at` to frontend `approvedAt`.
- Maps backend confidence fields to:
  - `confidenceScores`
  - `confidenceAlert`
  - `alertedFields`
- Maps backend tone/sentiment values to queue display fields.
- Normalizes backend ticket shape into UI-friendly ticket objects.

Why:

- Frontend components need one consistent ticket shape.

### `ui/web-agent/src/pages/IntakePage.jsx`

Purpose: dashboard orchestration for My Work Queue, System Ticket Registry, duplicate candidate display, filtering, sorting, and actions.

Duplicate integration:

- Fetches duplicate candidates with `fetchDuplicates({ limit: 200 })`.
- Builds `duplicateByTicketId`.
- Adds lookup entries for both sides of a duplicate candidate pair.
- Displays candidates only when score is 60% or higher.
- Reloads tickets and duplicate candidates after merge.
- Routes duplicate links to the ticket detail page even when the related ticket is outside the current table rows.

Sorting:

- Adds shared `compareNewestTickets(a, b)` behavior.
- Sorts by `createdAt` / `created_at` descending.
- Falls back to `ticketNumber`, `ticketId`, `ticket_id`, or `id` descending with numeric comparison.
- Applies sorting after filtering/searching.
- Applies sorting after refresh/action reloads.

System Ticket Registry visibility:

- `HISTORY` view now treats both `ALL` and `ALL_TICKETS` as full historical registry views.
- It no longer excludes resolved, rejected, deleted, merged duplicate, dismissed, or other workflow states by default.
- Existing filters remain available for narrowing the registry.

Why:

- My Work Queue is an operational list.
- System Ticket Registry is an audit/history list and must not hide records unintentionally.

### `ui/web-agent/src/components/TicketTable.jsx`

Purpose: shared ticket table used by My Work Queue and registry views.

Implemented:

- Ticket number split into two lines:
  - prefix: `311-2026`
  - suffix: `000097`
- Created timestamp split into:
  - `yyyy/mm/dd`
  - `hh:mm:ss`
- Approved timestamp split into:
  - `yyyy/mm/dd`
  - `hh:mm:ss`
- Description is structured into:
  - issue/category and location line
  - name/contact line
- Confidence Score and Tone Score appear at bottom of row description block.
- Duplicate column appears between Tone and Created By.
- Similar ticket display at 60% and above.
- Merge button enabled only at 80% and above.
- Merge button disabled with tooltip below 80%.
- After merge, related ticket displays as a clickable link.

Why:

- The queue needs dense, readable rows without losing audit context.

### `ui/web-agent/src/pages/QueueOverviewPanel.jsx`

Purpose: duplicate detection panel on queue overview.

Implemented:

- API-backed duplicate rows replace mock duplicate display.
- Merge and dismiss actions are available.
- Dismissed rows are hidden from default active duplicate panel.
- Displays canonical parent information for merged groups.
- Shows active pending rate rather than all historical duplicates.

Why:

- Supervisors need an actionable duplicate panel without historical dismissed noise.

### `ui/web-agent/src/pages/TicketDetailsPage.jsx`

Purpose: full ticket detail page.

Implemented:

- Created timestamp displays as stacked date/time.
- Approved timestamp displays as stacked date/time after approval.
- Confidence explanation panel shows low-confidence evidence.
- Uses:
  - `alertedFields`
  - missing required values
  - per-field confidence scores below 70%
- Fallback explanation tells reviewers to check location, category, description, caller name, and contact number.

Why:

- Reviewers need to know which captured fields caused low confidence, not just see a low label.

### `ui/web-agent/src/components/TicketDetailsDrawer.jsx`

Purpose: queue-side ticket drawer.

Implemented:

- Shows approved timestamp after approval.
- Shows confidence explanation for low-confidence voice bot tickets.

Why:

- Queue-side review should expose the same risk context as full details.

### `ui/web-agent/src/styles.css`

Purpose: queue layout, table layout, scroll behavior, and responsive hardening.

Implemented:

- Table uses fixed layout with a stable min width.
- Horizontal table scrolling is preserved.
- Internal ticket-list scroll area added:
  - `.ttTableWrap .tableWrap { max-height: 70vh; overflow-y: auto; }`
- Sticky table header works inside the scrollable area.
- Container/card/table wrappers use `min-width: 0` or constrained overflow to avoid zoom breaking.
- Ticket number/date/approval stacks are styled for two-line display.
- Duplicate mini panel, score footer, and approval timestamp display are styled.

Why:

- Long queues should not make the entire page excessively tall.
- Zoomed layouts should scroll instead of breaking.

## Threshold Rules

Display threshold:

- Similar tickets appear in My Work Queue and duplicate UI only when score is 60% or higher.

Merge threshold:

- Merge button is enabled only when score is 80% or higher.
- Backend `POST /api/duplicates/{duplicate_id}/merge` rejects below 80%.

Reasoning:

- 60-79% is useful operator awareness but not safe enough for one-click merge.
- 80% and above is treated as reviewable merge confidence.

## Parent-Child Visibility After Merge

After a merge:

- Canonical parent stays active and visible where appropriate.
- Child ticket remains in the database and registry.
- Child ticket is marked:
  - `ticket_status = RESOLVED`
  - `routing_status = MERGED`
  - `workflow_stage = MERGED_DUPLICATE`
- Parent notes record merged child context.
- Duplicate candidate row records child-to-parent relationship.
- UI duplicate links can navigate to related tickets.

Why:

- Merged child records are part of audit history and must remain traceable.

## System Ticket Registry Rules

The registry is a full historical record.

Default registry behavior:

- Show all tickets.
- Include every status and workflow state.
- Keep newest-first order.

Included examples:

- `NEW`
- `APPROVED`
- `IN_PROGRESS`
- `RESOLVED`
- `MERGED_DUPLICATE`
- `DISMISSED`
- `DELETE`
- `REJECTED`
- any future/unknown workflow status

Filter behavior:

- Existing filters remain available.
- A selected status filter narrows the registry.
- Clearing/toggling back to `ALL` returns to the full historical registry.

## Testing and Verification Performed

Run from:

```powershell
C:\Users\user\1557_VSC\INSIGHT311_Latest\insight311
```

Backend compile:

```powershell
python -m py_compile ticket_service\duplicates.py ticket_service\duplicate_detection.py ticket_service\test_duplicates.py
python -m py_compile ticket_service\main.py db_service\main.py orchestrator\main.py
python -m py_compile db_service\main.py ticket_service\main.py ticket_service\duplicates.py
```

Duplicate regression tests:

```powershell
python -m unittest ticket_service.test_duplicates
```

Observed result:

- 3 tests passed.
- Python emitted `datetime.utcnow()` deprecation warnings under Python 3.14; tests still passed.

Frontend build:

```powershell
cd ui\web-agent
npm run build
```

Observed result:

- Vite production build completed successfully.

Local UI smoke check:

```powershell
cd ui\web-agent
npm run dev -- --host 127.0.0.1
```

Observed result:

- Local dev server responded with HTTP 200 at `http://127.0.0.1:5173/`.

Manual verification checklist:

1. Create two similar tickets scoring 60-79%.
2. Confirm duplicate appears in the queue and merge button is disabled.
3. Create two similar tickets scoring 80% or higher.
4. Confirm merge button is enabled.
5. Merge the duplicate.
6. Confirm child is marked `RESOLVED / MERGED / MERGED_DUPLICATE`.
7. Confirm parent remains visible and child remains visible in System Ticket Registry.
8. Confirm duplicate link opens related ticket detail.
9. Approve a voice bot ticket.
10. Confirm `approved_at` displays as date/time.
11. Open low-confidence ticket detail.
12. Confirm confidence explanation names low/missing fields.
13. Switch queue filters (`All Active`, `New`, `Approved`, `Resolved`, etc.).
14. Confirm newest-first sorting remains stable.
15. Open System Ticket Registry.
16. Confirm all tickets are visible by default.
17. Use browser zoom at 150-200%.
18. Confirm the queue scrolls horizontally/vertically without breaking layout.
19. Create many tickets.
20. Confirm table body scrolls internally and page height does not grow indefinitely.

## Reproducibility Notes

To reproduce candidate generation:

1. Create a new ticket.
2. Ensure it has category, location, and description similar to an existing ticket.
3. Backend calls `find_and_store_duplicates(...)`.
4. Candidate appears from `GET /api/duplicates/` if score is 60% or higher.

To reproduce merge:

1. Use a candidate with `match_score >= 80`.
2. Call `POST /api/duplicates/{duplicate_id}/merge`.
3. Refresh tickets and duplicate candidates.
4. Confirm child is resolved/merged and parent remains canonical.

To reproduce chain repair:

1. Create a duplicate group with intermediate merged links.
2. Call `POST /api/duplicates/repair-chains`.
3. Confirm direct child-to-canonical-parent links exist.
4. Confirm self-links/stale intermediate links are dismissed.

## Safe Rollback Understanding

Frontend-only rollback:

- Revert `ui/web-agent/src/pages/IntakePage.jsx` to remove queue/registry sorting and visibility changes.
- Revert `ui/web-agent/src/components/TicketTable.jsx` to remove duplicate mini display, stacked fields, and row score footer.
- Revert `ui/web-agent/src/styles.css` to remove scroll/zoom/table layout changes.
- This affects display behavior only; it does not remove database rows.

Duplicate UI rollback:

- Stop passing `duplicateByTicketId` and `onMergeDuplicate` into `TicketTable`.
- Keep backend candidate data intact.
- Queue would no longer expose inline duplicate actions, but duplicate API data remains.

Backend duplicate rollback:

- Stop calling `find_and_store_duplicates(...)` from ticket creation/update/orchestrator submission.
- Existing `duplicate_candidates` rows remain unless explicitly removed.
- Remove or ignore duplicate API routes if needed.
- Do not drop the table unless audit data is no longer required.

Approval timestamp rollback:

- UI can fall back to `updatedAt`, but this is less accurate.
- Keep `approved_at` column if already migrated; dropping it loses audit precision.

Database rollback caution:

- Dropping `duplicate_candidates` removes duplicate audit/review history.
- Dropping `approved_at` removes persisted approval timestamps.
- Dropping ML confidence columns removes explanation evidence.

## Known Remaining Gaps and Future Improvements

- The duplicate scoring model is deterministic and rule-based; future work could add embedding/geospatial scoring for better location similarity.
- The 14-day lookback may miss longer-running duplicate reports; this can be tuned per department/category.
- Candidate limit is capped at 8; high-volume categories may need pagination or wider review tooling.
- Current migration file `add_ml_columns.sql` includes confidence/sentiment columns, but fresh-environment schema validation should confirm tone, priority, escalation, and department status columns are present before deployment.
- Python 3.14 reports `datetime.utcnow()` deprecation warnings; future work should migrate to timezone-aware UTC timestamps.
- The queue currently uses table scrolling rather than row virtualization; extremely large registries could benefit from pagination or virtualized rows.
- Duplicate repair is available as an endpoint but should be run intentionally with reviewer identity and logged operationally.
- Manual visual QA should be repeated with real production-sized data and browser zoom settings.

## Files Touched So Far

Backend:

- `db_service/main.py`
- `db_service/migrations/add_duplicate_candidates.sql`
- `db_service/migrations/add_approved_at.sql`
- `db_service/migrations/add_ml_columns.sql`
- `ticket_service/duplicate_detection.py`
- `ticket_service/duplicates.py`
- `ticket_service/main.py`
- `ticket_service/test_duplicates.py`
- `orchestrator/main.py`

Frontend:

- `ui/web-agent/src/api/duplicates.js`
- `ui/web-agent/src/api/tickets.js`
- `ui/web-agent/src/components/TicketTable.jsx`
- `ui/web-agent/src/components/TicketDetailsDrawer.jsx`
- `ui/web-agent/src/pages/IntakePage.jsx`
- `ui/web-agent/src/pages/QueueOverviewPanel.jsx`
- `ui/web-agent/src/pages/TicketDetailsPage.jsx`
- `ui/web-agent/src/styles.css`

Documentation:

- `DUPLICATE_DETECTION_UPDATES.md`
