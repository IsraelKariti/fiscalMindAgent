/**
 * The held first message (openspec `first-message-approval`): a manual-kickoff
 * client's first message is drafted on the kickoff while the client stays
 * paused, stored with its planned time and never queued. The state is derived,
 * not stored — three facts identify it. Pure; heldFirstMessage.ts looks the
 * facts up.
 */
export function holdsFirstMessage(args: { paused: boolean; manualKickoff: boolean; contactedMessages: number }): boolean {
  return args.paused && args.manualKickoff && args.contactedMessages === 0;
}

/**
 * Whether enrollment creates the client paused (change `configurable-kickoff`):
 * only a manual-kickoff type, and only while the instance's first-message
 * approval is on. Off = the client enrolls running, so its first draft takes
 * the normal path (stored + send queued for its planned time) with no Resume.
 */
export function enrollsPaused(args: { manualKickoff: boolean; firstMessageApproval: boolean }): boolean {
  return args.manualKickoff && args.firstMessageApproval;
}

/**
 * Whether a monday kickoff click starts this client: a never-contacted,
 * goal-open client with no stored draft and no draft being written. Paused or
 * not makes no difference (an approval-off client enrolls running); the
 * message and draft checks are the real "never started" guards. Repeat
 * clicks, started conversations and clients holding a draft all fall out here.
 */
export function kickoffStartable(args: {
  goalStatus: string;
  draftingSince: Date | null;
  messages: number;
  hasScheduledJob: boolean;
}): boolean {
  return args.goalStatus === 'pending' && args.draftingSince === null && args.messages === 0 && !args.hasScheduledJob;
}
