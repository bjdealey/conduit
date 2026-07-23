/**
 * Mapping is where vendor payloads become domain models. It must fail *loudly*:
 * a silent mapping failure — a partially populated model that looks valid — is the
 * failure mode that survives to production undetected. Every normaliser that cannot
 * produce a complete, valid model throws a `MappingError` instead.
 */

/** Where a mapping is happening, carried on every `MappingError` for diagnosis. */
export type MapContext = {
  /** Connector instance id, e.g. "a360-prod-eu". */
  connectorId: string;
  /** Connector type / platform, e.g. "automation-anywhere". */
  platform: string;
  /** Capability being mapped, e.g. "bots". */
  capability: string;
  /** Raw vendor id, once known. */
  sourceId?: string;
};

/** Thrown when a vendor payload cannot be normalised into a valid domain model. */
export class MappingError extends Error {
  readonly connectorId: string;
  readonly platform: string;
  readonly capability: string;
  readonly sourceId?: string;
  /** The offending field, when the failure is field-level. */
  readonly field?: string;
  /** The value actually received, for the log line. */
  readonly received?: unknown;

  constructor(message: string, ctx: MapContext & { field?: string; received?: unknown }) {
    super(message);
    this.name = "MappingError";
    this.connectorId = ctx.connectorId;
    this.platform = ctx.platform;
    this.capability = ctx.capability;
    this.sourceId = ctx.sourceId;
    this.field = ctx.field;
    this.received = ctx.received;
  }
}
