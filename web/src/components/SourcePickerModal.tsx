import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

export interface PickerColumn {
  id: string;
  title: string;
}

export interface PickerItem {
  id: string;
  name: string;
  /** Column choices (boards: the phone column). Present ⇒ the row shows a select. */
  columns?: PickerColumn[];
  /** Preselected column for items that aren't chosen yet. */
  defaultColumnId?: string;
}

export interface PickerSelection {
  id: string;
  columnId?: string;
}

/**
 * Checklist modal for picking the customer-service agent's monday sources
 * (workdocs / boards). The full catalog can be long, so the list scrolls and
 * is searchable; nothing is saved until the user confirms.
 */
export function SourcePickerModal({
  title,
  items,
  initial,
  columnLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  items: PickerItem[];
  initial: PickerSelection[];
  /** Label for the per-item column select (e.g. "Phone column"). */
  columnLabel?: string;
  onConfirm: (selection: PickerSelection[]) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial.map((s) => s.id)));
  const [columnById, setColumnById] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((item) => {
        const chosen = initial.find((s) => s.id === item.id)?.columnId;
        return [item.id, chosen ?? item.defaultColumnId ?? item.columns?.[0]?.id ?? ''];
      }),
    ),
  );

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    onConfirm(
      items
        .filter((item) => checked.has(item.id))
        .map((item) => ({ id: item.id, columnId: item.columns ? columnById[item.id] : undefined })),
    );
  };

  const needle = query.trim().toLowerCase();
  const visible = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-picker" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input
          className="picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.csPickerSearch}
          autoFocus
        />
        {visible.length === 0 ? (
          <p className="picker-empty muted">{t.csPickerNoMatches}</p>
        ) : (
          <ul className="picker-list">
            {visible.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <li key={item.id} className={`picker-row ${isChecked ? 'picker-row-checked' : ''}`}>
                  <label className="picker-row-main">
                    <input type="checkbox" checked={isChecked} onChange={() => toggle(item.id)} />
                    <span className="picker-row-name">{item.name}</span>
                  </label>
                  {item.columns && columnLabel && (
                    <label className="picker-row-column">
                      <span className="muted">{columnLabel}</span>
                      <select
                        value={columnById[item.id]}
                        onChange={(e) => setColumnById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      >
                        {item.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" type="button" onClick={confirm}>
            {t.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
