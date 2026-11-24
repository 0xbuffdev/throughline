import {
	validateSidecarManifest, type SidecarManifest,
} from "../v2/authoring.js";
import { parseStrictJsonData } from "../v2/validator.js";
import { TrustedContentRoot, TrustedFileError } from "./files.js";
import { scanMarkdownFences, type MarkdownFence, type MarkdownFormat } from "./markdown.js";

export { TrustedContentRoot, TrustedFileError, scanMarkdownFences };
export type { MarkdownFence, MarkdownFormat };

export type NodeHostOptions = Readonly<{
	/** Trusted repository/content root. All sidecar paths resolve within it. */
	root: string;
	/** Root-relative manifest path. Optional for inline-JSON-only projects. */
	manifestPath?: string;
}>;

/** Strict, never self-approving sidecar parsing. */
export function readSidecarManifest(
	root: TrustedContentRoot, relativePath: string,
): SidecarManifest {
	const source = root.read(relativePath);
	return validateSidecarManifest(parseStrictJsonData(source));
}

/**
 * Node-only Remark host boundary, suitable for Fumadocs/Next/Astro builds.
 * Trusted stable root, symlink rejection, no implicit AI/remote access or application-specific
 * source rewriting. The registered Remark plugin still does the actual
 * mdast validation and emits inert literal artifact JSON for MDX.
 */
export function createNodeThroughlineHost(options: NodeHostOptions) {
	const root = new TrustedContentRoot(options.root);
	const manifest = options.manifestPath === undefined
		? undefined
		: readSidecarManifest(root, options.manifestPath);
	return Object.freeze({
		...(manifest ? { manifest } : {}),
		documentForFile: (filePath: string) => root.relativeForFile(filePath),
		loadArtifact: (relativePath: string) => root.read(relativePath),
	});
}
