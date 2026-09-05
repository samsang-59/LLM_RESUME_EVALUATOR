-- Jobs = the HR requirement list a resume is matched against (design doc 02).
-- Immutable in v1 (doc 07): no updates, HR creates a new job instead.

CREATE TABLE jobs (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  title                     TEXT NOT NULL CHECK (length(trim(title)) > 0),

  -- Skill bags are JSON arrays read whole, never queried into (doc 02).
  -- must-have needs at least one entry: a job with no required skills cannot be matched.
  must_have_skills          TEXT NOT NULL
                              CHECK (json_valid(must_have_skills)
                                     AND json_type(must_have_skills) = 'array'
                                     AND json_array_length(must_have_skills) > 0),
  -- good-to-have is bonus only, so an empty array is valid (doc 04).
  good_to_have_skills       TEXT NOT NULL DEFAULT '[]'
                              CHECK (json_valid(good_to_have_skills)
                                     AND json_type(good_to_have_skills) = 'array'),

  -- Decimals allowed (1.5 yrs), never negative, defaults to 0 (doc 04).
  required_experience_years REAL NOT NULL DEFAULT 0 CHECK (required_experience_years >= 0),

  -- The enum. strict = a missing must-have eliminates; soft = big penalty, still ranked.
  matching_mode             TEXT NOT NULL CHECK (matching_mode IN ('strict', 'soft')),

  -- The score gate, set per job, applied in BOTH modes.
  cutoff_percentage         REAL NOT NULL CHECK (cutoff_percentage BETWEEN 0 AND 100),

  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
