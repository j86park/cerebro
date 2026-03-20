import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/lib/config";

const sendTransactionalEmailInputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().min(1),
});

export type SendTransactionalEmailInput = z.infer<
  typeof sendTransactionalEmailInputSchema
>;

/**
 * Sends a transactional email via Resend, or logs and skips when DRY_RUN is enabled.
 */
export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<{ id: string; skipped: boolean }> {
  const parsed = sendTransactionalEmailInputSchema.parse(input);

  if (env.DRY_RUN) {
    console.info("[resend] DRY_RUN: skipping email send", {
      to: parsed.to,
      subject: parsed.subject,
    });
    return { id: "dry-run", skipped: true };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: "Cerebro <notifications@example.com>",
    to: parsed.to,
    subject: parsed.subject,
    text: parsed.text,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { id: data?.id ?? "unknown", skipped: false };
}
