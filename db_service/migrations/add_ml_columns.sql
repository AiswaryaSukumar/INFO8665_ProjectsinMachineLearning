-- Migration: Add ML confidence & sentiment columns to tickets table
-- Run once against the Neon PostgreSQL database

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS confidence_scores  JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS confidence_alert   VARCHAR(50);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS alerted_fields     JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentiment_score    FLOAT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentiment_label    VARCHAR(20);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentiment_flag     VARCHAR(50);
