const stackSections = [
  {
    title: 'Frontend',
    items: ['React', 'Vite', 'TypeScript', 'React Router', 'Vitest', 'Testing Library'],
  },
  {
    title: 'Backend',
    items: ['FastAPI', 'SQLAlchemy', 'Alembic', 'MySQL', 'Redis rate limiting'],
  },
  {
    title: 'Infrastructure',
    items: ['Docker Compose', 'GitHub Actions', 'Amazon ECR', 'EC2', 'RDS', 'Route 53', 'Caddy'],
  },
];

const authFlow = [
  'Google issues an OIDC ID token in the browser.',
  'FastAPI verifies the token against Google public keys.',
  'The backend creates or finds the local user record.',
  'A signed HTTP-only session cookie keeps the browser authenticated.',
  'Role checks gate owner, admin, and user-only behavior.',
];

const securityNotes = [
  'Google ID tokens are verified server-side before a local session is created.',
  'RDS is private and only reachable from the application host security group.',
  'Redis-backed limits throttle abusive auth and API request patterns.',
  'Owner accounts are protected from non-owner role and status changes.',
  'Production secrets live in AWS SSM Parameter Store instead of GitHub Actions.',
];

export function ArchitecturePage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Architecture</p>
          <h1>How the demo is put together</h1>
          <p className="muted page-intro">
            A compact map of the libraries, services, and security boundaries behind this
            OAuth/OIDC demo.
          </p>
        </div>
      </div>

      <section className="info-section" aria-labelledby="capabilities-heading">
        <h2 id="capabilities-heading">What It Demonstrates</h2>
        <div className="architecture-summary">
          <article>
            <span>Identity</span>
            <strong>Google OIDC sign-in</strong>
            <p>Browser identity tokens are verified by the backend before a session exists.</p>
          </article>
          <article>
            <span>Access</span>
            <strong>Owner, admin, and user roles</strong>
            <p>Server-side role checks protect user-management actions and owner accounts.</p>
          </article>
          <article>
            <span>Operations</span>
            <strong>Docker-first delivery</strong>
            <p>Local development and production deployment use containerized services.</p>
          </article>
        </div>
      </section>

      <section className="info-section" aria-labelledby="stack-heading">
        <h2 id="stack-heading">Tech Stack</h2>
        <div className="stack-grid">
          {stackSections.map((section) => (
            <article className="stack-card" key={section.title}>
              <h3>{section.title}</h3>
              <ul className="tag-list" aria-label={`${section.title} technologies`}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="info-section flow-grid" aria-labelledby="flow-heading">
        <div>
          <h2 id="flow-heading">Auth Flow</h2>
          <ol className="flow-list">
            {authFlow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Security Boundaries</h2>
          <ul className="check-list">
            {securityNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>
    </section>
  );
}
