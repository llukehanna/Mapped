-- Rebuilds every player's best from their ranked games. Run after deleting games by hand:
--   npm run recompute-bests -- --remote   (production)
--   npm run recompute-bests -- --local    (local dev database)
DELETE FROM bests;
INSERT INTO bests (user_id, board, game_id, hints, ms, finished_at)
SELECT user_id, board, id, hints, ms, finished_at FROM (
  SELECT g.*, row_number() OVER (PARTITION BY user_id, board ORDER BY hints, ms, finished_at) AS n
  FROM games g WHERE ranked = 1 AND user_id IS NOT NULL AND board IS NOT NULL
) WHERE n = 1;
