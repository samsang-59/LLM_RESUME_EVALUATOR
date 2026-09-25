// Client-side checks that MIRROR the backend guards (doc 04, backend/src/validators).
// They exist for UX - instant feedback - and nothing else: the backend still
// validates every request for real. Each function returns { field: message }.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

function checkEmail(email) {
  return EMAIL.test(email.trim()) ? null : 'a valid email is required';
}

export function validateLogin({ email, password }) {
  const errors = {};
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = 'password is required';
  return errors;
}

export function validateRegister({ username, email, password }) {
  const errors = {};
  if (!username.trim()) errors.username = 'name is required';
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (password.length < 8) errors.password = 'password must be at least 8 characters';
  else if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    errors.password = `password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return errors;
}

/**
 * The create-job form. Mirrors createJobSchema: title required, at least one
 * must-have, experience a number >= 0, mode strict|soft, cutoff 0-100.
 * The two number fields arrive as strings from their inputs.
 */
export function validateJob({ title, mustHaveSkills, requiredExperienceYears, matchingMode, cutoffPercentage }) {
  const errors = {};
  if (!title.trim()) errors.title = 'title is required';
  if (mustHaveSkills.length === 0) errors.mustHaveSkills = 'at least one must-have skill is required';

  if (String(requiredExperienceYears).trim() !== '') {
    const years = Number(requiredExperienceYears);
    if (!Number.isFinite(years)) errors.requiredExperienceYears = 'requiredExperienceYears must be a number';
    else if (years < 0) errors.requiredExperienceYears = 'requiredExperienceYears cannot be negative';
  }

  if (matchingMode !== 'strict' && matchingMode !== 'soft') {
    errors.matchingMode = "matchingMode must be either 'strict' or 'soft'";
  }

  const cutoff = String(cutoffPercentage).trim();
  if (cutoff === '') errors.cutoffPercentage = 'cutoffPercentage is required';
  else if (!Number.isFinite(Number(cutoff))) errors.cutoffPercentage = 'cutoffPercentage must be a number';
  else if (Number(cutoff) < 0 || Number(cutoff) > 100) {
    errors.cutoffPercentage = 'cutoffPercentage must be between 0 and 100';
  }
  return errors;
}

/**
 * The backend's 400 body ({ details: [{ field, message }] }) -> { field: message }.
 * A nested path like "mustHaveSkills.0" belongs to its top-level form field.
 */
export function detailsToErrors(details) {
  const errors = {};
  for (const { field = '', message } of details || []) {
    const key = field.split('.')[0];
    if (key && !errors[key]) errors[key] = message;
  }
  return errors;
}
