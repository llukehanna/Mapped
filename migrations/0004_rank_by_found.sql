-- Boards now rank most found first (unfinished runs count), then fewest hints, then fastest.
ALTER TABLE bests ADD COLUMN found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bests ADD COLUMN total INTEGER NOT NULL DEFAULT 0;
UPDATE bests SET found = (SELECT g.found FROM games g WHERE g.id = bests.game_id), total = (SELECT g.total FROM games g WHERE g.id = bests.game_id);
DROP INDEX bests_rank;
CREATE INDEX bests_rank ON bests (board, found DESC, hints, ms, finished_at);
