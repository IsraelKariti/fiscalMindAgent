import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Styled replacement for a native <select>. The open list is regular DOM
 * (styled by our CSS, painted with the page) instead of the OS popup the
 * browser draws for <select>, which ignores the app theme.
 *
 * The list is portaled to <body> and fixed-positioned from the trigger's rect:
 * inside a scrollable modal an in-flow list would extend the modal's scroll
 * area and nest a second scrollbar in it. It flips upward when the space below
 * the trigger can't fit it. Portal children still bubble events through the
 * React tree, so the root div's blur/keydown handlers keep working for it.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown muted in the trigger while no option matches the current value. */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const place = () => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = list.offsetHeight > spaceBelow && rect.top - gap > spaceBelow;
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
    if (openUp) {
      list.style.top = 'auto';
      list.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      list.style.bottom = 'auto';
      list.style.top = `${rect.bottom + gap}px`;
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Capture-phase scroll: the trigger may sit in any scrollable ancestor
    // (e.g. the modal body), whose scroll events don't bubble to window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Focus lands on the current option so arrow keys continue from it.
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      const target =
        list.querySelector<HTMLButtonElement>('.dropdown-option.selected') ??
        list.querySelector<HTMLButtonElement>('.dropdown-option');
      target?.focus();
    });
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (rootRef.current?.contains(next) || listRef.current?.contains(next)) return;
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      e.preventDefault();
      const items = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>('.dropdown-option') ?? [],
      );
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
      items[next]?.focus();
    }
  };

  return (
    <div className="dropdown" ref={rootRef} onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="dropdown-trigger"
        ref={triggerRef}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`dropdown-value${selected ? '' : ' placeholder'}`}>
          {selected?.label ?? placeholder ?? ''}
        </span>
        <svg
          className={`dropdown-caret${open ? ' open' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="dropdown-list" role="listbox" ref={listRef}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dropdown-option${o.value === value ? ' selected' : ''}`}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
