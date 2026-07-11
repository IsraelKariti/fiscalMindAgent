# Accessibility audit log — www.fiscalmind.app

Legal basis: תקנה 35 לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
התשע"ג-2013 — requires conformance with ת"י 5568 חלק 1 ברמת AA (current edition
September 2023, aligned with WCAG 2.1 AA).

## How to run the audit

```
npm run build
node scripts/axe-audit.mjs
```

The script serves the static export and checks, per axe-core (WCAG 2.0/2.1 A+AA +
best-practice rules): the homepage and `/accessibility` on desktop, the homepage with
the FAQ expanded and on every testimonial carousel page, mobile viewport with the menu
closed and open, horizontal reflow at 320 px (WCAG 1.4.10), and a full keyboard
traversal asserting every tab stop is visible and shows a focus outline (WCAG 2.1.1,
2.4.7). Run it before every deploy; it exits non-zero on any violation.

## Audit history

### 2026-07-11 — full pass (axe-core via scripts/axe-audit.mjs)

All checks passed: 8 axe scans clean, no reflow overflow at 320 px, 26 keyboard tab
stops all visible with focus indicators, first stop is the skip link.

Issues found and fixed in this audit cycle:

- Body/secondary text `#64748B` measured 3.94:1–4.15:1 (WCAG 1.4.3 requires 4.5:1) —
  replaced with `#7E8CA0` (≥5.5:1) across all text uses.
- Inactive carousel/morph dot controls `#1E1E2E` measured 1.23:1 (WCAG 1.4.11 requires
  3:1 for UI components) — changed to `#64748B` (≥4.2:1).
- "How it works" watermark numbers `#1E1E2E` measured 1.22:1 (large text needs 3:1) —
  changed to `#5D5D78` (3.16:1).
- "How it works" timeline circles: white 12 px text on `bg-blue-500` measured 3.76:1 —
  darkened to `bg-blue-600` (5.25:1).
- Footer heading order jumped h2→h4 — footer column titles are now h3.

## Manual checks not covered by automation

- Screen-reader session (NVDA/VoiceOver): navigate by landmarks and headings, operate
  the FAQ accordion and the testimonials carousel. Last performed: **not yet** — do
  once and record the date here.
- Content-level judgement calls (meaningful alt text, clear link purpose, Hebrew
  language quality of ARIA labels) — reviewed in code review 2026-07-11.

## Accessibility statement

`/accessibility` — must name the רכז נגישות (עידו פרלמוטר, 054-968-6540,
admin@fiscalmind.app), commit to a response time (14 business days), cite ת"י 5568-1 /
WCAG 2.1 AA, and carry a last-updated date. Review the statement at least annually and
after any significant site change; complaints must be handled within 60 days.
