-- Housekeeping only scans unfinished games by start time now. Unclaimed finished games (kept 90 days) go through games_user instead.
DROP INDEX games_stale;
CREATE INDEX games_abandoned ON games (started_at) WHERE finished_at IS NULL;
