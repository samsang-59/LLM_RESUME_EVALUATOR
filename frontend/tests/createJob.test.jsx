// Create Job - POST /api/jobs. The form mirrors the backend guard (doc 08 / doc 04).
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { JOB, mockBackend, renderApp, respond, signIn } from './helpers';

const routes = (extra = {}) => ({
  'POST /api/jobs': ({ body }) => respond(201, { ...JOB, ...body, id: 5 }),
  'GET /api/jobs': () => [],
  ...extra,
});

async function addSkill(label, skill) {
  await userEvent.type(screen.getByLabelText(label), `${skill}{Enter}`);
}

async function fillValidJob() {
  await userEvent.type(await screen.findByLabelText('Job title'), 'Platform Engineer');
  await addSkill('Must-have skills', 'Kubernetes');
  await addSkill('Must-have skills', 'Go');
  await addSkill('Good-to-have skills', 'Prometheus');
  await userEvent.type(screen.getByLabelText('Required experience'), '2.5');
  await userEvent.type(screen.getByLabelText('Cutoff %'), '65');
}

describe('Phase 6 - Create Job screen', () => {
  test('renders every field from the Job schema', async () => {
    signIn();
    mockBackend(routes());
    renderApp('/jobs/new');
    expect(await screen.findByRole('heading', { name: 'Create job' })).toBeInTheDocument();
    for (const label of ['Job title', 'Must-have skills', 'Good-to-have skills', 'Required experience', 'Cutoff %']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: /Strict/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Soft/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('link', { name: '← Jobs' })).toHaveAttribute('href', '/dashboard');
  });

  test('valid submit: POST /api/jobs with numbers as numbers, then back to the dashboard', async () => {
    signIn();
    const { calls } = mockBackend(routes());
    renderApp('/jobs/new');
    await fillValidJob();
    await userEvent.click(screen.getByRole('radio', { name: /Soft/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(post.path).toBe('/api/jobs');
    expect(post.body).toEqual({
      title: 'Platform Engineer',
      mustHaveSkills: ['Kubernetes', 'Go'],
      goodToHaveSkills: ['Prometheus'],
      requiredExperienceYears: 2.5,
      matchingMode: 'soft',
      cutoffPercentage: 65,
    });
  });

  test('empty experience is sent as 0 (the backend default)', async () => {
    signIn();
    const { calls } = mockBackend(routes());
    renderApp('/jobs/new');
    await userEvent.type(await screen.findByLabelText('Job title'), 'QA');
    await addSkill('Must-have skills', 'Selenium');
    await userEvent.type(screen.getByLabelText('Cutoff %'), '55');
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
    await screen.findByRole('heading', { name: 'Jobs' });
    expect(calls.find((c) => c.method === 'POST').body.requiredExperienceYears).toBe(0);
  });

  test('empty form: every rule reports at once, and nothing is sent', async () => {
    signIn();
    const { calls } = mockBackend(routes());
    renderApp('/jobs/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Create job' }));
    expect(screen.getByText('title is required')).toBeInTheDocument();
    expect(screen.getByText('at least one must-have skill is required')).toBeInTheDocument();
    expect(screen.getByText('cutoffPercentage is required')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  test.each([
    ['101', 'cutoffPercentage must be between 0 and 100'],
    ['-1', 'cutoffPercentage must be between 0 and 100'],
  ])('cutoff %s is refused on the client', async (cutoff, message) => {
    signIn();
    const { calls } = mockBackend(routes());
    renderApp('/jobs/new');
    await userEvent.type(await screen.findByLabelText('Job title'), 'X');
    await addSkill('Must-have skills', 'Go');
    await userEvent.type(screen.getByLabelText('Cutoff %'), cutoff);
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  test('negative experience is refused on the client', async () => {
    signIn();
    mockBackend(routes());
    renderApp('/jobs/new');
    await userEvent.type(await screen.findByLabelText('Required experience'), '-2');
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
    expect(screen.getByText('requiredExperienceYears cannot be negative')).toBeInTheDocument();
  });

  test('the backend still validates: a 400 it returns is shown under the fields', async () => {
    signIn();
    mockBackend(
      routes({
        'POST /api/jobs': () =>
          respond(400, {
            error: 'bad_request',
            message: 'Validation failed',
            details: [{ field: 'title', message: 'title is too long' }, { field: 'mustHaveSkills.1', message: 'each skill must be a non-empty string' }],
          }),
      })
    );
    renderApp('/jobs/new');
    await fillValidJob();
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
    expect(await screen.findByText('title is too long')).toBeInTheDocument();
    expect(screen.getByText('each skill must be a non-empty string')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create job' })).toBeInTheDocument(); // stayed on the form
  });

  test('a server error shows a message and keeps the form filled in', async () => {
    signIn();
    mockBackend(routes({ 'POST /api/jobs': () => respond(500, { error: 'internal_error', message: 'Something went wrong' }) }));
    renderApp('/jobs/new');
    await fillValidJob();
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toHaveValue('Platform Engineer');
    expect(screen.getByRole('button', { name: 'Create job' })).toBeEnabled();
  });

  test('skills: Enter adds (without submitting), Add button adds, duplicates ignored, × removes', async () => {
    signIn();
    const { calls } = mockBackend(routes());
    renderApp('/jobs/new');
    await addSkill('Must-have skills', await Promise.resolve('Go'));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0); // Enter did not submit

    await userEvent.type(screen.getByLabelText('Must-have skills'), 'Terraform');
    await userEvent.click(screen.getByRole('button', { name: 'Add must-have skills' }));
    await addSkill('Must-have skills', 'go'); // same skill, different case
    await addSkill('Must-have skills', '   '); // blank

    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.getByText('Terraform')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Go' }));
    expect(screen.queryByText('Go')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Must-have skills')).toHaveValue('');
  });

  test('Cancel returns to the dashboard without sending anything', async () => {
    signIn();
    const { calls } = mockBackend(routes());
    renderApp('/jobs/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});
