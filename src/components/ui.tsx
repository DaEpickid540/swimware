/**
 * Small reusable, accessible UI primitives used across pages.
 */
import type { ReactNode } from "react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__dot" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
  accent,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`card${accent ? " card--accent" : ""}`}>
      {(title || actions) && (
        <header className="card__head">
          {title && <h3 className="card__title">{title}</h3>}
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="empty" role="note">
      {message}
    </p>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
    </div>
  );
}
