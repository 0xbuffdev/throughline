import {
	resolveThlBody, ThroughlineAuthoringError, type MaterializationOptions,
} from "../v2/authoring.js";
import { ArtifactValidationError, serializeArtifact } from "../v2/validator.js";

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

export type ThroughlineRemarkOptions = Pick<MaterializationOptions, "document" | "manifest" | "loadArtifact"> & (
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
			"mode", "componentName", "document", "manifest", "loadArtifact",
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
		const changes: Array<{ siblings: readonly MarkdownNode[]; index: number; node: MarkdownNode }> = [];
		const document = options.document ?? file?.path;
		const visit = (node: MarkdownNode, siblings?: readonly MarkdownNode[], index?: number): void => {
			if (node.type === "code" && node.lang === "thl") {
				const currentOrdinal = ordinal++;
				const point = validPoint(node.position?.start) ? node.position?.start : undefined;
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
					const artifact = resolveThlBody(node.value as string, {
						...(document !== undefined ? { document } : {}),
						ordinal: currentOrdinal,
						...(options.manifest !== undefined ? { manifest: options.manifest } : {}),
						...(options.loadArtifact ? { loadArtifact: options.loadArtifact } : {}),
					});
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
									value: serializeArtifact(artifact),
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
			for (const [childIndex, child] of (node.children ?? []).entries())
				visit(child, node.children, childIndex);
		};
		visit(tree);
		for (const { siblings, index, node } of changes)
			(siblings as MarkdownNode[])[index] = node;
	};
}
export default remarkThroughline;
