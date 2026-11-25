/**
 * The admin fallbacks page's figures (openspec `fallbacks-dashboard`): per
 * model, what share of the calls aimed at it were handed to the stage's
 * backup model. Pure: the grouped llm_calls counts come in, the cards come
 * out. The fallback mark on a backup row (`fallback_from_model`, openspec
 * `llm-model-settings`) is the only link between a failed primary call and
 * its backup; a held provider sends the call straight to the backup with the
 * reason 'provider held' and no primary row, so those count as aimed at the
 * primary too.
 */

/** One (model, provider, stage, mark, status) group of llm_calls with its count. */
export interface FallbackGroup {
  model: string;
  provider: string;
  purpose: string;
  fallbackFromModel: string | null;
  fallbackFromProvider: string | null;
  fallbackReason: string | null;
  status: 'ok' | 'error';
  calls: number;
}

export const HELD_REASON = 'provider held';

export interface FallbackStageFigures {
  purpose: string;
  aimed: number;
  fellBack: number;
  /** fellBack / aimed, 0 when nothing was aimed. */
  share: number;
}

export interface FallbackPrimaryFigures {
  /** Calls where this model was the first asked (its own unmarked rows, plus held-provider fallbacks that never reached it). */
  aimed: number;
  /** Calls handed to a backup model. */
  fellBack: number;
  share: number;
  /** Failed calls that had no backup to go to. */
  failedNoBackup: number;
  backupAnswered: number;
  backupFailed: number;
  byReason: { reason: string; calls: number }[];
  byStage: FallbackStageFigures[];
}

export interface FallbackBackupFigures {
  took: number;
  answered: number;
  fromModels: { model: string; calls: number }[];
}

export interface FallbackModelCard {
  model: string;
  provider: string;
  /** Null when no call was aimed at the model in the period (a backup-only model). */
  primary: FallbackPrimaryFigures | null;
  /** Null when the model took no fallback call in the period. */
  asBackup: FallbackBackupFigures | null;
}

export interface FallbackSummary {
  totals: { aimed: number; fellBack: number; share: number };
  /** Ordered by share descending, then calls aimed descending, then model name. */
  models: FallbackModelCard[];
}

interface PrimaryAcc {
  aimed: number;
  primaryErrors: number;
  fellBack: number;
  held: number;
  backupAnswered: number;
  backupFailed: number;
  byReason: Map<string, number>;
  byStage: Map<string, { aimed: number; fellBack: number }>;
}

interface BackupAcc {
  took: number;
  answered: number;
  fromModels: Map<string, number>;
}

interface ModelAcc {
  model: string;
  provider: string;
  primary: PrimaryAcc | null;
  asBackup: BackupAcc | null;
}

function share(fellBack: number, aimed: number): number {
  return aimed > 0 ? fellBack / aimed : 0;
}

function bump<K>(map: Map<K, number>, key: K, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Folds the grouped counts into one card per model and the period totals. */
export function summarizeFallbacks(groups: FallbackGroup[]): FallbackSummary {
  const models = new Map<string, ModelAcc>();
  const modelOf = (model: string, provider: string): ModelAcc => {
    let acc = models.get(model);
    if (!acc) {
      acc = { model, provider, primary: null, asBackup: null };
      models.set(model, acc);
    }
    return acc;
  };
  const primaryOf = (model: string, provider: string): PrimaryAcc => {
    const acc = modelOf(model, provider);
    acc.primary ??= { aimed: 0, primaryErrors: 0, fellBack: 0, held: 0, backupAnswered: 0, backupFailed: 0, byReason: new Map(), byStage: new Map() };
    return acc.primary;
  };
  const stageOf = (p: PrimaryAcc, purpose: string): { aimed: number; fellBack: number } => {
    let s = p.byStage.get(purpose);
    if (!s) {
      s = { aimed: 0, fellBack: 0 };
      p.byStage.set(purpose, s);
    }
    return s;
  };

  for (const g of groups) {
    if (g.fallbackFromModel === null) {
      const p = primaryOf(g.model, g.provider);
      p.aimed += g.calls;
      if (g.status === 'error') p.primaryErrors += g.calls;
      stageOf(p, g.purpose).aimed += g.calls;
      continue;
    }
    // A backup row: counts against the primary it replaced, and for the backup that took it.
    const p = primaryOf(g.fallbackFromModel, g.fallbackFromProvider ?? '');
    const reason = g.fallbackReason ?? 'error';
    p.fellBack += g.calls;
    bump(p.byReason, reason, g.calls);
    const stage = stageOf(p, g.purpose);
    stage.fellBack += g.calls;
    if (reason === HELD_REASON) {
      p.held += g.calls;
      p.aimed += g.calls;
      stage.aimed += g.calls;
    }
    if (g.status === 'ok') p.backupAnswered += g.calls;
    else p.backupFailed += g.calls;

    const b = modelOf(g.model, g.provider);
    b.asBackup ??= { took: 0, answered: 0, fromModels: new Map() };
    b.asBackup.took += g.calls;
    if (g.status === 'ok') b.asBackup.answered += g.calls;
    bump(b.asBackup.fromModels, g.fallbackFromModel, g.calls);
  }

  const cards: FallbackModelCard[] = [...models.values()].map((acc) => ({
    model: acc.model,
    provider: acc.provider,
    primary: acc.primary
      ? {
          aimed: acc.primary.aimed,
          fellBack: acc.primary.fellBack,
          share: share(acc.primary.fellBack, acc.primary.aimed),
          failedNoBackup: Math.max(0, acc.primary.primaryErrors - (acc.primary.fellBack - acc.primary.held)),
          backupAnswered: acc.primary.backupAnswered,
          backupFailed: acc.primary.backupFailed,
          byReason: [...acc.primary.byReason.entries()]
            .map(([reason, calls]) => ({ reason, calls }))
            .sort((a, b) => b.calls - a.calls || a.reason.localeCompare(b.reason)),
          byStage: [...acc.primary.byStage.entries()]
            .map(([purpose, s]) => ({ purpose, aimed: s.aimed, fellBack: s.fellBack, share: share(s.fellBack, s.aimed) }))
            .sort((a, b) => b.share - a.share || b.aimed - a.aimed || a.purpose.localeCompare(b.purpose)),
        }
      : null,
    asBackup: acc.asBackup
      ? {
          took: acc.asBackup.took,
          answered: acc.asBackup.answered,
          fromModels: [...acc.asBackup.fromModels.entries()]
            .map(([model, calls]) => ({ model, calls }))
            .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model)),
        }
      : null,
  }));
  cards.sort(
    (a, b) =>
      (b.primary?.share ?? 0) - (a.primary?.share ?? 0) ||
      (b.primary?.aimed ?? 0) - (a.primary?.aimed ?? 0) ||
      a.model.localeCompare(b.model),
  );

  const aimed = cards.reduce((n, c) => n + (c.primary?.aimed ?? 0), 0);
  const fellBack = cards.reduce((n, c) => n + (c.primary?.fellBack ?? 0), 0);
  return { totals: { aimed, fellBack, share: share(fellBack, aimed) }, models: cards };
}
