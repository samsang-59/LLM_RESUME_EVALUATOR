/** The split screen shared by Login and Register (designs 01 and 02). */
export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <section className="auth-intro">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Resume Evaluator
        </div>
        <h1 className="auth-headline">Your ATS sends the resumes. You review the shortlist.</h1>
        <p className="auth-lede">
          Resumes arrive through the integration and are scored against the requirements you set per job.
          Results, including near-misses, land here.
        </p>
        <div className="auth-features">
          <span>Skill gate + score gate</span>
          <span>Evidence-backed matches</span>
          <span>Webhook delivery</span>
        </div>
      </section>
      <main className="auth-panel">{children}</main>
    </div>
  );
}
