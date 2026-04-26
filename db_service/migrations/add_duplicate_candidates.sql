-- Migration: Add deterministic duplicate detection candidates
-- Run once against the Neon PostgreSQL database.

CREATE TABLE IF NOT EXISTS duplicate_candidates (
    duplicate_id VARCHAR PRIMARY KEY,
    ticket_id VARCHAR NOT NULL,
    candidate_ticket_id VARCHAR NOT NULL,
    match_score FLOAT NOT NULL,
    category_score FLOAT,
    location_score FLOAT,
    text_score FLOAT,
    time_score FLOAT,
    reason_codes JSONB,
    status VARCHAR NOT NULL DEFAULT 'PENDING',
    reviewed_by VARCHAR,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_duplicate_candidate_pair UNIQUE (ticket_id, candidate_ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_ticket_id
    ON duplicate_candidates(ticket_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_candidate_ticket_id
    ON duplicate_candidates(candidate_ticket_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_status
    ON duplicate_candidates(status);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_created_at
    ON duplicate_candidates(created_at DESC);
