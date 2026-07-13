import { z } from 'zod';

// Shared request schemas live here rather than in workspace.ts so that agent
// modules can import them without creating an import cycle (registry.ts →
// agent module → workspace.ts → registry.ts).

/** "YYYY-MM-DD", must be a real calendar date (V8 rejects e.g. 2026-02-30 as Invalid Date). */
export const DueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'not a valid date');
