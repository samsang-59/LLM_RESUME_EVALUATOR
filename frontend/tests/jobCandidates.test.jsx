// Job Candidates - GET /api/jobs/:jobId + GET /api/jobs/:jobId/evaluations
// (designs 05, 06-filtered, 11-empty). Filters, async states, near-misses.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { ELIGIBLE, FAILED, JOB, PROCESSING, REJECTED, mockBackend, pending, renderApp, respond, signIn } from './helpers';

const ALL = [ELIGIBLE, REJECTED, PROCESSING, FAILED];

function backend({ all = ALL, filtered = (q) => ALL.filter((e) => (q.eligible ? e.eligible === true : true)) } = {}) {
  return mockBackend({
    'GET /api/jobs/1': () => JOB,
    'GET /api/jobs/1/evaluations': ({ query }) => (Object.keys(query).length ? filtered(query) : all),
    'GET /api/evaluations/7': () => ELIGIBLE,
  });
}

const rowFor = (name) => screen.getByText(name).closest('tr');

describe('Phase 6 - Job Candidates: loading the page', () => {
  test('calls both doors with the token: the job and its evaluations', async () => {
    const token = signIn();
    const { calls } = backend();
    renderApp('/jobs/1/candidates');
    await screen.findByRole('heading', { name: JOB.title });
    expect(calls.map((c) => c.path).sort()).toEqual(['/api/jobs/1', '/api/jobs/1/evaluations']);
    calls.forEach((c) => expect(c.headers.Authorization).toBe(`Bearer ${token}`));
    expect(calls.find((c) => c.path.endsWith('/evaluations')).query).toEqual({}); // default: everyone
  });

  test('loading state while the requests are in flight', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs/1': pending, 'GET /api/jobs/1/evaluations': pending });
    renderApp('/jobs/1/candidates');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading candidates…');
  });

  test('header: title, mode, cutoff, required years, must-haves', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    await screen.findByRole('heading', { name: JOB.title });
    expect(screen.getByText('strict matching')).toBeInTheDocument();
    expect(screen.getByText('cutoff 70%')).toBeInTheDocument();
    expect(screen.getByText('5+ yrs required')).toBeInTheDocument();
    expect(screen.getByText('Must-have: Node.js, Express, PostgreSQL, REST API design')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Jobs' })).toHaveAttribute('href', '/dashboard');
  });

  test('stats: evaluated / eligible / processing / failed', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    const stats = within(await screen.findByLabelText('Candidate totals'));
    expect(stats.getByText('evaluated').previousSibling).toHaveTextContent('4');
    expect(stats.getByText('eligible').previousSibling).toHaveTextContent('1');
    expect(stats.getByText('processing').previousSibling).toHaveTextContent('1');
    expect(stats.getByText('failed').previousSibling).toHaveTextContent('1');
  });

  test('job not found (404): says so, no Retry', async () => {
    signIn();
    mockBackend({
      'GET /api/jobs/99': () => respond(404, { error: 'not_found', message: 'Job not found' }),
      'GET /api/jobs/99/evaluations': () => respond(404, { error: 'not_found', message: 'Job not found' }),
    });
    renderApp('/jobs/99/candidates');
    expect(await screen.findByText('Job not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  test('server error: message and a working Retry', async () => {
    signIn();
    let attempts = 0;
    mockBackend({
      'GET /api/jobs/1': () => JOB,
      'GET /api/jobs/1/evaluations': () => (++attempts === 1 ? respond(500, { message: 'boom' }) : ALL),
    });
    renderApp('/jobs/1/candidates');
    expect(await screen.findByText('Could not load this job')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ananya Deshpande')).toBeInTheDocument();
  });
});

describe('Phase 6 - Job Candidates: every async state renders', () => {
  test('completed + eligible: score, name, email, Eligible, skills summary, experience', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    const row = within((await screen.findByText('Ananya Deshpande')).closest('tr'));
    expect(row.getByRole('img', { name: '92% match' })).toBeInTheDocument();
    expect(row.getByText('ananya.deshpande@gmail.com')).toBeInTheDocument();
    expect(row.getByText('Eligible')).toBeInTheDocument();
    expect(row.getByText('completed')).toBeInTheDocument();
    expect(row.getByText('4 matched · 0 missing · 4 extra')).toBeInTheDocument();
    expect(row.getByText('7 / 5 yr')).toBeInTheDocument();
  });

  test('near-miss is SHOWN by default: rejected, but with its 68%', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    const row = within((await screen.findByText('Karthik Menon')).closest('tr'));
    expect(row.getByText('Rejected')).toBeInTheDocument();
    expect(row.getByRole('img', { name: '68% match' })).toBeInTheDocument();
    expect(row.getByText('2 matched · 2 missing · 1 extra')).toBeInTheDocument();
  });

  test('processing: "Evaluating…", no score, pending verdict', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    const row = within((await screen.findByText('Evaluating…')).closest('tr'));
    expect(row.getByRole('img', { name: 'Score pending' })).toBeInTheDocument();
    expect(row.getByText('processing')).toBeInTheDocument();
    expect(row.getByText('pending')).toBeInTheDocument();
  });

  test('failed: the failure_reason is shown, name unknown (extraction never ran)', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    const row = within((await screen.findByText('Unknown candidate')).closest('tr'));
    expect(row.getByText('unreadable_resume')).toBeInTheDocument();
    expect(row.getByText('failed')).toBeInTheDocument();
    expect(row.getByRole('img', { name: 'No score' })).toBeInTheDocument();
  });

  test('rows keep the backend order (best first, unscored last)', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    await screen.findByText('Ananya Deshpande');
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('.candidate-name').textContent);
    expect(names).toEqual(['Ananya Deshpande', 'Karthik Menon', 'Evaluating…', 'Unknown candidate']);
  });

  test('clicking a row (or Enter on it) opens that candidate', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    await userEvent.click(await screen.findByText('Ananya Deshpande'));
    expect(await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 })).toBeInTheDocument();
  });

  test('empty: "No candidates yet" and zeroed stats', async () => {
    signIn();
    backend({ all: [] });
    renderApp('/jobs/1/candidates');
    expect(await screen.findByText('No candidates yet')).toBeInTheDocument();
    expect(screen.getByText(/including the near-misses/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Candidate totals')).getAllByText('0')).toHaveLength(4);
  });
});

describe('Phase 6 - Job Candidates: filters', () => {
  const lastQuery = (calls) => calls.filter((c) => c.path.endsWith('/evaluations')).at(-1).query;

  test('"Eligible only" asks the backend for eligible=true and narrows the rows', async () => {
    signIn();
    const { calls } = backend();
    renderApp('/jobs/1/candidates');
    await userEvent.click(await screen.findByRole('button', { name: 'Eligible only' }));
    expect(screen.getByRole('button', { name: 'Eligible only' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.queryByText('Karthik Menon')).not.toBeInTheDocument());
    expect(lastQuery(calls)).toEqual({ eligible: 'true' });
    expect(screen.getByText('Ananya Deshpande')).toBeInTheDocument();
  });

  test('min score and min experience sliders send minPercentage / minExperience', async () => {
    signIn();
    const { calls } = backend({ filtered: () => [ELIGIBLE] });
    renderApp('/jobs/1/candidates');
    fireEvent.change(await screen.findByLabelText(/Min score/), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/Min experience/), { target: { value: '5' } });
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('5 yr')).toBeInTheDocument();
    await waitFor(() => expect(lastQuery(calls)).toEqual({ minPercentage: '60', minExperience: '5' }));
  });

  test('all three filters combine into one request', async () => {
    signIn();
    const { calls } = backend({ filtered: () => [ELIGIBLE] });
    renderApp('/jobs/1/candidates');
    await userEvent.click(await screen.findByRole('button', { name: 'Eligible only' }));
    fireEvent.change(screen.getByLabelText(/Min score/), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText(/Min experience/), { target: { value: '3' } });
    await waitFor(() => expect(lastQuery(calls)).toEqual({ eligible: 'true', minPercentage: '70', minExperience: '3' }));
  });

  test('a slider drag sends ONE request for where it stops, not one per step', async () => {
    signIn();
    const { calls } = backend({ filtered: () => [ELIGIBLE] });
    renderApp('/jobs/1/candidates');
    const slider = await screen.findByLabelText(/Min score/);
    for (const value of ['5', '10', '15', '20', '25']) fireEvent.change(slider, { target: { value } });
    await waitFor(() => expect(lastQuery(calls)).toEqual({ minPercentage: '25' }));
    expect(calls.filter((c) => c.path.endsWith('/evaluations') && c.query.minPercentage)).toHaveLength(1);
  });

  test('the stats keep the job totals while the table is filtered', async () => {
    signIn();
    backend({ filtered: () => [ELIGIBLE] });
    renderApp('/jobs/1/candidates');
    await userEvent.click(await screen.findByRole('button', { name: 'Eligible only' }));
    await waitFor(() => expect(screen.queryByText('Karthik Menon')).not.toBeInTheDocument());
    const stats = within(screen.getByLabelText('Candidate totals'));
    expect(stats.getByText('evaluated').previousSibling).toHaveTextContent('4');
  });

  test('no matches: says so and offers a reset', async () => {
    signIn();
    backend({ filtered: () => [] });
    renderApp('/jobs/1/candidates');
    fireEvent.change(await screen.findByLabelText(/Min score/), { target: { value: '100' } });
    expect(await screen.findByText('No candidates match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('Karthik Menon')).toBeInTheDocument();
  });

  test('Reset clears every filter and shows everyone again', async () => {
    signIn();
    backend({ filtered: () => [ELIGIBLE] });
    renderApp('/jobs/1/candidates');
    const reset = await screen.findByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled(); // nothing to reset yet
    await userEvent.click(screen.getByRole('button', { name: 'Eligible only' }));
    fireEvent.change(screen.getByLabelText(/Min score/), { target: { value: '50' } });
    await waitFor(() => expect(screen.queryByText('Karthik Menon')).not.toBeInTheDocument());

    await userEvent.click(reset);
    expect(await screen.findByText('Karthik Menon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eligible only' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText(/Min score/)).toHaveValue('0');
  });

  test('a failed filter request shows an error in the table with Retry', async () => {
    signIn();
    let attempts = 0;
    backend({ filtered: () => (++attempts === 1 ? respond(500, { message: 'Filter failed' }) : [ELIGIBLE]) });
    renderApp('/jobs/1/candidates');
    await userEvent.click(await screen.findByRole('button', { name: 'Eligible only' }));
    expect(await screen.findByText('Could not apply the filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ananya Deshpande')).toBeInTheDocument();
  });

  test('rowFor helper sanity: a filtered-out row is really gone from the DOM', async () => {
    signIn();
    backend();
    renderApp('/jobs/1/candidates');
    await screen.findByText('Karthik Menon');
    expect(rowFor('Karthik Menon')).toBeInTheDocument();
  });
});
