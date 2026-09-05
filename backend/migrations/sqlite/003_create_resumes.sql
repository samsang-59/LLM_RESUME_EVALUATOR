-- Resumes = candidate facts, read once by the LLM (design doc 02).
-- Written by the pipeline AFTER extraction succeeds.

CREATE TABLE resumes (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Extracted by the LLM, so any of these may genuinely be absent from a resume.
  name                   TEXT,
  phone                  TEXT,
  email                  TEXT,

  -- The original PDF/DOCX lives on disk; the DB keeps only the path (doc 02).
  -- The filename is one WE generate - the uploaded name is never trusted (doc 04).
  file_path              TEXT NOT NULL,
  -- The plain text the LLM actually read.
  extracted_text         TEXT NOT NULL,

  -- listed = mentioned in a skills section. used = actually used in a project.
  -- used_skills is the stronger proof (doc 02). Both are JSON arrays.
  listed_skills          TEXT NOT NULL DEFAULT '[]'
                           CHECK (json_valid(listed_skills) AND json_type(listed_skills) = 'array'),
  used_skills            TEXT NOT NULL DEFAULT '[]'
                           CHECK (json_valid(used_skills) AND json_type(used_skills) = 'array'),

  -- Calculated by the LLM from the job dates on the resume.
  total_experience_years REAL NOT NULL DEFAULT 0 CHECK (total_experience_years >= 0),

  uploaded_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
