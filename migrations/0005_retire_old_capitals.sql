-- Capitals · Type and Identify now name the country (v3.1). Runs under the old rules aren't comparable: unrank them and clear their bests.
UPDATE games SET ranked = 0, unranked_reason = 'retired'
WHERE board LIKE 'capitals:type:%' OR board LIKE 'capitals:identify:%';
DELETE FROM bests WHERE board LIKE 'capitals:type:%' OR board LIKE 'capitals:identify:%';
