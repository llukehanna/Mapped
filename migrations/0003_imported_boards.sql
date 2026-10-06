-- Imported pre-accounts runs now sit on their board so they can be your personal best there (never ranked: ranked stays 0).
UPDATE games SET board = mode || ':' || scope_key
WHERE unranked_reason = 'imported' AND board IS NULL
  AND scope_key IN ('world', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania');
