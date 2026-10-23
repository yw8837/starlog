-- 별자리 인연 (review 2026-10-23): a constellation whose friends' scores never show on its public share.
-- 1 once any star went in without the score notice (stars.score_public = 0), and never back to 0, through removed stars
-- and completion alike: the scores shown, taken from a total that is public anyway (the ranking, the completion image),
-- would give that friend's score away. Every constellation holding a star when this runs starts at 1.
ALTER TABLE constellations ADD COLUMN scores_private INTEGER NOT NULL DEFAULT 0;
UPDATE constellations SET scores_private = 1 WHERE EXISTS (SELECT 1 FROM stars WHERE stars.constellation_id = constellations.id);
