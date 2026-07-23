/**
 * Validation primitives for adapter-boundary mapping. Adapters compose these against
 * their vendor field names; each throws `MappingError` on anything it cannot accept,
 * so a normaliser either returns a complete valid model or fails loudly — never a
 * partial one.
 */
import { MapContext, MappingError } from "./errors";

/** A human label for a value's shape, for error messages. */
function describeValue(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Assert the payload is a plain object; guards non-object vendor payloads. */
export function asRecord(raw: unknown, ctx: MapContext): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MappingError(`expected an object payload, received ${describeValue(raw)}`, {
      ...ctx,
      received: raw,
    });
  }
  return raw as Record<string, unknown>;
}

/** Require a non-empty string at `field`. */
export function requireString(rec: Record<string, unknown>, field: string, ctx: MapContext): string {
  const v = rec[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new MappingError(`field "${field}" must be a non-empty string, received ${describeValue(v)}`, {
      ...ctx,
      field,
      received: v,
    });
  }
  return v;
}

/** Require a value from an allowed set at `field`. */
export function requireEnum<T extends string>(
  rec: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  ctx: MapContext,
): T {
  const v = rec[field];
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new MappingError(
      `field "${field}" must be one of [${allowed.join(", ")}], received ${describeValue(v)}`,
      { ...ctx, field, received: v },
    );
  }
  return v as T;
}

/** Build the namespaced domain id from an instance id and the raw vendor id. */
export function stampId(connectorId: string, sourceId: string): string {
  return `${connectorId}:${sourceId}`;
}
