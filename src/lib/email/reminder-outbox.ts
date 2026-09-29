import { prisma } from "@/lib/db/client";
import { sendTransactionalEmail } from "@/lib/email/resend";

const LEASE_MS = 5 * 60 * 1000;

/** Claims one durable reminder intent. Provider idempotency protects retries after a crash. */
export async function deliverReminderEmail(outboxId: string): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.reminderEmailOutbox.updateMany({
    where: {
      id: outboxId,
      OR: [
        { status: "PENDING" },
        { status: "SENDING", lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } },
      ],
    },
    data: { status: "SENDING", lockedAt: now, attemptCount: { increment: 1 } },
  });
  if (claimed.count === 0) return false;
  const intent = await prisma.reminderEmailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
  try {
    const sent = await sendTransactionalEmail({
      to: intent.recipient,
      subject: intent.subject,
      text: intent.body,
      idempotencyKey: intent.idempotencyKey,
    });
    if (sent.skipped) throw new Error("Delivery was skipped; keeping the outbox intent pending");
    await prisma.reminderEmailOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), providerId: sent.id, lockedAt: null, lastError: null },
    });
    return true;
  } catch (error) {
    await prisma.reminderEmailOutbox.update({
      where: { id: outboxId },
      data: { status: "PENDING", lockedAt: null, lastError: String(error).slice(0, 500) },
    });
    throw error;
  }
}

/** Called by the core worker independently of the agent cooldown. */
export async function retryPendingReminderEmails(limit = 25): Promise<number> {
  const intents = await prisma.reminderEmailOutbox.findMany({
    where: { OR: [
      { status: "PENDING" },
      { status: "SENDING", lockedAt: { lt: new Date(Date.now() - LEASE_MS) } },
    ] },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let delivered = 0;
  for (const intent of intents) {
    try {
      if (await deliverReminderEmail(intent.id)) delivered++;
    } catch (error) {
      console.error(`[ReminderOutbox] Delivery failed for ${intent.id}:`, error);
    }
  }
  return delivered;
}
