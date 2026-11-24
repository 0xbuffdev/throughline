import { ThroughlineAuthoringError } from "./authoring.js";

/** Host-only work limits, distinct from the public per-artifact schema caps. */
export const AUTHORING_LIMITS = Object.freeze({
	sourceBytes: 4 * 1024 * 1024,
	astNodes: 100_000,
	astDepth: 128,
	codeNodes: 10_000,
	artifactBytes: 32 * 1024 * 1024,
});

export class DocumentAuthoringBudget {
	private source = 0;
	private resolved = 0;

	private charge(text: string, used: number, max: number, label: string): number {
		// Reject before allocating a UTF-8 buffer when even the UTF-16
		// length cannot fit. The remaining allocation is bounded by max.
		if (text.length > max - used)
			throw new ThroughlineAuthoringError("THL_LIMIT", "document " + label + " byte budget exceeded");
		const total = used + new TextEncoder().encode(text).byteLength;
		if (total > max)
			throw new ThroughlineAuthoringError("THL_LIMIT", "document " + label + " byte budget exceeded");
		return total;
	}

	body(text: string): void {
		this.source = this.charge(text, this.source, AUTHORING_LIMITS.sourceBytes, "thl body");
	}

	artifact(json: string): void {
		this.resolved = this.charge(json, this.resolved, AUTHORING_LIMITS.artifactBytes, "resolved artifact");
	}
}
