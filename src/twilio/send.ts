import { twilioClient } from './client.js';

/**
 * Free-form WhatsApp message — only deliverable while the client's 24h
 * customer-service window is open (the worker re-checks before calling this).
 */
export async function sendWhatsAppText(args: { from: string; to: string; body: string }): Promise<{ sid: string }> {
  const message = await twilioClient().messages.create({
    from: `whatsapp:${args.from}`,
    to: `whatsapp:${args.to}`,
    body: args.body,
  });
  return { sid: message.sid };
}

/**
 * Pre-approved Content Template message — the only kind Meta accepts outside
 * the 24h window. `variables` fill the template's {{1}}..{{n}} slots in order.
 */
export async function sendWhatsAppTemplate(args: {
  from: string;
  to: string;
  contentSid: string;
  variables: string[];
}): Promise<{ sid: string }> {
  const message = await twilioClient().messages.create({
    from: `whatsapp:${args.from}`,
    to: `whatsapp:${args.to}`,
    contentSid: args.contentSid,
    contentVariables: JSON.stringify(Object.fromEntries(args.variables.map((v, i) => [String(i + 1), v]))),
  });
  return { sid: message.sid };
}
