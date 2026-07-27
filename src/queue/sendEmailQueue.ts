import { Queue } from 'bullmq';
import { bullOpts } from './connection.js';

export const SEND_EMAIL_QUEUE_NAME = 'send_email';

export const sendEmailQueue = new Queue<{ clientId: string; emailId: string }>(SEND_EMAIL_QUEUE_NAME, {
  ...bullOpts,
});
