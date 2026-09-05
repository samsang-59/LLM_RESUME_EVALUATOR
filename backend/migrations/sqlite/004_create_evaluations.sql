-- Evaluations = the result of matching ONE resume against ONE job (design doc 02).
--
-- The important shape decision: this row is born EMPTY. The pipeline is async
-- (doc 05) - the row is created with status='processing' so the controller can
-- reply 202 with an id immediately, and every result column is filled in later by
-- updateEvaluation(). That is why the result columns below are nullable.
--
-- resume_id is nullable for the same reason: the evaluation row is created at the
-- START of the pipeline, but the resume row only exists AFTER extraction (doc 07).

CREATE TABLE evaluations (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,

  -- The job is known at submission time, so this is required from the start.
  job_id                    INTEGER NOT NULL
                              REFERENCES jobs (id) ON DELETE RESTRICT,
  -- Filled in once extraction has produced a resume row.
  resume_id                 INTEGER
                              REFERENCES resumes (id) ON DELETE RESTRICT,

  -- The async lifecycle enum.
  status                    TEXT NOT NULL DEFAULT 'processing'
                              CHECK (status IN ('processing', 'completed', 'failed')),
  -- Where we POST the result. Stored per submission (doc 05).
  callback_url              TEXT NOT NULL,
  -- Set ONLY when status='failed' - unreadable_resume / network / llm_overloaded /
  -- malformed_output (doc 06). The CHECK enforces that pairing both ways.
  failure_reason            TEXT
                              CHECK ((status = 'failed' AND failure_reason IS NOT NULL)
                                     OR (status <> 'failed' AND failure_reason IS NULL)),
  -- The webhook delivery enum, tracked separately from the evaluation itself.
  delivery_status           TEXT NOT NULL DEFAULT 'pending'
                              CHECK (delivery_status IN ('pending', 'delivered', 'failed')),

  -- ---- result columns: NULL until the pipeline completes ----

  -- Passes BOTH gates: the skill gate (strict mode) and the score gate (always).
  -- SQLite has no boolean type; 0/1, mirroring Postgres BOOLEAN.
  eligible                  INTEGER CHECK (eligible IN (0, 1)),

  matched_required_skills   TEXT CHECK (matched_required_skills IS NULL
                                        OR json_type(matched_required_skills) = 'array'),
  extra_skills              TEXT CHECK (extra_skills IS NULL
                                        OR json_type(extra_skills) = 'array'),
  missing_skills            TEXT CHECK (missing_skills IS NULL
                                        OR json_type(missing_skills) = 'array'),

  -- Snapshots, not live lookups: if HR later changes the job, past results must
  -- not silently change. A result is a record of that moment (doc 02).
  required_experience_years  REAL CHECK (required_experience_years IS NULL
                                         OR required_experience_years >= 0),
  candidate_experience_years REAL CHECK (candidate_experience_years IS NULL
                                         OR candidate_experience_years >= 0),

  -- Always computed and stored, even when a gate eliminates the candidate, so HR
  -- can spot a near-miss ("rejected, but 71%") - doc 06.
  overall_percentage        REAL CHECK (overall_percentage IS NULL
                                        OR overall_percentage BETWEEN 0 AND 100),

  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The main HR review screen: every candidate for one job (doc 07).
CREATE INDEX idx_evaluations_job_id ON evaluations (job_id);
-- Supports the JOIN back to the candidate on the read doors.
CREATE INDEX idx_evaluations_resume_id ON evaluations (resume_id);
