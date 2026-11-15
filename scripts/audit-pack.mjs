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
		[".", "./react", "./remark", "./examples", "./styles/throughline.css"].sort(),
	);
	assert.deepEqual(Object.keys(packed.dependencies ?? {}), ["cn"]);
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
	const core = [
		'import assert from "node:assert/strict";',
		'import { compile, ProgramError, compileArtifact, inspectTrace, projectView, projectInspection } from "@0xbuff/throughline";',
		'import { EXAMPLES } from "@0xbuff/throughline/examples";',
		'assert(Array.isArray(EXAMPLES) && EXAMPLES.length > 0);',
		'assert(compile(EXAMPLES[0].source).frames.length > 0);',
		'assert.throws(() => compile("not a thl block"), ProgramError);',
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
			'import { compile, compileArtifact, inspectTrace, projectView, projectInspection, type Trace, type VisualArtifact, type CompiledTrace, type TraceInspector, type QueryCell, type StateChange, type HistoryEntry, type PresenceChange, type SemanticEvent, type ViewRequest, type ViewDescriptor, type ViewItem, type ViewKind, type InspectionRequest, type InspectionView, type InspectionRecorded } from "@0xbuff/throughline";',
			'import { EXAMPLES } from "@0xbuff/throughline/examples";',
			'const trace: Trace = compile(EXAMPLES[0]!.source);',
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

	// Run an independent real Remark parser without React. The adapter itself
	// adds no runtime dependency to core or the published package.
	run("npm", ["install", ...flags, "--no-save", "unified@11.0.5", "remark-parse@11.0.0", "remark-stringify@11.0.0"], consumer);
	const remark = [
  "import assert from \"node:assert/strict\";",
  "import { unified } from \"unified\";",
  "import remarkParse from \"remark-parse\";",
  "import remarkStringify from \"remark-stringify\";",
  "import { remarkThroughline } from \"@0xbuff/throughline/remark\";",
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
  "await assert.rejects(() => proc.process({ path: \"duplicate.md\", value: \"~~~thl\\n{\\\"schemaVersion\\\":2,\\\"schemaVersion\\\":2}\\n~~~\" }), /duplicate object key/);"
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
		'import { compile, compileArtifact } from "@0xbuff/throughline";',
		'import { ThroughlinePlayer, ThroughlineGraphPlayer } from "@0xbuff/throughline/react";',
		'const fence = String.fromCharCode(96).repeat(3);',
		'const trace = compile([fence+"thl binary","a = 1","b = 1",fence].join(String.fromCharCode(10)));',
		'const html = renderToString(createElement(ThroughlinePlayer, { trace }));',
		'assert(html.includes("Visualization player"));',
		'assert.throws(() => renderToString(createElement(ThroughlinePlayer, { trace: { ...trace, version: 2 } })), /Expected trace version 1/);',
		'assert.throws(() => renderToString(createElement(ThroughlinePlayer, { trace: { ...trace, frames: null } })), /Expected trace version 1/);',
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
		'const props: ThroughlineEmbedProps = { artifactJson: "{\"schemaVersion\":2,\"id\":\"host\",\"origins\":[{\"id\":\"author\",\"kind\":\"authored\"}],\"entities\":[{\"id\":\"x\",\"label\":\"X\"}],\"relations\":[],\"initialState\":{\"x\":{\"status\":\"known\",\"value\":0}},\"steps\":[{\"id\":\"advance\",\"label\":\"Advance\",\"events\":[{\"id\":\"w\",\"originId\":\"author\",\"type\":\"write\",\"entityId\":\"x\",\"path\":[],\"value\":{\"status\":\"known\",\"value\":1}}]}]}", theme: "dark" };',
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
