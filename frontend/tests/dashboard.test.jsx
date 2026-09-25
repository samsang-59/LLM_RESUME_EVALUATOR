// Dashboard - GET /api/jobs (designs 03, 10-loading, 12-error; empty state).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { JOB, mockBackend, pending, renderApp, respond, signIn } from './helpers';

const SOFT_JOB = {
  ...JOB,
  id: 2,
  title: 'Frontend Engineer — React',
  mustHaveSkills: ['React', 'TypeScript', 'CSS'],
  matchingMode: 'soft',
  cutoffPercentage: 60,
  requiredExperienceYears: 3,
  createdAt: '2026-08-04 10:00:00',
  candidateCount: 1,
};

describe('Phase 6 - Dashboard', () => {
  test('calls GET /api/jobs with the Bearer token on page load', async () => {
    const token = signIn();
    const { calls } = mockBackend({ 'GET /api/jobs': () => [] });
    renderApp('/dashboard');
    await screen.findByText('No jobs yet');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/jobs' });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${token}`);
  });

  test('loading: skeleton cards while the request is in flight', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': pending });
    renderApp('/dashboard');
    expect(await screen.findByRole('status', { name: 'Loading jobs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeInTheDocument(); // header stays
  });

  test('data: one card per job with title, date, count, mode, cutoff, years, skills', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': () => [{ ...JOB, candidateCount: 7 }, SOFT_JOB] });
    renderApp('/dashboard');

    const card = (await screen.findByRole('heading', { name: JOB.title })).closest('a');
    const c = within(card);
    expect(c.getByText('Created 12 Aug 2026')).toBeInTheDocument();
    expect(c.getByText('7')).toBeInTheDocument();
    expect(c.getByText('candidates')).toBeInTheDocument();
    expect(c.getByText('strict matching')).toBeInTheDocument();
    expect(c.getByText('cutoff 70%')).toBeInTheDocument();
    expect(c.getByText('5+ yrs')).toBeInTheDocument();
    for (const skill of JOB.mustHaveSkills) expect(c.getByText(skill)).toBeInTheDocument();

    const soft = within(screen.getByRole('heading', { name: SOFT_JOB.title }).closest('a'));
    expect(soft.getByText('soft matching')).toBeInTheDocument();
    expect(soft.getByText('candidate')).toBeInTheDocument(); // singular for 1
  });

  test('a card links to that job\'s candidates', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': () => [{ ...JOB, candidateCount: 0 }] });
    renderApp('/dashboard');
    expect((await screen.findByRole('heading', { name: JOB.title })).closest('a')).toHaveAttribute('href', '/jobs/1/candidates');
  });

  test('empty: "No jobs yet" with a way to create one', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': () => [] });
    renderApp('/dashboard');
    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();
    const createLinks = screen.getAllByRole('link', { name: 'Create job' });
    expect(createLinks.length).toBe(2); // header + empty state
    createLinks.forEach((link) => expect(link).toHaveAttribute('href', '/jobs/new'));
  });

  test('error: the design\'s message, and Retry calls the door again', async () => {
    signIn();
    let attempts = 0;
    const { calls } = mockBackend({
      'GET /api/jobs': () => (++attempts === 1 ? respond(500, { error: 'internal_error', message: 'Something went wrong' }) : [{ ...JOB, candidateCount: 2 }]),
    });
    renderApp('/dashboard');
    expect(await screen.findByText('Could not load your jobs')).toBeInTheDocument();
    expect(screen.getByText(/GET \/api\/jobs failed/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: JOB.title })).toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  test('the navbar: Jobs link active, user email, initials, theme toggle', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': () => [] });
    renderApp('/dashboard');
    await screen.findByText('No jobs yet');
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveClass('active');
    expect(screen.getByText('priya@northwind.hr')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('there is no STATE switcher in the real app (it was a design-mockup control)', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': () => [] });
    renderApp('/dashboard');
    await screen.findByText('No jobs yet');
    expect(screen.queryByText('STATE')).not.toBeInTheDocument();
  });
});
