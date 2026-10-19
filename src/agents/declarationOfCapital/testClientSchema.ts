import { z } from 'zod';

/**
 * The body of the admin's test-client form (openspec `admin-test-client`):
 * the identity the monday kickoff would read from the CRM card and the
 * questionnaire item. Pure (no I/O imports) so the schema test stays light;
 * the enrollment lives in testClient.ts.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const TestClientSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(40),
    taxYear: z.number().int().min(2000).max(2100),
    idNumber: optionalText(40),
    fileNumber: optionalText(60),
    maritalStatus: z.enum(['married', 'not_married']).nullable().optional(),
    spouseName: optionalText(200),
    spouseIdNumber: optionalText(40),
    formAnswers: z
      .array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().max(4000) }).strict())
      .max(40)
      .optional(),
  })
  .strict();

export type TestClientInput = z.infer<typeof TestClientSchema>;
