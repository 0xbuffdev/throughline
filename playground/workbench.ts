import {
	ArtifactValidationError,
	ThroughlineAuthoringError,
	compileArtifact,
	parseThlBody,
} from "../src/index.js";
import type { CompiledTrace } from "../src/v2/model.js";

/**
 * The public playground deliberately uses the *same* strict read-side
 * validation and compiler as a production consumer. It never executes source
 * or converts prose into an invented artifact.
 */
export type WorkbenchResult =
	| Readonly<{ kind: "ready"; trace: CompiledTrace }>
	| Readonly<{ kind: "intent"; message: string }>
	| Readonly<{ kind: "invalid"; message: string; path?: string; code?: string }>;

export const STARTER_SOURCE = JSON.stringify({
	schemaVersion: 2,
	id: "my_first_trace",
	origins: [{ id: "author", kind: "authored" }],
	entities: [{ id: "counter", label: "Counter" }],
	relations: [],
	initialState: { counter: { status: "known", value: 0 } },
	steps: [{
		id: "increment",
		label: "Increment counter",
		events: [{
			id: "counterWrite",
			type: "write",
			originId: "author",
			entityId: "counter",
			path: [],
			value: { status: "known", value: 1 },
		}],
	}],
}, null, 2);

/** Accept a single pasted Markdown fence, without treating arbitrary Markdown as code. */
export function unwrapThlFence(value: string): string {
	const trimmed = value.trim();
	const match = /^(~{3,}|`{3,})thl[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/.exec(trimmed);
	return match ? match[2] : value;
}

export function compileWorkbenchSource(source: string): WorkbenchResult {
	try {
		const parsed = parseThlBody(source);
		if (parsed.kind === "intent") {
			return {
				kind: "intent",
				message: "This is descriptive intent, not runnable JSON. To visualize prose, materialize a schema-2 artifact with the CLI and approve its sidecar in your content repository.",
			};
		}
		// Always compile, not merely parse. This catches atomic write conflicts,
		// sent-message presence errors and expanded-work budget violations.
		return { kind: "ready", trace: compileArtifact(parsed.value) };
	} catch (error) {
		if (error instanceof ArtifactValidationError) {
			return {
				kind: "invalid",
				path: error.path,
				message: error.message.startsWith(error.path + ": ")
					? error.message.slice(error.path.length + 2)
					: error.message,
			};
		}
		if (error instanceof ThroughlineAuthoringError) {
			return { kind: "invalid", code: error.code, message: error.message };
		}
		return { kind: "invalid", message: "Unable to read this artifact. Check the JSON and try again." };
	}
}

/** Only successful compiler output can be formatted or exported as an artifact. */
export function formatWorkbenchSource(result: WorkbenchResult): string | null {
	return result.kind === "ready" ? JSON.stringify(result.trace.artifact, null, 2) : null;
}

export function markdownForSource(source: string): string {
	return "```thl\n" + source.trimEnd() + "\n```\n";
}
