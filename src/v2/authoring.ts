import { compileArtifact } from "./compiler.js";
import type { ValidatedArtifact } from "./model.js";
import { ArtifactValidationError, parseArtifactJson, serializeArtifact, validateArtifact } from "./validator.js";
import { sha256Text } from "./sha256.js";

export type IntentBlock = Readonly<{ body: string }>;
export type ThlBody =
	| Readonly<{ kind: "intent"; value: IntentBlock }>
	| Readonly<{ kind: "artifact"; value: ValidatedArtifact }>;

export type AuthoringErrorCode =
	| "THL_EMPTY" | "THL_INTENT_LIMIT" | "THL_LIMIT" | "THL_UNICODE" | "THL_SYNTAX"
	| "THL_UNSUPPORTED_DOCUMENT" | "THL_PATH" | "THL_MANIFEST"
	| "THL_UNRESOLVED" | "THL_UNREVIEWED" | "THL_DIGEST" | "THL_LOADER";

export class ThroughlineAuthoringError extends Error {
	constructor(public readonly code: AuthoringErrorCode, message: string) {
		super(code + ": " + message);
		this.name = "ThroughlineAuthoringError";
	}
}

function reject(code: AuthoringErrorCode, message: string): never {
	throw new ThroughlineAuthoringError(code, message);
}

export function normalizeThlBody(body: string): string {
	if (typeof body !== "string") reject("THL_SYNTAX", "expected a string body");
	// Never let UTF-8 TextEncoder silently replace malformed Unicode before hashing.
	for (let i = 0; i < body.length; i++) {
		const code = body.charCodeAt(i);
		if (code >= 0xd800 && code <= 0xdbff) {
			const low = body.charCodeAt(++i);
			if (!(low >= 0xdc00 && low <= 0xdfff))
				reject("THL_UNICODE", "lone high surrogate in thl text");
		} else if (code >= 0xdc00 && code <= 0xdfff) {
			reject("THL_UNICODE", "lone low surrogate in thl text");
		}
	}
	return body.replace(/\r\n?/g, "\n");
}

/** Parse inert descriptive intent. It is not an executable language. */
export function parseIntentBlock(markdownBody: string): IntentBlock {
	const body = normalizeThlBody(markdownBody);
	if (body.length > 262_144)
		reject("THL_INTENT_LIMIT", "prose intent exceeds 262,144 UTF-16 units");
	if (!body.trim()) reject("THL_EMPTY", "thl body cannot be empty");
	if (body.trimStart().startsWith("{"))
		reject("THL_SYNTAX", "opening brace selects strict JSON, not prose intent");
	return Object.freeze({ body });
}

/**
 * The first non-whitespace character is the only branch selector.
 * A JSON-looking body never falls through to prose, a provider, or v1 parsing.
 */
export function parseThlBody(markdownBody: string): ThlBody {
	const normalized = normalizeThlBody(markdownBody);
	if (!normalized.trim()) reject("THL_EMPTY", "thl body cannot be empty");
	if (!normalized.trimStart().startsWith("{"))
		return Object.freeze({ kind: "intent", value: parseIntentBlock(normalized) });
	// The document/visual-plan envelope belongs to TL-U21, not this foundation.
	// Do not parse unknown wrappers as prose or run any authoring resolver.
	try {
		return Object.freeze({ kind: "artifact", value: parseArtifactJson(normalized) });
	} catch (error) {
		// Only a root-level missing schema plus a documentVersion marker can
		// identify the future envelope. Nested data may use this key legally.
		if (error instanceof ArtifactValidationError && error.path === "$.schemaVersion" &&
			/"documentVersion"\s*:/.test(normalized))
			reject("THL_UNSUPPORTED_DOCUMENT", "ThroughlineDocument is not supported before TL-U21; expected schemaVersion 2");
		throw error;
	}
}

const DIGEST = /^[0-9a-f]{64}$/;
export type SidecarEntry = Readonly<{
	document: string;
	ordinal: number;
	intentSha256: string;
	artifactPath: string;
	artifactSha256: string;
	review: "reviewed" | "unreviewed";
}>;
export type SidecarManifest = Readonly<{ version: 1; entries: readonly SidecarEntry[] }>;

function dataRecord(input: unknown, keys: readonly string[], description: string): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input) ||
		(Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null))
		reject("THL_MANIFEST", description + " must be a plain data object");
	const descriptors = Object.getOwnPropertyDescriptors(input);
	const names = Reflect.ownKeys(descriptors);
	if (names.length !== keys.length || names.some((k) => typeof k !== "string" || !keys.includes(k)))
		reject("THL_MANIFEST", description + " has missing or unsupported fields");
	const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
			reject("THL_MANIFEST", description + " must contain own data fields");
		Object.defineProperty(record, key, { value: descriptor.value, enumerable: true });
	}
	return record;
}

/** Normalize validated, repository-relative POSIX document/artifact paths. */
export function artifactRelativePath(path: string): string {
	if (typeof path !== "string" || !path || path.length > 4096 ||
		path.startsWith("/") || path.includes("\\") ||
		/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path.includes("\0"))
		reject("THL_PATH", "expected a repository-relative POSIX path");
	let decoded: string;
	try { decoded = decodeURIComponent(path); }
	catch { return reject("THL_PATH", "invalid percent escape in repository path"); }
	if (decoded.startsWith("/") || decoded.includes("\\") || decoded.includes("\0") ||
		/^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded))
		reject("THL_PATH", "unsafe decoded repository path");
	for (const segment of decoded.split("/")) {
		if (segment === "" || segment === "." || segment === ".." || /[\u0000-\u001f]/.test(segment))
			reject("THL_PATH", "empty, dot or traversal path segment");
	}
	// Reject encoded separators and ambiguous aliases, not just literal ../.
	if (decoded !== path)
		reject("THL_PATH", "percent-encoded path components are not allowed");
	return path;
}

// Only our own detached/frozen manifests are trusted cache keys. Raw mutable
// caller inputs are revalidated, never cached by their identity.
const manifestIndexes = new WeakMap<SidecarManifest, ReadonlyMap<string, SidecarEntry>>();
const locatorKey = (document: string, ordinal: number): string => document + "\\0" + ordinal;

/** Validate and detach a sidecar supplied by an explicitly trusted host. */
export function validateSidecarManifest(input: unknown): SidecarManifest {
	if (input && typeof input === "object" && manifestIndexes.has(input as SidecarManifest))
		return input as SidecarManifest;
	const manifest = dataRecord(input, ["version", "entries"], "manifest");
	if (manifest.version !== 1) reject("THL_MANIFEST", "unsupported manifest version");
	if (!Array.isArray(manifest.entries) || manifest.entries.length > 10_000)
		reject("THL_MANIFEST", "manifest entries must be a bounded array");
	if (Object.getPrototypeOf(manifest.entries) !== Array.prototype ||
		Reflect.ownKeys(manifest.entries).length !== manifest.entries.length + 1)
		reject("THL_MANIFEST", "manifest entries must be dense ordinary JSON data");
	const entries: SidecarEntry[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < manifest.entries.length; i++) {
		const slot = Object.getOwnPropertyDescriptor(manifest.entries, String(i));
		if (!slot || !slot.enumerable || !("value" in slot))
			reject("THL_MANIFEST", "entries[" + i + "] must be an own data value");
		const row = dataRecord(slot.value, [
			"document", "ordinal", "intentSha256", "artifactPath", "artifactSha256", "review",
		], "entries[" + i + "]");
		const document = artifactRelativePath(row.document as string);
		const artifactPath = artifactRelativePath(row.artifactPath as string);
		const ordinal = row.ordinal;
		if (typeof ordinal !== "number" || !Number.isSafeInteger(ordinal) || ordinal < 0)
			reject("THL_MANIFEST", "entry ordinal must be a nonnegative safe integer");
		if (typeof row.intentSha256 !== "string" || !DIGEST.test(row.intentSha256) ||
			typeof row.artifactSha256 !== "string" || !DIGEST.test(row.artifactSha256))
			reject("THL_MANIFEST", "entry digests must be 64 lowercase hex characters");
		if (row.review !== "reviewed" && row.review !== "unreviewed")
			reject("THL_MANIFEST", "entry must have an explicit review status");
		const locator = JSON.stringify([document, ordinal]);
		if (seen.has(locator))
			reject("THL_MANIFEST", "duplicate document/ordinal locator: " + locator);
		seen.add(locator);
		entries.push(Object.freeze({
			document, artifactPath, ordinal, intentSha256: row.intentSha256,
			artifactSha256: row.artifactSha256, review: row.review,
		}));
	}
	const validated: SidecarManifest = Object.freeze({ version: 1, entries: Object.freeze(entries) });
	manifestIndexes.set(validated, new Map(entries.map(entry => [locatorKey(entry.document, entry.ordinal), entry])));
	return validated;
}

/** Hash canonical validated artifact JSON, never the source file's whitespace. */
export function artifactSha256(artifact: ValidatedArtifact): string {
	return sha256Text(serializeArtifact(artifact));
}

export type MaterializationOptions = Readonly<{
	document?: string;
	ordinal?: number;
	manifest?: unknown;
	/** Host-owned, trusted, synchronous loader; no path IO in the core. */
	loadArtifact?: (relativePath: string) => unknown;
}>;

/**
 * Resolve a single v2 body without any network or provider invocation.
 * JSON needs no manifest. Prose requires an exact reviewed materialization.
 */
export function resolveThlBody(body: string, options: MaterializationOptions = {}): ValidatedArtifact {
	return resolveParsedThlBody(parseThlBody(body), options);
}

/** Internal host path: resolve the result of parseThlBody without classifying
 * or parsing it twice. Callers must supply parser-owned data. This helper
 * is deliberately not exported by the package entrypoint. */
export function resolveParsedThlBody(parsed: ThlBody, options: MaterializationOptions = {}): ValidatedArtifact {
	let artifact: ValidatedArtifact;
	if (parsed.kind === "artifact") {
		artifact = parsed.value;
	} else {
		if (!options.manifest || !options.loadArtifact)
			reject("THL_UNRESOLVED", "prose intent requires a reviewed sidecar and trusted loader (no automatic provider)");
		const document = artifactRelativePath(options.document as string);
		if (!Number.isSafeInteger(options.ordinal) || (options.ordinal as number) < 0)
			reject("THL_MANIFEST", "a zero-based thl ordinal is required for prose");
		const manifest = validateSidecarManifest(options.manifest);
		const entry = manifestIndexes.get(manifest)!.get(locatorKey(document, options.ordinal as number));
		if (!entry) reject("THL_UNRESOLVED", "no sidecar entry for document and thl ordinal");
		if (entry.intentSha256 !== sha256Text(parsed.value.body))
			reject("THL_DIGEST", "source body hash differs from reviewed sidecar");
		if (entry.review !== "reviewed")
			reject("THL_UNREVIEWED", "sidecar entry is unreviewed; editorial approval is required");
		let source: unknown;
		// An explicitly trusted loader is host code and may throw with local
		// paths, credentials, or other private details. Never propagate it.
		try {
			source = options.loadArtifact(entry.artifactPath);
		} catch {
			reject("THL_LOADER", "trusted artifact loader failed; review the host configuration");
		}
		artifact = typeof source === "string" ? parseArtifactJson(source) : validateArtifact(source);
		if (artifactSha256(artifact) !== entry.artifactSha256)
			reject("THL_DIGEST", "canonical artifact hash differs from reviewed sidecar");
	}
	// Structural validity alone is insufficient: validate atomic write conflicts,
	// model presence, message-send truth and expansion work through compilation.
	return compileArtifact(artifact).artifact;
}
