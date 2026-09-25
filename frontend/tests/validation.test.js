// Client-side validation must MIRROR the backend guards (doc 04) - same rules,
// same messages - so the user sees the backend's wording before a round trip.
import { describe, expect, test } from 'vitest';
import { detailsToErrors, validateJob, validateLogin, validateRegister } from '../src/utils/validation';

const validJob = () => ({
  title: 'Backend Developer',
  mustHaveSkills: ['node', 'sql'],
  goodToHaveSkills: [],
  requiredExperienceYears: '3',
  matchingMode: 'strict',
  cutoffPercentage: '70',
});

describe('Phase 6 - create-job validation mirrors createJobSchema', () => {
  test('a valid job has no errors', () => {
    expect(validateJob(validJob())).toEqual({});
  });

  test.each([
    ['empty title', { title: '' }, 'title', 'title is required'],
    ['whitespace title', { title: '   ' }, 'title', 'title is required'],
    ['no must-have skills', { mustHaveSkills: [] }, 'mustHaveSkills', 'at least one must-have skill is required'],
    ['negative experience', { requiredExperienceYears: '-1' }, 'requiredExperienceYears', 'requiredExperienceYears cannot be negative'],
    ['non-numeric experience', { requiredExperienceYears: 'abc' }, 'requiredExperienceYears', 'requiredExperienceYears must be a number'],
    ['bad matching mode', { matchingMode: 'loose' }, 'matchingMode', "matchingMode must be either 'strict' or 'soft'"],
    ['missing cutoff', { cutoffPercentage: '' }, 'cutoffPercentage', 'cutoffPercentage is required'],
    ['cutoff above 100', { cutoffPercentage: '101' }, 'cutoffPercentage', 'cutoffPercentage must be between 0 and 100'],
    ['cutoff below 0', { cutoffPercentage: '-5' }, 'cutoffPercentage', 'cutoffPercentage must be between 0 and 100'],
    ['non-numeric cutoff', { cutoffPercentage: 'high' }, 'cutoffPercentage', 'cutoffPercentage must be a number'],
  ])('%s -> error on %s', (_label, change, field, message) => {
    expect(validateJob({ ...validJob(), ...change })).toEqual({ [field]: message });
  });

  test('boundaries are allowed: cutoff 0 and 100, experience 0, decimals', () => {
    expect(validateJob({ ...validJob(), cutoffPercentage: '0' })).toEqual({});
    expect(validateJob({ ...validJob(), cutoffPercentage: '100' })).toEqual({});
    expect(validateJob({ ...validJob(), requiredExperienceYears: '0' })).toEqual({});
    expect(validateJob({ ...validJob(), requiredExperienceYears: '1.5' })).toEqual({});
  });

  test('experience is optional (the backend defaults it to 0)', () => {
    expect(validateJob({ ...validJob(), requiredExperienceYears: '' })).toEqual({});
  });

  test('good-to-have skills are optional', () => {
    expect(validateJob({ ...validJob(), goodToHaveSkills: [] })).toEqual({});
  });

  test('every broken field is reported at once, like the backend guard', () => {
    const errors = validateJob({ title: '', mustHaveSkills: [], goodToHaveSkills: [], requiredExperienceYears: '-1', matchingMode: 'x', cutoffPercentage: '500' });
    expect(Object.keys(errors).sort()).toEqual(['cutoffPercentage', 'matchingMode', 'mustHaveSkills', 'requiredExperienceYears', 'title']);
  });
});

describe('Phase 6 - auth form validation mirrors the auth guards', () => {
  test('register: valid input passes', () => {
    expect(validateRegister({ username: 'Priya', email: 'priya@northwind.hr', password: 'correct horse' })).toEqual({});
  });

  test('register: name required, email format, password >= 8', () => {
    expect(validateRegister({ username: ' ', email: 'nope', password: 'short' })).toEqual({
      username: 'name is required',
      email: 'a valid email is required',
      password: 'password must be at least 8 characters',
    });
  });

  test('register: exactly 8 characters is enough', () => {
    expect(validateRegister({ username: 'A', email: 'a@b.co', password: '12345678' }).password).toBeUndefined();
  });

  test('register: over 72 BYTES is refused (bcrypt would silently truncate it)', () => {
    expect(validateRegister({ username: 'A', email: 'a@b.co', password: 'a'.repeat(73) }).password).toMatch(/72 bytes/);
    // 24 three-byte characters = 72 bytes: allowed; one more is not.
    expect(validateRegister({ username: 'A', email: 'a@b.co', password: '€'.repeat(24) }).password).toBeUndefined();
    expect(validateRegister({ username: 'A', email: 'a@b.co', password: '€'.repeat(25) }).password).toMatch(/72 bytes/);
  });

  test('register: a padded email is accepted (the backend trims it)', () => {
    expect(validateRegister({ username: 'A', email: '  a@b.co ', password: '12345678' })).toEqual({});
  });

  test('login: email format and a non-empty password', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({});
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'a valid email is required',
      password: 'password is required',
    });
  });
});

describe('Phase 6 - backend 400 details map onto form fields', () => {
  test('flat and nested paths land on their top-level field; the first message wins', () => {
    expect(
      detailsToErrors([
        { field: 'title', message: 'title is required' },
        { field: 'mustHaveSkills.0', message: 'each skill must be a non-empty string' },
        { field: 'title', message: 'second message ignored' },
      ])
    ).toEqual({ title: 'title is required', mustHaveSkills: 'each skill must be a non-empty string' });
  });

  test('no details -> no errors', () => {
    expect(detailsToErrors(undefined)).toEqual({});
  });
});
