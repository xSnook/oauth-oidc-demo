import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  id?: string;
}

interface MetricCardProps {
  tone?: 'active' | 'session' | 'total';
  icon: ReactNode;
  label: string;
  value: ReactNode;
  caption: ReactNode;
}

interface PanelProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  id?: string;
}

interface LinkPanelProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  to: string;
  secondary?: boolean;
}

interface DetailItem {
  label: string;
  value: ReactNode;
}

interface SummaryCardProps {
  label: string;
  value: ReactNode;
}

export function PageHero({ action, children, className = '', eyebrow, title }: PageHeroProps) {
  return (
    <div className={`page-heading ${className}`.trim()}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children ? <p className="muted page-intro">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionHeading({ eyebrow, id, title }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

export function MetricCard({ caption, icon, label, tone = 'active', value }: MetricCardProps) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`} aria-hidden="true">
        {icon}
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}

export function Panel({ children, eyebrow, id, title }: PanelProps) {
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export function LinkPanel({ children, eyebrow, secondary = false, title, to }: LinkPanelProps) {
  return (
    <Link className={`link-card${secondary ? ' secondary-link' : ''}`} to={to}>
      <span>{eyebrow}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </Link>
  );
}

export function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <dl className="profile-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
