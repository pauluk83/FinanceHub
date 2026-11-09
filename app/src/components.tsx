import type { ReactNode, Ref } from 'react';
import { gbp, pct } from './format';

export function Card(props: {
  title?: string;
  value?: string;
  sub?: string;
  tone?: 'pos' | 'neg' | 'warn' | 'neutral';
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { title, value, sub, tone = 'neutral', actions, children, className = '' } = props;
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions}
        </header>
      )}
      {value !== undefined && <div className={`kpi-value ${tone}`}>{value}</div>}
      {children}
    </section>
  );
}

export function Section(props: { title: string; sub?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${props.className ?? ''}`}>
      <header className="panel-head">
        <div>
          <h2>{props.title}</h2>
          {props.sub && <p>{props.sub}</p>}
        </div>
        {props.actions}
      </header>
      {props.children}
    </section>
  );
}

export function Table(props: { head: ReactNode[]; children: ReactNode; className?: string; wrapRef?: Ref<HTMLDivElement>; numHead?: number[] }) {
  const numHead = props.numHead ?? [];
  return (
    <div className={`table-wrap ${props.className ?? ''}`} ref={props.wrapRef}>
      <table>
        <thead>
          <tr>
            {props.head.map((h, i) => (
              <th key={i} className={numHead.includes(i) ? 'num' : undefined}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className={`bar-fill ${tone}`} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode; key?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Money({ pence, sign = false }: { pence: number | null | undefined; sign?: boolean }) {
  const cls = pence === null || pence === undefined ? '' : pence < 0 ? 'neg' : sign ? 'pos' : '';
  return <span className={`amount ${cls}`}>{gbp(pence, { sign })}</span>;
}

export function Ratio({ value, tone }: { value: number; tone?: string }) {
  return <span className="ratio">{pct(value)}{tone ? '' : ''}</span>;
}
