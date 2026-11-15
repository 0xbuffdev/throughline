import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "throughline-audit-"));

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) {
		throw new Error(
			[command, ...args].join(" ") +
				" failed:\n" +
				(result.stdout ?? "") +
				"\n" +
				(result.stderr ?? "") +
				(result.error ? "\n" + result.error.message : ""),
		);
	}
	return result.stdout;
}

try {
	const tarball = join(scratch, "throughline.tgz");
	run("pnpm", ["pack", "--out", tarball], root);
	const entries = run("tar", ["-tzf", tarball], root)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	for (const file of [
		"package/package.json",
		"package/README.md",
		"package/LICENSE",
		"package/COPYRIGHT.md",
		"package/CHANGELOG.md",
		"package/dist/index.js",
		"package/dist/index.d.ts",
		"package/dist/react/index.js",
		"package/dist/react/index.d.ts",
		"package/dist/remark/index.js",
		"package/dist/remark/index.d.ts",
		"package/dist/examples.js",
		"package/dist/examples.d.ts",
		"package/dist/node/index.js",
		"package/dist/node/index.d.ts",
		"package/dist/cli/main.js",
		"package/src/styles/throughline.css",
	]) {
		assert(entries.includes(file), "Missing packed file: " + file);
	}
	assert(
		!entries.some(
			(file) =>
				file.includes("/__tests__/") ||
				/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
				(file.startsWith("package/src/") &&
					!file.startsWith("package/src/styles/")),
		),
		"Tests or unapproved source were packed",
	);
	const packed = JSON.parse(
		run("tar", ["-xOf", tarball, "package/package.json"], root),
	);
	const copyrightText = run(
		"tar",
		["-xOf", tarball, "package/COPYRIGHT.md"],
		root,
	);
	assert.match(copyrightText, /Copyright 2026 0xBUFF/);
	assert.equal(packed.name, "@0xbuff/throughline");
	assert.equal(packed.version, manifest.version, "Packed version must match the source manifest");
	assert.equal(packed.private, false, "Packed package must not be private");
	assert.equal(packed.publishConfig?.access, "public", "Public scoped access required");
	assert.equal(packed.license, "Apache-2.0", "Packed metadata must include the approved license");
	assert.equal(packed.homepage, "https://docs.0xbuff.com/docs/throughline");
	assert(
		!packed.bundleDependencies && !packed.bundledDependencies,
		"Bundled dependencies require a separate third-party rights audit",
	);
	assert(
		!entries.some((entry) => entry.startsWith("package/node_modules/")),
		"Unexpected bundled dependency content in published archive",
	);
	assert(
		!entries.some((entry) => entry.startsWith("package/docs/")),
		"Development documentation should remain in the source repository",
	);
	assert.deepEqual(
		Object.keys(packed.exports).sort(),
		[".", "./react", "./remark", "./examples", "./node", "./styles/throughline.css"].sort(),
	);
	assert.equal(packed.bin?.thl, "./dist/cli/main.js");
	assert.deepEqual(Object.keys(packed.dependencies ?? {}), ["cn", "remark-mdx", "remark-parse", "unified"]);
	for (const dependencies of [
		packed.dependencies ?? {},
		packed.peerDependencies ?? {},
		packed.optionalDependencies ?? {},
	]) {
		for (const version of Object.values(dependencies)) {
			assert(
				!String(version).includes("workspace:") &&
					!String(version).includes("catalog:"),
				"An unresolved workspace/catalog dependency was packed",
			);
		}
	}

	const consumer = join(scratch, "consumer");
	mkdirSync(consumer);
	writeFileSync(
		join(consumer, "package.json"),
		JSON.stringify({ name: "throughline-consumer", private: true, type: "module" }),
	);
	const flags = [
		"--no-audit",
		"--no-fund",
		"--no-package-lock",
		"--ignore-scripts",
	];
	run(
		"npm",
		["install", ...flags, "--omit=peer", tarball, "typescript@5.9.3"],
		consumer,
	);
	assert(
		!existsSync(join(consumer, "node_modules", "react")) &&
			!existsSync(join(consumer, "node_modules", "unified")),
		"Core consumer unexpectedly installed React",
	);
	// Independently installed CLI/Node host: real archive, real bin, no
	// compulsory React/AI, no MDX execution and no self-approval.
	assert(existsSync(join(consumer, "node_modules", ".bin", "thl")),
		"Packed CLI binary link missing");
	const cliPath = join(consumer, "node_modules", "@0xbuff", "throughline", "dist", "cli", "main.js");
	const cli = (...args) => run("node", [cliPath, ...args], consumer);
	const fixtureRoot = join(consumer, "fixtures");
	mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
	mkdirSync(join(fixtureRoot, "artifacts"), { recursive: true });
	const counterJson = JSON.stringify({
		schemaVersion: 2, id: "packedCounter",
		origins: [{ id: "author", kind: "authored" }],
		entities: [{ id: "x", label: "Counter" }], relations: [],
		initialState: { x: { status: "known", value: 0 } },
		steps: [{ id: "increment", label: "Increment", events: [
			{ id: "w", originId: "author", type: "write",
				entityId: "x", path: [], value: { status: "known", value: 1 } },
		] }],
	});
	writeFileSync(join(fixtureRoot, "artifacts", "counter.json"), counterJson);
	const prompt = "Explain the counter with explicit writes.";
	writeFileSync(join(fixtureRoot, "docs", "sample.mdx"),
		"## Semantic model\n\n~~~thl\n" + counterJson + "\n~~~\n\n" +
		"~~~mermaid\ngraph TD\n~~~\n\n" + "~~~thl\n" + prompt + "\n~~~\n");
	assert.match(cli("validate", "artifacts/counter.json", "--root", fixtureRoot), /THL_OK validate/);
	const before = spawnSync("node", [cliPath, "check", "docs", "--root", fixtureRoot],
		{ cwd: consumer, encoding: "utf8" });
	assert.notEqual(before.status, 0);
	assert.match(before.stderr, /THL_UNRESOLVED.*thl #1/);
	assert.match(cli("materialize", "--root", fixtureRoot,
		"--document", "docs/sample.mdx", "--ordinal", "1",
		"--artifact", "artifacts/counter.json", "--manifest", "manifest.json"),
		/THL_UNREVIEWED materialize/);
	const unreviewed = spawnSync("node", [cliPath, "check", "docs",
		"--manifest", "manifest.json", "--root", fixtureRoot],
		{ cwd: consumer, encoding: "utf8" });
	assert.notEqual(unreviewed.status, 0);
	assert.match(unreviewed.stderr, /THL_UNREVIEWED/);
	const manifestLocation = join(fixtureRoot, "manifest.json");
	const generated = JSON.parse(readFileSync(manifestLocation, "utf8"));
	assert.equal(generated.entries.length, 1);
	assert.equal(generated.entries[0].ordinal, 1);
	assert.equal(generated.entries[0].review, "unreviewed");
	generated.entries[0].review = "reviewed"; // trusted test-only editorial step
	writeFileSync(manifestLocation, JSON.stringify(generated));
	assert.match(cli("check", ".", "--manifest", "manifest.json", "--root", fixtureRoot),
		/checked 1 document\(s\), 2 thl block\(s\)/);
	const pureHost = [
		'import assert from "node:assert/strict";',
		'import { createNodeThroughlineHost } from "@0xbuff/throughline/node";',
		'import { resolveThlBody } from "@0xbuff/throughline";',
		'const root = process.argv[1];',
		'const host = createNodeThroughlineHost({ root, manifestPath: "manifest.json" });',
		'const doc = host.documentForFile(root + "/docs/sample.mdx");',
		'assert.equal(doc, "docs/sample.mdx");',
		'assert.equal(resolveThlBody("Explain the counter with explicit writes.",',
		'  { document: doc, ordinal: 1, manifest: host.manifest, loadArtifact: host.loadArtifact }).id, "packedCounter");',
	].join("\n");
	run("node", ["--input-type=module", "-e", pureHost, fixtureRoot], consumer);
	assert(!existsSync(join(consumer, "node_modules", "react")) &&
		!!existsSync(join(consumer, "node_modules", "unified")) &&
		!!existsSync(join(consumer, "node_modules", "remark-mdx")),
		"CLI/Node host must not require React or a runtime Markdown executor");

	const core = [
		'import assert from "node:assert/strict";',
		'import * as publicCore from "@0xbuff/throughline";',
		'import { compileArtifact, inspectTrace, projectView, projectInspection, resolveThlBody } from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'assert(Array.isArray(EXAMPLES) && EXAMPLES.length === 4);',
		'assert(EXAMPLES.every(example => example.artifact.schemaVersion === 2 && example.questions.length >= 3));',
		'assert(compileArtifact(EXAMPLES[0].artifact).frames.length > 2);',
		'assert.equal("compile" in publicCore, false);',
		'assert.equal("SUPPORTED_DOMAINS" in publicCore, false);',
		'assert.throws(() => resolveThlBody("{bad"), /invalid JSON/);',
		'const artifact = { schemaVersion: 2, id: "counter", origins: [{ id: "author", kind: "authored" }], entities: [{ id: "counter", label: "Counter" }], relations: [], initialState: { counter: { status: "known", value: 0 } }, steps: [{ id: "increment", label: "Increment", events: [{ id: "write", originId: "author", type: "write", entityId: "counter", path: [], value: { status: "known", value: 1 } }] }] };',
		'const compiled = compileArtifact(artifact);',
		'assert.deepEqual(compiled.frames.map(frame => frame.id), ["@initial", "increment"]);',
		'assert.equal(compiled.frames[0].snapshot.values.counter.status, "known");',
		'assert.equal(compiled.frames[0].snapshot.values.counter.value, 0);',
		'assert.equal(compiled.frames[1].snapshot.values.counter.status, "known");',
		'assert.equal(compiled.frames[1].snapshot.values.counter.value, 1);',
		'const inspector = inspectTrace(compiled);',
		'assert.equal(inspector.valueAt(0, "counter").value, 0);',
		'assert.equal(inspector.valueAt(1, "counter").value, 1);',
		'assert.deepEqual(inspector.diff(0, 1).map(change => change.eventId), ["write"]);',
		'assert.deepEqual(inspector.history("counter").map(change => change.eventId), ["write"]);',
		'assert.equal(inspector.history("counter")[0].frameId, "increment");',
		'assert.equal(inspector.history("counter")[0].before.value, 0);',
		'assert.equal(inspector.history("counter")[0].after.value, 1);',
		'assert.equal(inspector.diff(0, 1)[0].frameId, "increment");',
		'assert.throws(() => inspector.diff(1, 0), /fromIndex <= toIndex/);',
		'const presenceSource = { ...artifact, steps: [{ id: "deactivate", label: "Deactivate", events: [{ id: "remove", type: "topology", originId: "author", target: "entity", targetId: "counter", present: false }] }] };',
		'const presence = inspectTrace(compileArtifact(presenceSource)).diff(0, 1)[0];',
		'assert.equal(presence.kind, "presence");',
		'assert.equal(presence.frameId, "deactivate");',
		'assert.equal(presence.before, true);',
		'assert.equal(presence.after, false);',
		'assert.deepEqual(inspector.dependenciesOf("write"), []);',
		'assert.equal(inspector.causalEvidenceOf("write").status, "unmodeled");',
		'const inspected = projectInspection(inspector, { frameIndex: 1, entityId: "counter", path: [] });',
		'assert.equal(inspected.chapter.frameId, "increment");',
		'assert.deepEqual(inspected.changes.map(change => change.eventId), ["write"]);',
		'assert.equal(inspected.selected.after.value, 1);',
		'assert.deepEqual(inspected.selected.history.map(entry => entry.eventId), ["write"]);',
		'assert.equal(inspected.focused, undefined);',
		'assert.equal(Object.isFrozen(inspected.state), true);',
		'assert.throws(() => projectInspection(inspector, { frameIndex: 0, eventId: "write" }), /future event evidence/);',
		'assert.throws(() => projectInspection({ ...inspector }, { frameIndex: 1 }), /untrusted trace inspector/);',
		'const graph = projectView(inspector, { kind: "graph", frameIndex: 1 });',
		'assert.equal(graph.kind, "graph");',
		'assert.equal(graph.frameId, "increment");',
		'assert.deepEqual(graph.items.filter(item => item.role === "entity").flatMap(item => item.source.entityIds ?? []), ["counter"]);',
		'assert.deepEqual(graph.items.filter(item => item.role === "event").flatMap(item => item.source.eventIds ?? []), ["write"]);',
		'assert.equal(Object.isFrozen(graph.items), true);',
		'const messages = { schemaVersion: 2, id: "network", origins: [{ id: "author", kind: "authored" }], entities: [{ id: "sender", label: "Sender" }, { id: "receiver", label: "Receiver" }], relations: [{ id: "wire", from: "sender", to: "receiver" }], initialState: { sender: { status: "known", value: 1 }, receiver: { status: "unknown", reason: "unmeasured" } }, steps: [{ id: "sendStep", label: "Send", events: [{ id: "sent", originId: "author", type: "message", relationId: "wire", messageId: "m", phase: "sent" }] }, { id: "ackStep", label: "Ack", events: [{ id: "ack", originId: "author", type: "message", relationId: "wire", messageId: "m", phase: "acknowledged" }] }] };',
		'const network = inspectTrace(compileArtifact(messages));',
		'const recordedSource = { ...artifact, steps: [{ id: "observeStep", label: "Observation only", events: [{ id: "observe", type: "observation", entityId: "counter", originId: "author", value: { status: "known", value: "sample" } }] }] };',
		'const observedInspect = projectInspection(inspectTrace(compileArtifact(recordedSource)), { frameIndex: 1, eventId: "observe" });',
		'assert.equal(observedInspect.focused.evidence.recorded.kind, "observation");',
		'assert.equal(observedInspect.focused.evidence.recorded.value.status, "known");',
		'assert.equal(observedInspect.focused.evidence.recorded.value.value, "sample");',
		'assert.equal(Object.getPrototypeOf(observedInspect.focused.evidence.recorded.value), null);',
		'assert.equal(observedInspect.state[0].after.value, 0);',
		'const withPayload = { ...messages, steps: [{ ...messages.steps[0], events: [{ ...messages.steps[0].events[0], payload: { note: "source evidence" } }] }, messages.steps[1]] };',
		'const payloadInspect = projectInspection(inspectTrace(compileArtifact(withPayload)), { frameIndex: 1, eventId: "sent" });',
		'assert.equal(payloadInspect.focused.evidence.recorded.kind, "message-payload");',
		'assert.equal(payloadInspect.focused.evidence.recorded.value.note, "source evidence");',
		'assert.equal(Object.getPrototypeOf(payloadInspect.focused.evidence.recorded.value), null);',
		'assert.equal(Object.isFrozen(payloadInspect.focused.evidence.recorded), true);',
		'const sequence = projectView(network, { kind: "sequence", frameIndex: 2 });',
		'assert.equal(sequence.kind, "sequence");',
		'assert.equal(sequence.frameId, "ackStep");',
		'assert.deepEqual(sequence.items.filter(item => item.role === "event").flatMap(item => item.source.eventIds ?? []), ["sent", "ack"]);',
		'const correlated = sequence.items.find(item => item.role === "value");',
		'assert.deepEqual(correlated.source.relationIds, ["wire"]);',
		'assert.deepEqual(correlated.data.phases, { sent: 1, received: 0, acknowledged: 1, processed: 0 });',
		'assert.equal(projectView(network, { frameIndex: 0 }).kind, "sequence");',
		'assert.equal(projectView(network, { kind: "graph", frameIndex: 2 }).kind, "graph");',
		'assert.equal(network.valueAt(2, "receiver").status, "unknown");',
		'assert.equal(Object.isFrozen(correlated.source.eventIds), true);',
		'assert.equal(projectView(inspector, { kind: "sequence", frameIndex: 1 }).kind, "state-table");',
		'assert.throws(() => projectView({ ...inspector }, { kind: "graph", frameIndex: 1 }), /untrusted trace inspector/);',
		'assert.throws(() => inspectTrace(JSON.parse(JSON.stringify(compiled))), /untrusted compiled trace/);',
		'assert.throws(() => compileArtifact({ schemaVersion: 2, frames: [] }), /required property|unexpected property/);',
	].join("\n");
	run("node", ["--input-type=module", "-e", core], consumer);

	writeFileSync(
		join(consumer, "index.ts"),
		[
			'import { compileArtifact, inspectTrace, projectView, projectInspection, type VisualArtifact, type CompiledTrace, type TraceInspector, type QueryCell, type StateChange, type HistoryEntry, type PresenceChange, type SemanticEvent, type ViewRequest, type ViewDescriptor, type ViewItem, type ViewKind, type InspectionRequest, type InspectionView, type InspectionRecorded } from "@0xbuff/throughline";',
			'import { EXAMPLES } from "@0xbuff/throughline/examples";',
			'const trace: CompiledTrace = compileArtifact(EXAMPLES[0]!.artifact);',
			'const frames: number = trace.frames.length;',
			'if (frames < 1) throw new Error("Missing trace frames");',
			'const model: VisualArtifact = { schemaVersion: 2, id: "counter", origins: [{ id: "author", kind: "authored" }], entities: [{ id: "counter", label: "Counter" }], relations: [], initialState: { counter: { status: "known", value: 0 } }, steps: [{ id: "increment", label: "Increment", events: [{ id: "write", type: "write", originId: "author", entityId: "counter", path: [], value: { status: "known", value: 1 } }] }] };',
			'const compiled: CompiledTrace = compileArtifact(model);',
			'if (compiled.frames[1]?.id !== "increment") throw new Error("Missing schema-2 frame");',
			'const inspector: TraceInspector = inspectTrace(compiled);',
			'const cell: QueryCell = inspector.valueAt(1, "counter");',
			'if (cell.status !== "known" || cell.value !== 1) throw new Error("Incorrect query state");',
			'const changes: readonly StateChange[] = inspector.diff(0, 1);',
			'const dependencies: readonly SemanticEvent[] = inspector.dependenciesOf("write");',
			'const inspectRequest: InspectionRequest = { frameIndex: 1, entityId: "counter", path: [] };',
			'const inspectView: InspectionView = projectInspection(inspector, inspectRequest);',
			'const typedRecorded: InspectionRecorded | undefined = inspectView.focused?.evidence.recorded;',
			'void typedRecorded;',
			'if (inspectView.selected?.after.status !== "known" || inspectView.selected.after.value !== 1) throw new Error("Incorrect typed Inspect");',
			'const request: ViewRequest = { kind: "graph", frameIndex: 1 };',
			'const view: ViewDescriptor = projectView(inspector, request);',
			'const node: ViewItem = view.items.find(item => item.role === "entity")!;',
			'if (node.source.entityIds?.[0] !== "counter" || view.frameId !== "increment") throw new Error("Incorrect view provenance");',
			'const sequenceModel: VisualArtifact = { schemaVersion: 2, id: "message", origins: [{ id: "author", kind: "authored" }], entities: [{ id: "sender", label: "Sender" }, { id: "receiver", label: "Receiver" }], relations: [{ id: "wire", from: "sender", to: "receiver" }], initialState: { sender: { status: "known", value: null }, receiver: { status: "unknown" } }, steps: [{ id: "send", label: "Send", events: [{ id: "event", originId: "author", type: "message", relationId: "wire", messageId: "m", phase: "sent" }] }] };',
			'const sequenceInspector: TraceInspector = inspectTrace(compileArtifact(sequenceModel));',
			'const sequenceRequest: ViewRequest = { kind: "sequence", frameIndex: 1, selectedEntityIds: ["sender"] };',
			'const sequenceView: ViewDescriptor = projectView(sequenceInspector, sequenceRequest);',
			'const kind: ViewKind = sequenceView.kind;',
			'if (kind !== "sequence" || sequenceView.items.find(item => item.role === "value")?.source.relationIds?.[0] !== "wire") throw new Error("Incorrect sequence contract");',
			'if (changes.length !== 1 || dependencies.length !== 0) throw new Error("Incorrect query evidence");',
			'const history: readonly HistoryEntry[] = inspector.history("counter");',
			'const frameId: string = history[0]!.frameId;',
			'if (frameId !== "increment") throw new Error("Missing authored frame identity");',
			'if (changes[0]!.kind !== "write" || changes[0]!.frameId !== frameId) throw new Error("Incorrect write contract");',
			'const presenceModel: VisualArtifact = { ...model, steps: [{ id: "removeStep", label: "Remove", events: [{ id: "remove", type: "topology", originId: "author", target: "entity", targetId: "counter", present: false }] }] };',
			'const presenceChange: StateChange = inspectTrace(compileArtifact(presenceModel)).diff(0, 1)[0]!;',
			'if (presenceChange.kind !== "presence") throw new Error("Expected normative presence change");',
			'const typedPresence: PresenceChange = presenceChange;',
			'const presentBefore: boolean = typedPresence.before;',
			'const presentAfter: boolean = typedPresence.after;',
			'if (!presentBefore || presentAfter || typedPresence.frameId !== "removeStep") throw new Error("Incorrect presence contract");',
		].join("\n"),
	);
	writeFileSync(
		join(consumer, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				module: "NodeNext",
				moduleResolution: "NodeNext",
				target: "ES2022",
				strict: true,
				noEmit: true,
				skipLibCheck: false,
			},
			include: ["index.ts"],
		}),
	);
	run("node", ["node_modules/typescript/bin/tsc", "-p", "."], consumer);

	// Copy the EXACT public user-guide quickstart into an independently packed
	// Node-only consumer. Typecheck it against the installed declarations, then
	// run the same syntax as ESM (the snippet intentionally needs no TS erasure).
	const guide = readFileSync(join(root, "docs", "user-guide.md"), "utf8");
	const snippet = guide.match(/For a \*\*standalone programmatic\*\* example[\s\S]*?~~~ts\n([\s\S]*?)\n~~~/)?.[1];
	assert(snippet, "Missing complete documented standalone programmatic quickstart");
	writeFileSync(join(consumer, "guide-quickstart.ts"), snippet + "\n");
	run("node", [
		"node_modules/typescript/bin/tsc", "--strict", "--noEmit", "--skipLibCheck",
		"--module", "NodeNext", "--moduleResolution", "NodeNext",
		"--target", "ES2022", "guide-quickstart.ts",
	], consumer);
	writeFileSync(join(consumer, "guide-quickstart.mjs"), snippet + "\n");
	assert.match(run("node", ["guide-quickstart.mjs"], consumer),
		/status: ['"]known['"], value: 24/,
		"Documented quickstart must execute through the packed schema-2 public exports");

	// Run an independent real Remark parser without React. The adapter itself
	// adds no runtime dependency to core or the published package.
	run("npm", ["install", ...flags, "--no-save", "unified@11.0.5", "remark-parse@11.0.0", "remark-stringify@11.0.0"], consumer);
	const remark = [
  "import assert from \"node:assert/strict\";",
  "import { relative, resolve, sep, isAbsolute } from \"node:path\";",
  "import { unified } from \"unified\";",
  "import remarkParse from \"remark-parse\";",
  "import remarkStringify from \"remark-stringify\";",
  "import { remarkThroughline } from \"@0xbuff/throughline/remark\";",
  "import { artifactSha256, parseArtifactJson, sha256Text } from \"@0xbuff/throughline\";",
  "const doc = \"{\\\"schemaVersion\\\":2,\\\"id\\\":\\\"host\\\",\\\"origins\\\":[{\\\"id\\\":\\\"author\\\",\\\"kind\\\":\\\"authored\\\"}],\\\"entities\\\":[{\\\"id\\\":\\\"x\\\",\\\"label\\\":\\\"X\\\"}],\\\"relations\\\":[],\\\"initialState\\\":{\\\"x\\\":{\\\"status\\\":\\\"known\\\",\\\"value\\\":0}},\\\"steps\\\":[{\\\"id\\\":\\\"advance\\\",\\\"label\\\":\\\"Advance\\\",\\\"events\\\":[{\\\"id\\\":\\\"w\\\",\\\"originId\\\":\\\"author\\\",\\\"type\\\":\\\"write\\\",\\\"entityId\\\":\\\"x\\\",\\\"path\\\":[],\\\"value\\\":{\\\"status\\\":\\\"known\\\",\\\"value\\\":1}}]}]}\";",
  "const proc = unified().use(remarkParse).use(remarkThroughline).use(remarkStringify);",
  "const md = [\"# Lesson\", \"\", \"~~~thl\", doc, \"~~~\", \"\", \"~~~js\", \"bad\", \"~~~\"].join(\"\\n\");",
  "const ast = proc.parse(md);",
  "const before = JSON.stringify(ast);",
  "proc.runSync(ast, { path: \"lesson.md\" });",
  "assert.equal(JSON.stringify(ast), before);",
  "assert.match(String(await proc.process(md)), /(?:```|~~~)js\\nbad/);",
  "await assert.rejects(() => proc.process({ path: \"broken.md\", value: \"~~~thl\\n{bad\\n~~~\" }), /THL_ARTIFACT/);",
  "await assert.rejects(() => proc.process({ path: \"tagged.md\", value: \"~~~thl flow\\n\"+doc+\"\\n~~~\" }), /THL_SYNTAX/);",
  "await assert.rejects(() => proc.process({ path: \"intent.md\", value: \"~~~thl\\nExplain this\\n~~~\" }), /THL_UNRESOLVED/);",
  "await assert.rejects(() => proc.process({ path: \"duplicate.md\", value: \"~~~thl\\n{\\\"schemaVersion\\\":2,\\\"schemaVersion\\\":2}\\n~~~\" }), /duplicate object key/);",
  "// Real Unified/VFile multi-document prose: identical text and ordinal, distinct approved artifacts.",
  "const prompt = \"Explain fixed state.\";",
  "const second = doc.replace('\"id\":\"host\"', '\"id\":\"host_two\"');",
  "const source = [\"# Demo\", \"\", \"~~~thl\", doc, \"~~~\", \"\", \"~~~js\", \"let unchanged = true\", \"~~~\", \"\", \"~~~thl\", prompt, \"~~~\"].join(\"\\n\");",
  "const aFile = { path: resolve(process.cwd(), \"content/docs/a.mdx\"), value: source };",
  "const bFile = { path: resolve(process.cwd(), \"content/docs/b.mdx\"), value: source };",
  "const manifest = { version: 1, entries: [",
  "  { document: \"content/docs/a.mdx\", ordinal: 1, intentSha256: sha256Text(prompt), artifactPath: \"artifacts/a.json\", artifactSha256: artifactSha256(parseArtifactJson(doc)), review: \"reviewed\" },",
  "  { document: \"content/docs/b.mdx\", ordinal: 1, intentSha256: sha256Text(prompt), artifactPath: \"artifacts/b.json\", artifactSha256: artifactSha256(parseArtifactJson(second)), review: \"reviewed\" },",
  "] };",
  "const mapDocument = (filePath) => {",
  "  const loc = relative(process.cwd(), filePath);",
  "  if (!loc || loc === \"..\" || loc.startsWith(\"..\" + sep) || isAbsolute(loc)) throw new Error(\"outside trusted content root\");",
  "  return loc.split(sep).join(\"/\");",
  "};",
  "const loadArtifact = (artifactPath) => {",
  "  if (artifactPath === \"artifacts/a.json\") return doc;",
  "  if (artifactPath === \"artifacts/b.json\") return second;",
  "  throw new Error(\"private unexpected path\");",
  "};",
  "const transform = unified().use(remarkParse).use(remarkThroughline, { mode: \"mdx\", documentForFile: mapDocument, manifest, loadArtifact });",
  "for (const [vfile, expected] of [[aFile, \"host\"], [bFile, \"host_two\"]]) {",
  "  const tree = transform.parse(vfile);",
  "  transform.runSync(tree, vfile);",
  "  const embeds = tree.children.filter(x => x.type === \"mdxJsxFlowElement\");",
  "  assert.equal(embeds.length, 2);",
  "  assert.equal(JSON.parse(embeds[1].attributes[0].value).id, expected);",
  "  assert.equal(tree.children.find(x => x.type === \"code\" && x.lang === \"js\")?.value, \"let unchanged = true\");",
  "}",
  "const unconfigured = unified().use(remarkParse).use(remarkThroughline, { manifest, loadArtifact });",
  "assert.throws(() => unconfigured.runSync(unconfigured.parse(aFile), aFile), (error) => {",
  "  assert.match(error.message, /THL_PATH.*documentForFile/);",
  "  assert(!error.message.includes(process.cwd()));",
  "  assert.equal(error.line, 11); return true;",
  "});",
  "const broken = unified().use(remarkParse).use(remarkThroughline, { manifest, documentForFile: mapDocument,",
  "  loadArtifact: () => { throw new Error(\"EACCES secret: /private/build/credential\"); } });",
  "assert.throws(() => broken.runSync(broken.parse(aFile), aFile), (error) => {",
  "  assert.equal(error.line, 11); assert.equal(error.ruleId, \"THL_LOADER\");",
  "  assert.match(error.message, /THL_LOADER.*thl #1 in content\\/docs\\/a.mdx/);",
  "  assert.doesNotMatch(error.message, /private\\/build|credential|EACCES/);",
  "  return true;",
  "});",
].join("\n");
		run("node", ["--input-type=module", "-e", remark], consumer);
	writeFileSync(join(consumer, "remark-typecheck.ts"), [
		'import { unified } from "unified";',
		'import remarkParse from "remark-parse";',
		'import { remarkThroughline } from "@0xbuff/throughline/remark";',
		'unified().use(remarkParse).use(remarkThroughline);',
	].join("\n"));
	run("node", ["node_modules/typescript/bin/tsc", "--strict", "--noEmit", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "remark-typecheck.ts"], consumer);
	assert(!existsSync(join(consumer, "node_modules", "react")), "Remark imported React");

	// Node-only verification is complete before installing the optional peer.
	// Pin direct fixture dependencies to the versions in pnpm-lock.yaml;
	// independent consumer regressions must be reproducible across CI runs.
	run(
		"npm",
		[
			"install", ...flags, "--no-save",
			"react@19.3.1", "react-dom@19.3.1", "@types/react@19.3.0",
			"@types/react-dom@19.3.0", "typescript@5.9.3", "@mdx-js/mdx@3.1.1",
		],
		consumer,
	);
	const ssr = [
		'import assert from "node:assert/strict";',
		'import { createElement } from "react";',
		'import { renderToString } from "react-dom/server";',
		'import { compileArtifact } from "@0xbuff/throughline";',
		'import { ThroughlineGraphPlayer } from "@0xbuff/throughline/react";',
		'import * as publishedReact from "@0xbuff/throughline/react";',
		'assert.deepEqual(Object.keys(publishedReact).sort(), ["ThroughlineEmbed", "ThroughlineGraphPlayer"].sort());',
		'const v2Model = { schemaVersion: 2, id: "ssr", origins: [{ id: "author", kind: "authored" }], entities: [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }], relations: [{ id: "link", from: "alpha", to: "beta" }], initialState: { alpha: { status: "known", value: 1 }, beta: { status: "unknown", reason: "unobserved" } }, steps: [{ id: "sendStep", label: "Send", events: [{ id: "send", type: "message", originId: "author", relationId: "link", messageId: "message", phase: "sent" }] }] };',
		'const v2 = compileArtifact(v2Model);',
		'const graphHtml = renderToString(createElement(ThroughlineGraphPlayer, { trace: v2, initialView: "graph" }));',
		'const autoHtml = renderToString(createElement(ThroughlineGraphPlayer, { trace: v2 }));',
		'assert.match(autoHtml, /Message sequence evidence/);',
		'const sequenceHtml = renderToString(createElement(ThroughlineGraphPlayer, { trace: v2, initialView: "sequence" }));',
		'assert.match(sequenceHtml, /Message sequence evidence/);',
		'assert.match(sequenceHtml, /No modeled events through this frame/);',
		'assert.doesNotMatch(sequenceHtml, /data-message-phase="received"/);',
		'assert.match(graphHtml, /Source-linked graph at current frame/);',
		'assert.match(graphHtml, /Explain or inspect/);',
		'assert.match(graphHtml, /aria-pressed="false"[^>]*>Inspect/);',
		'assert.match(graphHtml, /data-source-entity-ids="alpha"/);',
		'assert.match(graphHtml, /data-source-relation-ids="link"/);',
		'assert.match(graphHtml, /Step 1 of 2/);',
		'assert.doesNotMatch(graphHtml, /class="[^"]*thl-transferred/);',
		'assert.throws(() => renderToString(createElement(ThroughlineGraphPlayer, { trace: JSON.parse(JSON.stringify(v2)) })), /untrusted compiled trace/);',
	].join("\n");
	run("node", ["--input-type=module", "-e", ssr], consumer);
	writeFileSync(join(consumer, "embed-typecheck.ts"), [
		'import { ThroughlineEmbed, ThroughlineGraphPlayer, type ThroughlineEmbedProps, type ThroughlineGraphPlayerProps } from "@0xbuff/throughline/react";',
		'import { remarkThroughline, type ThroughlineRemarkOptions } from "@0xbuff/throughline/remark";',
		'const props: ThroughlineEmbedProps = { artifactJson: JSON.stringify({ schemaVersion: 2 }), theme: "dark" };',
		'const plugin: ThroughlineRemarkOptions = { mode: "mdx", componentName: "CustomTrace" };',
		'const model: ThroughlineGraphPlayerProps = { trace: { schemaVersion: 2, artifact: { schemaVersion: 2 } as never, frames: [] }, initialView: "sequence" };',
		'void [props, plugin, model, ThroughlineEmbed, ThroughlineGraphPlayer, remarkThroughline];',
	].join("\n"));
	run("node", ["node_modules/typescript/bin/tsc", "--strict", "--noEmit", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--jsx", "react-jsx", "embed-typecheck.ts"], consumer);

	// Compile real MDX and render through its host component map, including
	// source that resembles JSX/expression syntax but must remain inert data.
	const mdx = [
  "import assert from \"node:assert/strict\";",
  "import { createElement } from \"react\";",
  "import * as runtime from \"react/jsx-runtime\";",
  "import { renderToString } from \"react-dom/server\";",
  "import { compile as compileMdx, run as runMdx } from \"@mdx-js/mdx\";",
  "import { remarkThroughline } from \"@0xbuff/throughline/remark\";",
  "import { ThroughlineEmbed } from \"@0xbuff/throughline/react\";",
  "const model = {\"schemaVersion\":2,\"id\":\"host\",\"origins\":[{\"id\":\"author\",\"kind\":\"authored\"}],\"entities\":[{\"id\":\"x\",\"label\":\"X\"}],\"relations\":[],\"initialState\":{\"x\":{\"status\":\"known\",\"value\":0}},\"steps\":[{\"id\":\"advance\",\"label\":\"Advance\",\"events\":[{\"id\":\"w\",\"originId\":\"author\",\"type\":\"write\",\"entityId\":\"x\",\"path\":[],\"value\":{\"status\":\"known\",\"value\":1}}]}],\"title\":\"</script>{globalThis.__throughlineInjected=true}\"};",
  "const md = [\"# Example\", \"\", \"~~~thl\", JSON.stringify(model), \"~~~\", \"\", \"~~~js\", \"const other = 1\", \"~~~\"].join(\"\\n\");",
  "const mdxSource = String(await compileMdx(md, { remarkPlugins: [[remarkThroughline, { mode: \"mdx\" }]], outputFormat: \"function-body\" }));",
  "assert.equal(globalThis.__throughlineInjected, undefined);",
  "const { default: Content } = await runMdx(mdxSource, { ...runtime, baseUrl: import.meta.url });",
  "assert.throws(() => renderToString(createElement(Content, {})), /ThroughlineEmbed/);",
  "const html = renderToString(createElement(Content, { components: { ThroughlineEmbed } }));",
  "assert.match(html, /Visualization player/);",
  "assert.match(html, /const other = 1/);",
  "assert.doesNotMatch(html, /<script>/);",
  "assert.equal(globalThis.__throughlineInjected, undefined);",
  "const customSource = String(await compileMdx(md, { remarkPlugins: [[remarkThroughline, { mode: \"mdx\", componentName: \"CustomTrace\" }]], outputFormat: \"function-body\" }));",
  "const { default: CustomContent } = await runMdx(customSource, { ...runtime, baseUrl: import.meta.url });",
  "assert.match(renderToString(createElement(CustomContent, { components: { CustomTrace: ThroughlineEmbed } })), /Visualization player/);"
].join("\n");
		run("node", ["--input-type=module", "-e", mdx], consumer);
	console.log("Packed Throughline passed Node-only, TypeScript, React SSR and MDX host checks.");
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
