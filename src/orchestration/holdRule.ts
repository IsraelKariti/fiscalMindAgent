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
