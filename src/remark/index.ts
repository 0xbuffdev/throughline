import {
	artifactRelativePath, parseThlBody, resolveParsedThlBody, ThroughlineAuthoringError, validateSidecarManifest,
	type MaterializationOptions, type SidecarManifest,
} from "../v2/authoring.js";
import { ArtifactValidationError, serializeArtifact } from "../v2/validator.js";
import { AUTHORING_LIMITS, DocumentAuthoringBudget } from "../v2/authoring-limits.js";

/** Dependency-free structural mdast and VFile contract. */
type MarkdownNode = {
	type: string;
	children?: readonly MarkdownNode[];
	lang?: string | null;
	meta?: string | null;
	value?: string;
	position?: { start: { line: number; column: number } };
	name?: string | null;
	attributes?: Array<{ type: "mdxJsxAttribute"; name: string; value: string }>;
};
type MarkdownRoot = { type: string; children: readonly MarkdownNode[] };
type Point = { line: number; column: number };
type DiagnosticFile = {
	path?: string;
	value?: string | Uint8Array;
	fail: (reason: string, options?: { place?: Point; source?: string; ruleId?: string }) => never;
};

export type ThroughlineRemarkOptions = Pick<MaterializationOptions, "document" | "manifest" | "loadArtifact"> & {
	/** Map a VFile path to its trusted repository-relative POSIX locator. */
	documentForFile?: (filePath: string) => string;
} & (
	| { mode?: "validate" }
	| { mode: "mdx"; componentName?: string }
);

const validPoint = (point: Point | undefined): point is Point =>
	point !== undefined &&
	Number.isSafeInteger(point.line) && point.line > 0 &&
	Number.isSafeInteger(point.column) && point.column > 0;

/**
 * Validate all thl blocks in depth-first order before any MDX changes.
 * The only language is "thl", without metadata. Inline JSON needs no sidecar;
 * prose is inert until an exact reviewed materialization is supplied.
 */
export function remarkThroughline(options: ThroughlineRemarkOptions = {}) {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new TypeError("remarkThroughline expects an options object");
	const mode = options.mode ?? "validate";
	if ((mode !== "validate" && mode !== "mdx") ||
		Object.keys(options).some(key => ![
			"mode", "componentName", "document", "documentForFile", "manifest", "loadArtifact",
		].includes(key)) ||
		(mode !== "mdx" && "componentName" in options))
		throw new TypeError('remarkThroughline expects { mode: "validate" | "mdx" } and optional trusted sidecar options');
	const componentName = mode === "mdx" && "componentName" in options
		? options.componentName ?? "ThroughlineEmbed" : "ThroughlineEmbed";
	if (mode === "mdx" &&
		(typeof componentName !== "string" || componentName.length > 128 ||
			!/^[A-Z][A-Za-z0-9_]*$/.test(componentName)))
		throw new TypeError("componentName must be a capitalized React component identifier");

	return (tree: MarkdownRoot, file: DiagnosticFile): void => {
		let ordinal = 0;
		let manifest: SidecarManifest | undefined;
		const budget = new DocumentAuthoringBudget();
		const changes: Array<{ siblings: readonly MarkdownNode[]; index: number; node: MarkdownNode }> = [];
		// VFile paths are often absolute. Never infer a repository-relative
		// locator by stripping an arbitrary prefix or trusting process.cwd().
		const mappedDocument = (): string => {
			if (options.document !== undefined) return artifactRelativePath(options.document);
			const filePath = file?.path;
			if (options.documentForFile !== undefined) {
				if (typeof filePath !== "string" || !filePath)
					throw new ThroughlineAuthoringError("THL_PATH", "a VFile path is required for documentForFile");
				let mapped: unknown;
				try {
					mapped = options.documentForFile(filePath);
				} catch {
					throw new ThroughlineAuthoringError("THL_PATH", "trusted document path mapping failed");
				}
				return artifactRelativePath(mapped as string);
			}
			if (typeof filePath !== "string" || !filePath)
				throw new ThroughlineAuthoringError("THL_PATH", "prose requires a repository-relative document or documentForFile");
			try {
				return artifactRelativePath(filePath);
			} catch (error) {
				if (error instanceof ThroughlineAuthoringError && error.code === "THL_PATH")
					throw new ThroughlineAuthoringError("THL_PATH", "absolute or unsafe VFile path; configure documentForFile with a trusted content-root mapping");
				throw error;
			}
		};
		const visit = (node: MarkdownNode, siblings?: readonly MarkdownNode[], index?: number): void => {
			if (node.type === "code" && node.lang === "thl") {
				const currentOrdinal = ordinal++;
				const point = validPoint(node.position?.start) ? node.position?.start : undefined;
				// An unsafe VFile path is never included verbatim in a diagnostic.
				let document: string | undefined;
				try {
					document = artifactRelativePath((options.document ?? file?.path) as string);
				} catch {
					// JSON fences need no document and must still validate offline.
				}
				const fail = (code: string, reason: string): never =>
					file.fail(
						code + ": thl #" + currentOrdinal + (document ? " in " + document : "") + ": " + reason,
						{ ...(point ? { place: point } : {}), source: "@0xbuff/throughline", ruleId: code },
					);
				if (node.meta !== null && node.meta !== undefined && node.meta.trim() !== "")
					fail("THL_SYNTAX", 'only an unqualified "thl" fence is supported (no domain tags or metadata)');
				if (typeof node.value !== "string")
					fail("THL_SYNTAX", "expected a thl body string");
				try {
					budget.body(node.value as string);
					// Validate/classify the source before touching a manifest or
					// mapping a document. Only a valid intent needs a sidecar.
					const parsed = parseThlBody(node.value as string);
					if (parsed.kind === "intent") {
						document = mappedDocument();
						if (!manifest && options.manifest && options.loadArtifact)
							manifest = validateSidecarManifest(options.manifest);
					}
					const artifact = resolveParsedThlBody(parsed, {
						...(document !== undefined ? { document } : {}),
						ordinal: currentOrdinal,
						...(manifest !== undefined ? { manifest } : {}),
						...(options.loadArtifact ? { loadArtifact: options.loadArtifact } : {}),
					});
					const json = serializeArtifact(artifact);
					budget.artifact(json);
					if (mode === "mdx") {
						if (!siblings || index === undefined)
							fail("THL_SYNTAX", "thl code node must have a Markdown parent");
						// mdxJsxAttribute with a plain string is inert data, never an
						// expression or an import generated from untrusted source.
						changes.push({
							siblings: siblings as readonly MarkdownNode[], index: index as number,
							node: {
								type: "mdxJsxFlowElement", name: componentName,
								attributes: [{
									type: "mdxJsxAttribute",
									name: "artifactJson",
									value: json,
								}],
								children: [],
								...(node.position ? { position: node.position } : {}),
							},
						});
					}
				} catch (error) {
					if (error instanceof ThroughlineAuthoringError)
						fail(error.code, error.message);
					if (error instanceof ArtifactValidationError)
						fail("THL_ARTIFACT", error.message);
					// Surface compilation's modeled-semantics errors, not arbitrary
					// thrown host code or loader secrets.
					if (error instanceof Error && error.name === "ArtifactCompilationError")
						fail("THL_COMPILATION", error.message);
					throw error;
				}
			}
		};
		const limit = (reason: string): never => file.fail("THL_LIMIT: " + reason,
			{ source: "@0xbuff/throughline", ruleId: "THL_LIMIT" });
		// Iterative depth-first traversal, with bounded pending storage. Count
		// all code nodes, not just thl, like the Node discovery path.
		const pending: { node: MarkdownNode; depth: number; siblings?: readonly MarkdownNode[]; index?: number }[] =
			[{ node: tree, depth: 0 }];
		let visited = 0, codeNodes = 0;
		while (pending.length) {
			const { node, depth, siblings, index } = pending.pop()!;
			if (++visited > AUTHORING_LIMITS.astNodes || depth > AUTHORING_LIMITS.astDepth)
				limit("Markdown/MDX AST exceeds work or depth budget");
			if (node.type === "code" && ++codeNodes > AUTHORING_LIMITS.codeNodes)
				limit("too many Markdown/MDX code nodes");
			visit(node, siblings, index);
			if (node.children) {
				if (visited + pending.length + node.children.length > AUTHORING_LIMITS.astNodes)
					limit("Markdown/MDX AST exceeds work budget");
				for (let i = node.children.length - 1; i >= 0; i--)
					pending.push({ node: node.children[i], depth: depth + 1, siblings: node.children, index: i });
			}
		}
		for (const { siblings, index, node } of changes)
			(siblings as MarkdownNode[])[index] = node;
	};
}
export default remarkThroughline;
