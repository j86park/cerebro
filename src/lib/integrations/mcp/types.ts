import { z } from "zod";

/**
 * MCP tool descriptor projection (SOTA P2.3 watch).
 * Catalog only — not a live MCP server / SSE transport.
 */
export const mcpSideEffectSchema = z.boolean();

export const mcpToolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  /** Domain the tool belongs to for allowlist checks. */
  domain: z.enum(["shared", "compliance", "onboarding"]),
  /** True when invoking the tool can mutate vault state or send externals. */
  sideEffect: mcpSideEffectSchema,
  /** JSON-Schema-ish property names only (Zod mirror; no z.any()). */
  inputPropertyNames: z.array(z.string()).default([]),
});

export type McpToolDescriptor = z.infer<typeof mcpToolDescriptorSchema>;

export const mcpCatalogSchema = z.object({
  tools: z.array(mcpToolDescriptorSchema),
  surfaceEnabled: z.boolean(),
});

export type McpCatalog = z.infer<typeof mcpCatalogSchema>;
