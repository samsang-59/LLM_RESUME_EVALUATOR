// End to end (phase plan: "view results end-to-end, backend mocked"). One stateful
// fake backend - it remembers the account, the job, and the evaluations the ATS
// sends - and one HR user walking the whole Navigation flow from doc 08:
//   Register -> Dashboard -> Create Job -> Dashboard -> Job Candidates -> Candidate Detail
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { ELIGIBLE, PROCESSING, REJECTED, fakeToken, mockBackend, renderApp, respond } from './helpers';

function statefulBackend() {
  const state = { users: [], jobs: [], evaluations: [], token: fakeToken() };
  const guard = (headers) => headers.Authorization === `Bearer ${state.token}`;
  const denied = respond(401, { error: 'unauthorized', message: 'Missing or invalid token' });

  const mock = mockBackend({
    'POST /api/auth/register': ({ body }) => {
      if (state.users.some((u) => u.email === body.email)) return respond(409, { error: 'conflict', message: 'That email is already registered' });
      const user = { id: state.users.length + 1, username: body.username, email: body.email };
      state.users.push({ ...user, password: body.password });
      return respond(201, { token: state.token, user });
    },
    'GET /api/jobs': ({ headers }) =>
      guard(headers)
        ? state.jobs.map((j) => ({ ...j, candidateCount: state.evaluations.filter((e) => e.jobId === j.id).length }))
        : denied,
    'POST /api/jobs': ({ headers, body }) => {
      if (!guard(headers)) return denied;
      const job = { ...body, id: state.jobs.length + 1, createdAt: '2026-09-25 10:00:00' };
      state.jobs.push(job);
      return respond(201, job);
    },
    'GET /api/jobs/1': ({ headers }) => (guard(headers) ? state.jobs[0] : denied),
    'GET /api/jobs/1/evaluations': ({ headers, query }) => {
      if (!guard(headers)) return denied;
      let rows = state.evaluations.filter((e) => e.jobId === 1);
      if (query.eligible === 'true') rows = rows.filter((e) => e.eligible === true);
      return rows;
    },
    'GET /api/evaluations/7': ({ headers }) => (guard(headers) ? state.evaluations.find((e) => e.id === 7) : denied),
  });

  // What the ATS does behind HR's back: submit resumes to the job (Model A).
  const atsSubmits = (...evaluations) => state.evaluations.push(...evaluations);
  return { ...mock, state, atsSubmits };
}

describe('Phase 6 - end to end: an HR user from sign-up to a candidate\'s result', () => {
  test('register -> create a job -> the ATS sends resumes -> review the list -> open one candidate', async () => {
    const backend = statefulBackend();
    renderApp('/register');

    // 1. Register (signs in straight away)
    await userEvent.type(await screen.findByLabelText('Name'), 'Priya Raman');
    await userEvent.type(screen.getByLabelText('Work email'), 'priya@northwind.hr');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    // 2. Empty dashboard
    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();

    // 3. Create a job
    await userEvent.click(screen.getAllByRole('link', { name: 'Create job' })[0]);
    await userEvent.type(await screen.findByLabelText('Job title'), 'Senior Backend Engineer (Node.js)');
    for (const skill of ['Node.js', 'Express', 'PostgreSQL', 'REST API design']) {
      await userEvent.type(screen.getByLabelText('Must-have skills'), `${skill}{Enter}`);
    }
    await userEvent.type(screen.getByLabelText('Required experience'), '5');
    await userEvent.type(screen.getByLabelText('Cutoff %'), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));

    // 4. Back on the dashboard, the job is there with 0 candidates
    const card = (await screen.findByRole('heading', { name: 'Senior Backend Engineer (Node.js)' })).closest('a');
    expect(within(card).getByText('0')).toBeInTheDocument();
    expect(backend.state.jobs[0]).toMatchObject({ matchingMode: 'strict', cutoffPercentage: 70, requiredExperienceYears: 5 });

    // 5. The ATS submits three resumes (one still processing)
    backend.atsSubmits(ELIGIBLE, REJECTED, PROCESSING);

    // 6. Open the job: every candidate, near-miss and in-progress included
    await userEvent.click(card);
    expect(await screen.findByText('Ananya Deshpande')).toBeInTheDocument();
    expect(screen.getByText('Karthik Menon')).toBeInTheDocument(); // near-miss kept
    expect(screen.getByText('Evaluating…')).toBeInTheDocument();

    // 7. Narrow to eligible only
    await userEvent.click(screen.getByRole('button', { name: 'Eligible only' }));
    await waitFor(() => expect(screen.queryByText('Karthik Menon')).not.toBeInTheDocument());
    expect(screen.getByText('Ananya Deshpande')).toBeInTheDocument();

    // 8. Open the candidate
    await userEvent.click(screen.getByText('Ananya Deshpande'));
    expect(await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '92% match' })).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();

    // Every HR request after sign-up carried the token the backend issued
    const guarded = backend.calls.filter((c) => !c.path.startsWith('/api/auth'));
    expect(guarded.length).toBeGreaterThan(0);
    guarded.forEach((c) => expect(c.headers.Authorization).toBe(`Bearer ${backend.state.token}`));

    // 9. Log out -> the next protected visit is refused
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
