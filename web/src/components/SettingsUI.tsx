import { type ReactNode } from 'react';

/**
 * Building blocks of the workspace Settings screen: titled groups of
 * label–control rows (the macOS-System-Settings / Stripe pattern). Agent
 * settings panels (AgentTypeUI.settingsPanel) use the same primitives so the
 * whole screen reads as one system.
 */

/** A titled card of setting rows. `aside` renders at the end of the label line (e.g. a save indicator). */
export function SettingsGroup({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-group">
      <div className="settings-group-head">
        <h3>{title}</h3>
        {aside}
      </div>
      <div className="settings-group-card">{children}</div>
    </section>
  );
}

/**
 * One setting: title + short description at the inline start, the control at
 * the inline end. `stack` drops a wide control (e.g. a form) onto its own
 * line under the text instead.
 */
export function SettingsRow({
  title,
  description,
  control,
  stack,
  children,
}: {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
  stack?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={stack ? 'settings-row settings-row-stack' : 'settings-row'}>
      <div className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {description && <span className="settings-row-desc">{description}</span>}
      </div>
      {control && <div className="settings-row-control">{control}</div>}
      {children}
    </div>
  );
}
