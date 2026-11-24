import {
	artifactRelativePath, artifactSha256, parseIntentBlock, resolveThlBody,
	ThroughlineAuthoringError, validateSidecarManifest,
	type SidecarEntry, type SidecarManifest,
} from "../v2/authoring.js";
import { compileArtifact } from "../v2/compiler.js";
import { sha256Text } from "../v2/sha256.js";
import { ArtifactValidationError, parseArtifactJson } from "../v2/validator.js";
import { TrustedContentRoot, TrustedFileError } from "../node/files.js";
import { markdownFormat, scanMarkdownFences } from "../node/markdown.js";
import { DocumentAuthoringBudget } from "../v2/authoring-limits.js";
import { serializeArtifact } from "../v2/validator.js";
import { readSidecarManifest } from "../node/index.js";

type CliIO = Readonly<{ out: (line: string) => void; err: (line: string) => void }>;
const defaultIO: CliIO = { out: line => console.log(line), err: line => console.error(line) };

export class ThroughlineCliError extends Error {
	constructor(readonly code: string, message: string) {
		super(message);
		this.name = "ThroughlineCliError";
	}
}
function usage(message: string): never {
	throw new ThroughlineCliError("THL_USAGE", message);
}
const HELP = [
	"Throughline schema-2 CLI (offline, Node 24+)",
	"  thl validate artifact.json [--root ROOT]",
	"  thl materialize --document FILE --ordinal N --artifact FILE --manifest FILE [--root ROOT]",
	"  thl check FILE_OR_DIR [--manifest FILE] [--root ROOT]",
	"  thl help",
	"All paths except ROOT are repository-relative POSIX paths. ROOT defaults to cwd.",
	"Materialization always writes review=unreviewed; approve in a separate source review.",
].join("\n");

type Arguments = Readonly<{ positionals: readonly string[]; options: Readonly<Record<string, string>> }>;
function argumentsOf(values: readonly string[]): Arguments {
	const positionals: string[] = [];
	const options: Record<string, string> = Object.create(null) as Record<string, string>;
	for (let i = 0; i < values.length; i++) {
		const arg = values[i];
		if (!arg.startsWith("--")) { positionals.push(arg); continue; }
		if (!["--document", "--ordinal", "--artifact", "--manifest", "--root"].includes(arg))
			usage("unsupported option: " + arg);
		const field = arg.slice(2);
		if (Object.hasOwn(options, field)) usage("duplicate option: " + arg);
		if (i + 1 >= values.length || values[i + 1].startsWith("--"))
			usage("missing value for " + arg);
		options[field] = values[++i];
	}
	return { positionals, options };
}
function flag(options: Arguments, key: string): string {
	const value = options.options[key];
	if (value === undefined || value === "") usage("required option --" + key);
	return value;
}
function keysOnly(options: Arguments, allowed: string[]): void {
	for (const key of Object.keys(options.options))
		if (!allowed.includes(key)) usage("unsupported option for this command: --" + key);
}
function sourcePath(source: string): string {
	return artifactRelativePath(source);
}

function toDiagnostic(error: unknown): { code: string; message: string } {
	if (error instanceof ThroughlineCliError)
		return { code: error.code, message: error.message };
	if (error instanceof ThroughlineAuthoringError ||
		error instanceof TrustedFileError)
		return { code: error.code, message: error.message.replace(/^[A-Z_]+: /, "") };
	if (error instanceof ArtifactValidationError) {
		const message = error.message;
		let code: string;
		if (error.name === "ArtifactCompilationError") {
			code = /conflict|overlap|same.step/i.test(message)
				? "THL_ARTIFACT_CONFLICT" : "THL_ARTIFACT_COMPILATION";
		} else if (/duplicate object key|invalid JSON|at offset|unexpected trailing content/i.test(message)) {
			code = "THL_ARTIFACT_SYNTAX";
		} else if (/schemaVersion|unsupported artifact schema/i.test(message)) {
			code = "THL_ARTIFACT_VERSION";
		} else if (/limit|maximum|exceed|4 MiB|depth|too many|budget/i.test(message)) {
			code = "THL_ARTIFACT_LIMIT";
		} else if (/undeclared|reference|unknown.*id|missing.*id|dependsOn/i.test(message)) {
			code = "THL_ARTIFACT_REFERENCE";
		} else {
			code = "THL_ARTIFACT_SHAPE";
		}
		return { code, message };
	}
	return { code: "THL_INTERNAL", message: "unexpected host failure; no untrusted details disclosed" };
}
function format(error: unknown, location?: string): string {
	const issue = toDiagnostic(error);
	return issue.code + ": " + (location ? location + ": " : "") + issue.message;
}
function validateFile(root: TrustedContentRoot, file: string, io: CliIO): void {
	const relative = sourcePath(file);
	const artifact = compileArtifact(parseArtifactJson(root.read(relative))).artifact;
	io.out("THL_OK validate " + relative + " schema=2 id=" + artifact.id +
		" steps=" + artifact.steps.length + " sha256=" + artifactSha256(artifact));
}

function checkFile(
	root: TrustedContentRoot, relative: string,
	manifest: SidecarManifest | undefined, io: CliIO,
): number {
	const markdown = root.read(relative);
	const fences = scanMarkdownFences(markdown, { format: markdownFormat(relative) });
	let checked = 0;
	const budget = new DocumentAuthoringBudget();
	for (const fence of fences) {
		if (fence.lang !== "thl") continue;
		const location = relative + ":" + fence.line + ":" + fence.column +
			" thl #" + fence.ordinal;
		try {
			if (fence.meta !== null)
				throw new ThroughlineAuthoringError("THL_SYNTAX",
					"only an unqualified thl language fence is supported (no metadata or domain tags)");
			// Canonical source truth: the LF-normalized mdast code-node body
			// and a repository-relative, explicitly scoped document locator.
			budget.body(fence.body);
			const artifact = resolveThlBody(fence.body, {
				document: relative,
				ordinal: fence.ordinal!,
				...(manifest ? { manifest } : {}),
				...(manifest ? { loadArtifact: (artifact: string) => root.read(artifact) } : {}),
			});
			budget.artifact(serializeArtifact(artifact));
		} catch (error) {
			const issue = toDiagnostic(error);
			throw new ThroughlineCliError(issue.code, location + ": " + issue.message);
		}
		checked++;
		io.out("THL_OK check " + location);
	}
	return checked;
}
function checkTarget(root: TrustedContentRoot, args: Arguments, io: CliIO): void {
	keysOnly(args, ["manifest", "root"]);
	if (args.positionals.length !== 1)
		usage("check expects exactly one Markdown file or directory");
	const target = args.positionals[0];
	const manifest = args.options.manifest === undefined
		? undefined : readSidecarManifest(root, sourcePath(args.options.manifest));
	const paths = root.walkMarkdown(target);
	let checked = 0;
	for (const path of paths) checked += checkFile(root, path, manifest, io);
	io.out("THL_OK checked " + paths.length + " document(s), " + checked + " thl block(s)");
}
function materialize(root: TrustedContentRoot, args: Arguments, io: CliIO): void {
	keysOnly(args, ["document", "ordinal", "artifact", "manifest", "root"]);
	if (args.positionals.length !== 0)
		usage("materialize takes named arguments only");
	const document = sourcePath(flag(args, "document"));
	const artifactPath = sourcePath(flag(args, "artifact"));
	const manifestPath = sourcePath(flag(args, "manifest"));
	const ordinalRaw = flag(args, "ordinal");
	if (!/^(?:0|[1-9]\d*)$/.test(ordinalRaw) ||
		!Number.isSafeInteger(Number(ordinalRaw)))
		usage("--ordinal must be a zero-based safe integer");
	const ordinal = Number(ordinalRaw);
	const fences = scanMarkdownFences(root.read(document), { format: markdownFormat(document) });
	const fence = fences.find(f => f.lang === "thl" && f.ordinal === ordinal);
	if (!fence)
		throw new ThroughlineCliError("THL_UNRESOLVED",
			document + ": thl #" + ordinal + " does not exist");
	const location = document + ":" + fence.line + ":" + fence.column + " thl #" + ordinal;
	if (fence.meta !== null)
		throw new ThroughlineCliError("THL_SYNTAX", location + ": domain tags or metadata are unsupported");
	let body: string;
	try {
		body = parseIntentBlock(fence.body).body;
	} catch (error) {
		const issue = toDiagnostic(error);
		throw new ThroughlineCliError(issue.code, location + ": " + issue.message);
	}
	const artifact = compileArtifact(parseArtifactJson(root.read(artifactPath))).artifact;
	const entry: SidecarEntry = Object.freeze({
		document, ordinal, intentSha256: sha256Text(body),
		artifactPath, artifactSha256: artifactSha256(artifact),
		review: "unreviewed",
	});
	const prior: SidecarManifest = root.exists(manifestPath)
		? readSidecarManifest(root, manifestPath)
		: { version: 1, entries: [] };
	const entries = prior.entries.filter(row =>
		row.document !== document || row.ordinal !== ordinal);
	const ordered = [...entries, entry].sort((left, right) =>
		left.document < right.document ? -1 : left.document > right.document ? 1
			: left.ordinal - right.ordinal);
	const validated = validateSidecarManifest({ version: 1, entries: ordered });
	root.writeManifest(manifestPath, JSON.stringify(validated, null, 2) + "\n");
	io.out("THL_UNREVIEWED materialize " + location + " -> " + artifactPath +
		" (manifest " + manifestPath + "; requires separate editorial review)");
}

/**
 * Synchronous first-party Node CLI. External errors are converted to stable,
 * non-secret codes; no command approves materializations or calls providers.
 */
export function runCli(argv: readonly string[], io: CliIO = defaultIO): number {
	try {
		if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
			io.out(HELP);
			return argv.length === 0 ? 1 : 0;
		}
		const command = argv[0];
		if (!["validate", "materialize", "check"].includes(command))
			usage("unknown command: " + command);
		const args = argumentsOf(argv.slice(1));
		const root = new TrustedContentRoot(args.options.root ?? process.cwd());
		switch (command) {
			case "validate":
				keysOnly(args, ["root"]);
				if (args.positionals.length !== 1) usage("validate expects one artifact path");
				validateFile(root, args.positionals[0], io);
				break;
			case "materialize":
				materialize(root, args, io);
				break;
			case "check":
				checkTarget(root, args, io);
				break;
		}
		return 0;
	} catch (error) {
		io.err(format(error));
		return 1;
	}
}
