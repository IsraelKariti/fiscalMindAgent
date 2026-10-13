/**
 * What the workspace tells every viewer about a scheduled draft that waits for
 * admin approval (openspec `review-wait-visibility`). Pure rules over the
 * draft row, shared by the client read (the `nextScheduled` payload) and the
 * send-now gate, so the badge and the refusal can never disagree.
 */
export interface ReviewWaitDraft {
  status: 'draft' | 'held' | 'sent' | 'received';
  review_status: 'pending' | 'approved' | 'superseded' | null;
  held_at: Date | null;
}

/** True while the admin has not yet approved the draft (pending, whether or not the worker already held it). */
export function awaitsAdminReview(draft: ReviewWaitDraft | null): boolean {
  return draft?.review_status === 'pending';
}

/** The two review fields of the `nextScheduled` payload. */
export function reviewWaitState(draft: ReviewWaitDraft | null): { reviewPending: boolean; heldAt: Date | null } {
  return {
    reviewPending: awaitsAdminReview(draft),
    heldAt: draft && draft.status === 'held' && awaitsAdminReview(draft) ? draft.held_at : null,
  };
}
