import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** Tooltip explaining the action. */
  title?: string;
  /** Destructive action: danger-colored and set apart from the items above it. */
  danger?: boolean;
}

/**
 * A "⋯" button that opens a list of actions. Same popover mechanics as
 * Dropdown (portaled to <body>, fixed-positioned from the trigger's rect,
 * flips upward, closes on blur/Escape) — but it has no value: the items are
 * actions, so it is a menu, not a listbox.
 *
 * The list is as wide as its longest label, not as the icon trigger, so its
 * horizontal position is clamped to the viewport: it starts at the trigger's
 * left edge (the row's end in RTL) and shifts inward when it would overflow.
 * Only one menu stays open at a time because opening another moves focus,
 * which closes this one through its blur handler.
 */
export function ActionMenu({ items, label, disabled }: { items: ActionMenuItem[]; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = list.offsetHeight > spaceBelow && rect.top - gap > spaceBelow;
    const maxLeft = window.innerWidth - list.offsetWidth - margin;
    list.style.left = `${Math.max(margin, Math.min(rect.left, maxLeft))}px`;
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
    // Capture-phase scroll: the trigger sits in scrollable ancestors (the
    // panel body, the monday iframe), whose scroll events don't bubble to window.
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
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>('.action-menu-item')?.focus();
    });
  };

  const select = (item: ActionMenuItem) => {
    setOpen(false);
    triggerRef.current?.focus();
    item.onSelect();
  };

  const onBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    const next = e.relatedTarget as Node | null;
    if (rootRef.current?.contains(next) || listRef.current?.contains(next)) return;
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const menuItems = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.action-menu-item') ?? []);
      const idx = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? Math.min(idx + 1, menuItems.length - 1) : Math.max(idx - 1, 0);
      menuItems[next]?.focus();
    }
  };

  return (
    <span className="action-menu" ref={rootRef} onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="icon-btn"
        ref={triggerRef}
        onClick={toggle}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="dropdown-list action-menu-list" role="menu" ref={listRef}>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                title={item.title}
                className={`dropdown-option action-menu-item${item.danger ? ' danger' : ''}`}
                onClick={() => select(item)}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
