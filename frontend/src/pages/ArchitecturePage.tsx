import { PageHero, SectionHeading } from '../components/ui';

const stackSections = [
  {
    title: 'Frontend',
    summary: 'Browser application',
    items: ['React', 'Vite', 'TypeScript', 'React Router', 'Vitest', 'Testing Library'],
  },
  {
    title: 'Backend',
    summary: 'API and persistence',
    items: ['FastAPI', 'SQLAlchemy', 'Alembic', 'MySQL', 'Redis rate limiting'],
  },
  {
    title: 'Infrastructure',
    summary: 'Delivery and hosting',
    items: ['Docker Compose', 'GitHub Actions', 'Amazon ECR', 'EC2', 'RDS', 'Route 53', 'Caddy'],
  },
];

const authFlow = [
  'FastAPI issues a short-lived Redis nonce before Google sign-in is initialized.',
  'Google issues an OIDC ID token bound to that nonce in the browser.',
  'FastAPI verifies the token against Google public keys and consumes the nonce once.',
  'The backend creates or finds the local user record.',
  'A signed HTTP-only session cookie keeps the browser authenticated.',
  'Role checks gate owner, admin, and user-only behavior.',
];

const securityNotes = [
  'Google ID tokens are verified server-side and bound to single-use Redis nonces before a local session is created.',
  'RDS is private and only reachable from the application host security group.',
  'Redis-backed limits throttle abusive auth and API request patterns.',
  'Owner accounts and admin account mutations are protected from non-owner role and status changes.',
  'Admins cannot promote users to admin or change another admin account.',
  'Production secrets live in AWS SSM Parameter Store instead of GitHub Actions.',
];

export function ArchitecturePage() {
  return (
    <section className="page-stack">
      <PageHero
        action={
          <div className="architecture-orbit" aria-hidden="true">
            <svg viewBox="0 0 220 140">
              <rect x="12" y="38" width="54" height="34" rx="6" />
              <rect x="84" y="16" width="52" height="34" rx="6" />
              <rect x="154" y="38" width="54" height="34" rx="6" />
              <rect x="84" y="90" width="52" height="34" rx="6" />
              <path d="M66 55h18M136 33l18 22M154 55h-18M110 50v40" />
              <circle cx="39" cy="55" r="4" />
              <circle cx="110" cy="33" r="4" />
              <circle cx="181" cy="55" r="4" />
              <circle cx="110" cy="107" r="4" />
            </svg>
          </div>
        }
        className="architecture-hero"
        eyebrow="Architecture"
        title="How the demo is put together"
      >
        A compact map of the libraries, services, and security boundaries behind this OAuth/OIDC
        demo.
      </PageHero>

      <section className="info-section" aria-labelledby="capabilities-heading">
        <SectionHeading eyebrow="Capabilities" id="capabilities-heading" title="What It Demonstrates" />
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
        <SectionHeading eyebrow="Runtime" id="stack-heading" title="Tech Stack" />
        <div className="stack-grid">
          {stackSections.map((section) => (
            <article className="stack-card" key={section.title}>
              <span>{section.title}</span>
              <strong>{section.summary}</strong>
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
          <SectionHeading eyebrow="Sequence" id="flow-heading" title="Auth Flow" />
          <ol className="flow-list">
            {authFlow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <SectionHeading eyebrow="Guardrails" title="Security Boundaries" />
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
