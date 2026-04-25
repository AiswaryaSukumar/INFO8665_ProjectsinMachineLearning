ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL;

UPDATE tickets
SET approved_at = COALESCE(updated_at, created_at)
WHERE approved_at IS NULL
  AND (
    UPPER(COALESCE(ticket_status, '')) = 'APPROVED'
    OR UPPER(COALESCE(routing_status, '')) = 'APPROVED'
  );
