ALTER TABLE scan_event ADD COLUMN override_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_event ADD COLUMN override_reason TEXT;
