import { z } from "zod";

const clientIdSchema = z.string().min(1);

/**
 * Builds Mastra memory resource/thread ids scoped to a single vault client.
 * Resource and thread must always equal clientId so agent runs cannot share memory across clients.
 */
export function buildClientMemoryScope(clientId: string): {
  resource: string;
  thread: string;
} {
  const id = clientIdSchema.parse(clientId);
  return { resource: id, thread: id };
}
