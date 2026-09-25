// Candidate Detail - GET /api/evaluations/:id (+ its job) - designs 07, 08, 09.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { ELIGIBLE, FAILED, JOB, PROCESSING, REJECTED, mockBackend, pending, renderApp, respond, signIn } from './helpers';

function backend(evaluation, { job = () => JOB } = {}) {
  return mockBackend({
    [`GET /api/evaluations/${evaluation.id}`]: () => evaluation,
    'GET /api/jobs/1': job,
    'GET /api/jobs/1/evaluations': () => [],
  });
}

const section = (label) => screen.getByRole('heading', { name: label }).closest('section');

describe('Phase 6 - Candidate Detail', () => {
  test('calls GET /api/evaluations/:id then GET /api/jobs/:jobId, with the token', async () => {
    const token = signIn();
    const { calls } = backend(ELIGIBLE);
    renderApp('/evaluations/7');
    await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 });
    expect(calls.map((c) => c.path)).toEqual(['/api/evaluations/7', '/api/jobs/1']);
    calls.forEach((c) => expect(c.headers.Authorization).toBe(`Bearer ${token}`));
  });

  test('loading state', async () => {
    signIn();
    mockBackend({ 'GET /api/evaluations/7': pending });
    renderApp('/evaluations/7');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading candidate…');
  });

  test('eligible: everything the evaluation provides', async () => {
    signIn();
    backend(ELIGIBLE);
    renderApp('/evaluations/7');
    await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 });

    // who
    expect(screen.getByText('ananya.deshpande@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('+91 98204 41127')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();

    // score + why
    expect(screen.getByRole('img', { name: '92% match' })).toBeInTheDocument();
    expect(screen.getByText('Passed both gates: no must-have missing, and 92% is at or above the 70% cutoff.')).toBeInTheDocument();

    // skills
    for (const skill of ELIGIBLE.matchedRequiredSkills) expect(screen.getByText(skill)).toHaveClass('skill-matched');
    for (const skill of ELIGIBLE.extraSkills) expect(screen.getByText(skill)).toHaveClass('skill-extra');
    expect(screen.queryByRole('heading', { name: 'Missing must-have skills' })).not.toBeInTheDocument();

    // experience: required vs actual
    const exp = within(section('Experience'));
    expect(exp.getByText('7 yr').nextSibling).toHaveTextContent('candidate');
    expect(exp.getByText('5 yr').nextSibling).toHaveTextContent('required');

    // record
    const record = within(section('Evaluation record'));
    expect(record.getByText('#7')).toBeInTheDocument();
    expect(record.getByText('strict')).toBeInTheDocument();
    expect(record.getByText('70%')).toBeInTheDocument();
    expect(record.getByText('delivered')).toBeInTheDocument();
  });

  test('no evidence quotes are shown (decision: skill chips only)', async () => {
    signIn();
    backend(ELIGIBLE);
    renderApp('/evaluations/7');
    await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 });
    expect(screen.queryByText(/evidence:/i)).not.toBeInTheDocument();
  });

  test('rejected: missing skills listed in red and the skill gate named', async () => {
    signIn();
    backend(REJECTED);
    renderApp('/evaluations/8');
    await screen.findByRole('heading', { name: 'Karthik Menon', level: 1 });
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '68% match' })).toBeInTheDocument();
    const missing = within(section('Missing must-have skills'));
    expect(missing.getByText('Express')).toHaveClass('skill-missing');
    expect(missing.getByText('REST API design')).toHaveClass('skill-missing');
    expect(screen.getByText('Failed the skill gate — Express, REST API design missing under strict matching.')).toBeInTheDocument();
  });

  test('failed: the failure_reason, a plain explanation, no score, no skills section', async () => {
    signIn();
    backend(FAILED);
    renderApp('/evaluations/10');
    expect(await screen.findByText('Evaluation failed')).toBeInTheDocument();
    expect(screen.getByText('unreadable_resume')).toBeInTheDocument();
    expect(screen.getByText(/Ask the source system to resubmit a readable file/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unknown candidate', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No score' })).toBeInTheDocument();
    expect(screen.getByText('No score — the pipeline could not read this resume.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Matched must-have skills' })).not.toBeInTheDocument();
  });

  test('failed AFTER extraction keeps the candidate details it has', async () => {
    signIn();
    backend({ ...FAILED, id: 11, failureReason: 'llm_overloaded', candidate: REJECTED.candidate });
    renderApp('/evaluations/11');
    expect(await screen.findByRole('heading', { name: 'Karthik Menon', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('llm_overloaded')).toBeInTheDocument();
  });

  test('processing: still evaluating, pending score', async () => {
    signIn();
    backend(PROCESSING);
    renderApp('/evaluations/9');
    expect(await screen.findByRole('heading', { name: 'Evaluating…', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Score pending' })).toBeInTheDocument();
    expect(screen.getByText(/Still evaluating/)).toBeInTheDocument();
  });

  test('back link goes to that job\'s candidates, labelled with the job title', async () => {
    signIn();
    backend(ELIGIBLE);
    renderApp('/evaluations/7');
    const back = await screen.findByRole('link', { name: `← ${JOB.title}` });
    expect(back).toHaveAttribute('href', '/jobs/1/candidates');
    await userEvent.click(back);
    expect(await screen.findByText('No candidates yet')).toBeInTheDocument();
  });

  test('if the job read fails, the result still shows (degrades, no error screen)', async () => {
    signIn();
    backend(ELIGIBLE, { job: () => respond(500, { message: 'boom' }) });
    renderApp('/evaluations/7');
    expect(await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Candidates' })).toHaveAttribute('href', '/jobs/1/candidates');
    expect(screen.getByText('Passed every gate.')).toBeInTheDocument();
  });

  test('evaluation not found (404): says so, no Retry', async () => {
    signIn();
    mockBackend({ 'GET /api/evaluations/404': () => respond(404, { error: 'not_found', message: 'Evaluation not found' }) });
    renderApp('/evaluations/404');
    expect(await screen.findByText('Evaluation not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  test('server error: message and Retry', async () => {
    signIn();
    let attempts = 0;
    mockBackend({
      'GET /api/evaluations/7': () => (++attempts === 1 ? respond(500, { message: 'boom' }) : ELIGIBLE),
      'GET /api/jobs/1': () => JOB,
    });
    renderApp('/evaluations/7');
    expect(await screen.findByText('Could not load this candidate')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Ananya Deshpande', level: 1 })).toBeInTheDocument();
  });
});
