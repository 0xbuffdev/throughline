import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EXAMPLES } from "../../src/examples.js";
import { ThroughlineGraphPlayer } from "../../src/react/index.js";
import {
	STARTER_SOURCE,
	compileWorkbenchSource,
	formatWorkbenchSource,
	markdownForSource,
	unwrapThlFence,
} from "./workbench.js";
import "../../src/styles/throughline.css";
import "./style.css";

type Theme = "auto" | "light" | "dark";
type Viewport = "wide" | "tablet" | "mobile";
type MobilePanel = "editor" | "preview";
type IconName = "arrow" | "book" | "check" | "chevron" | "code" | "copy" |
	"download" | "error" | "expand" | "file" | "plus" | "refresh" | "warning";

const REFERENCES = EXAMPLES.map(example => ({
	...example,
	source: JSON.stringify(example.artifact, null, 2),
}));

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
	return (
		<svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
			fill="none" stroke="currentColor" strokeWidth="1.7"
			strokeLinecap="round" strokeLinejoin="round">
			{name === "arrow" && <><path d="M5 12h14m-6-6 6 6-6 6" /></>}
			{name === "book" && <><path d="M12 7c-3.5-2-7-2-10-1v13c3-1 6.5-1 10 1 3.5-2 7-2 10-1V6c-3-1-6.5-1-10 1Z" /><path d="M12 7v13" /></>}
			{name === "check" && <><path d="m5 12 4 4L19 6" /></>}
			{name === "chevron" && <><path d="m7 10 5 5 5-5" /></>}
			{name === "code" && <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /></>}
			{name === "copy" && <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>}
			{name === "download" && <><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" /></>}
			{name === "error" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></>}
			{name === "expand" && <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></>}
			{name === "file" && <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M13 2v7h7M8 14h8m-8 4h6" /></>}
			{name === "plus" && <><path d="M12 5v14M5 12h14" /></>}
			{name === "refresh" && <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2" /></>}
			{name === "warning" && <><path d="m10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v5m0 3h.01" /></>}
		</svg>
	);
}

function BrandMark() {
	return (
		<svg className="brand-mark" aria-hidden="true" viewBox="0 0 40 40" fill="none">
			<rect x="1" y="1" width="38" height="38" rx="12" fill="#3561E9" />
			<path d="M10 26V14l10 6 10-6v12" stroke="white" strokeWidth="2.4"
				strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="10" cy="14" r="2.4" fill="#fff" />
			<circle cx="20" cy="20" r="2.4" fill="#fff" />
			<circle cx="30" cy="14" r="2.4" fill="#fff" />
		</svg>
	);
}

/** The highlight layer is presentation only. The textarea is the accessible editor. */
function highlightJson(source: string): ReactNode {
	if (source.length > 24_000) return source;
	const tokens: ReactNode[] = [];
	const pattern = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g;
	let previous = 0;
	let match: RegExpExecArray | null;
	let count = 0;
	while ((match = pattern.exec(source)) !== null) {
		if (match.index > previous) tokens.push(source.slice(previous, match.index));
		const value = match[0];
		let role = "punctuation";
		if (value.startsWith('"')) {
			role = /^\s*:/.test(source.slice(pattern.lastIndex, pattern.lastIndex + 64)) ? "key" : "string";
		} else if (/^(true|false|null)$/.test(value)) role = "boolean";
		else if (/^-?\d/.test(value)) role = "number";
		tokens.push(<span className={"syntax-" + role} key={count++}>{value}</span>);
		previous = pattern.lastIndex;
	}
	if (previous < source.length) tokens.push(source.slice(previous));
	return tokens;
}

function cursorLabel(value: string, index: number): string {
	const before = value.slice(0, index);
	const line = before.split("\n").length;
	return "Ln " + line + ", Col " + (before.length - before.lastIndexOf("\n"));
}

function downloadArtifact(id: string, json: string) {
	const blob = new Blob([json + "\n"], { type: "application/json;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = id + ".json";
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function App() {
	const [source, setSource] = useState(REFERENCES[0].source);
	const [compiledSource, setCompiledSource] = useState(REFERENCES[0].source);
	const [referenceChoice, setReferenceChoice] = useState(REFERENCES[0].id);
	const [loadedReferenceId, setLoadedReferenceId] = useState<string | null>(REFERENCES[0].id);
	const [loadedSource, setLoadedSource] = useState(REFERENCES[0].source);
	const [theme, setTheme] = useState<Theme>("auto");
	const [viewport, setViewport] = useState<Viewport>("wide");
	const [mobilePanel, setMobilePanel] = useState<MobilePanel>("editor");
	const [cursor, setCursor] = useState("Ln 1, Col 1");
	const [notice, setNotice] = useState("");
	const highlightRef = useRef<HTMLPreElement>(null);
	const editorRef = useRef<HTMLTextAreaElement>(null);

	// Compile only the settled edit, and never execute or fetch its contents.
	useEffect(() => {
		const timeout = window.setTimeout(() => setCompiledSource(source), 260);
		return () => window.clearTimeout(timeout);
	}, [source]);
	const result = useMemo(() => compileWorkbenchSource(compiledSource), [compiledSource]);
	const syntax = useMemo(() => highlightJson(source), [source]);
	const checking = source !== compiledSource;
	const ready = !checking && result.kind === "ready";
	const loadedReference = loadedReferenceId && source === loadedSource
		? REFERENCES.find(item => item.id === loadedReferenceId)
		: undefined;
	const modified = source !== loadedSource;
	const lineCount = source.split("\n").length;

	function edit(next: string) {
		setSource(next);
		setNotice("");
	}

	function replaceWith(next: string, referenceId: string | null) {
		if (modified && !window.confirm("Replace your current edits? Unsaved changes will be lost.")) return;
		setSource(next);
		setCompiledSource(next);
		setLoadedSource(next);
		setLoadedReferenceId(referenceId);
		setNotice("");
		setCursor("Ln 1, Col 1");
		if (editorRef.current) {
			editorRef.current.scrollTop = 0;
			editorRef.current.scrollLeft = 0;
		}
		if (highlightRef.current) {
			highlightRef.current.scrollTop = 0;
			highlightRef.current.scrollLeft = 0;
		}
	}

	function format() {
		const current = compileWorkbenchSource(source);
		const formatted = formatWorkbenchSource(current);
		if (formatted === null) {
			setNotice("Fix validation errors before formatting.");
			setCompiledSource(source);
			return;
		}
		edit(formatted);
		setCompiledSource(formatted);
		setNotice("Formatted schema-2 JSON.");
	}

	async function copySnippet() {
		const current = compileWorkbenchSource(source);
		if (current.kind !== "ready") {
			setNotice("Only validated artifacts can be copied as thl snippets.");
			setCompiledSource(source);
			return;
		}
		try {
			await navigator.clipboard.writeText(markdownForSource(formatWorkbenchSource(current)!));
			setNotice("Validated thl snippet copied.");
		} catch {
			setNotice("Clipboard access was denied. Select the editor text to copy it manually.");
		}
	}

	function download() {
		const current = compileWorkbenchSource(source);
		const json = formatWorkbenchSource(current);
		if (!json || current.kind !== "ready") {
			setNotice("Fix validation errors before exporting.");
			setCompiledSource(source);
			return;
		}
		downloadArtifact(current.trace.artifact.id, json);
		setNotice("Validated JSON exported.");
	}

	return (
		<div className="studio-app" data-theme={theme}>
			<a className="skip-link" href="#studio-editor">Skip to editor</a>
			<header className="site-header">
				<div className="header-inner">
					<a className="brand" href="/" aria-label="Throughline Playground home">
						<BrandMark />
						<span className="brand-name">Throughline</span>
						<span className="brand-divider" />
						<span className="brand-section">Playground</span>
					</a>
					<nav className="header-nav" aria-label="Resources">
						<a href="https://github.com/0xbuffdev/throughline/blob/main/docs/grammar.md"
							target="_blank" rel="noopener noreferrer">Authoring guide <Icon name="arrow" size={15} /></a>
						<a href="https://github.com/0xbuffdev/throughline"
							target="_blank" rel="noopener noreferrer">GitHub <Icon name="arrow" size={15} /></a>
					</nav>
				</div>
			</header>

			<main className="studio-shell">
				<section className="hero" aria-labelledby="page-heading">
					<div>
						<div className="eyebrow"><span className="eyebrow-dot" /> Interactive visualization studio</div>
						<h1 id="page-heading">Make state visible.</h1>
						<p>Author a trace, validate its semantics, and explore each change as a graph, sequence, or state table. Start with a reference or build your own.</p>
					</div>
					<div className="hero-aside">
						<div className="aside-icon"><Icon name="code" size={22} /></div>
						<div><strong>Built for clarity</strong><span>Schema 2 · Native player · Runs locally</span></div>
					</div>
				</section>

				<section className="studio-workspace" aria-label="Throughline authoring workspace">
					<div className="workspace-toolbar">
						<div className="toolbar-reference">
							<label htmlFor="reference-select">Start from a reference</label>
							<div className="reference-controls">
								<div className="select-wrap">
									<select id="reference-select" value={referenceChoice}
										onChange={event => setReferenceChoice(event.currentTarget.value)}>
										{REFERENCES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
									</select>
									<Icon name="chevron" size={16} />
								</div>
								<button className="button button-secondary" type="button"
									onClick={() => {
										const reference = REFERENCES.find(item => item.id === referenceChoice);
										if (reference) replaceWith(reference.source, reference.id);
									}}>Load example</button>
								<button className="button button-quiet new-button" type="button"
									onClick={() => replaceWith(STARTER_SOURCE, null)}>
									<Icon name="plus" size={16} /> New trace
								</button>
							</div>
						</div>
						<div className="toolbar-settings">
							<label htmlFor="theme-select">Appearance</label>
							<div className="select-wrap compact">
								<select id="theme-select" value={theme}
									onChange={event => setTheme(event.currentTarget.value as Theme)}>
									<option value="auto">System</option>
									<option value="light">Light</option>
									<option value="dark">Dark</option>
								</select>
								<Icon name="chevron" size={16} />
							</div>
						</div>
					</div>

					<div className="mobile-panel-tabs" role="group" aria-label="Workspace panel">
						<button type="button" aria-pressed={mobilePanel === "editor"}
							className={mobilePanel === "editor" ? "is-active" : ""}
							onClick={() => setMobilePanel("editor")}><Icon name="code" size={16} /> Editor</button>
						<button type="button" aria-pressed={mobilePanel === "preview"}
							className={mobilePanel === "preview" ? "is-active" : ""}
							onClick={() => setMobilePanel("preview")}><Icon name="expand" size={16} /> Preview</button>
					</div>

					<div className="workspace-grid" data-mobile-panel={mobilePanel}>
						<section className="workspace-panel editor-pane" id="studio-editor" aria-labelledby="editor-title">
							<div className="panel-header">
								<div className="panel-heading"><span className="panel-symbol"><Icon name="code" size={17} /></span>
									<div><h2 id="editor-title">Source editor</h2><p>Schema-2 artifact JSON</p></div>
								</div>
								<span className="file-label"><span className="file-dot" /> artifact.json</span>
							</div>
							<div className="editor-actions">
								<span className="editor-language">JSON <span className="language-divider">/</span> thl</span>
								<div className="editor-action-group">
									<button type="button" className="action-button" onClick={format}>Format</button>
									<button type="button" className="action-button" onClick={copySnippet}><Icon name="copy" size={15} /> Copy thl</button>
									<button type="button" className="action-button action-primary" onClick={download}><Icon name="download" size={15} /> Export</button>
								</div>
							</div>
							<div className="code-surface">
								<pre aria-hidden="true" className="code-highlight" ref={highlightRef}><code>{syntax}{"\n"}</code></pre>
								<textarea
									ref={editorRef}
									className="code-input"
									aria-label="Throughline schema-2 JSON"
									aria-describedby="editor-hint"
									autoCapitalize="off" autoComplete="off" autoCorrect="off"
									spellCheck={false}
									wrap="off"
									value={source}
									onChange={event => {
										edit(event.currentTarget.value);
										setCursor(cursorLabel(event.currentTarget.value, event.currentTarget.selectionStart));
									}}
									onClick={event => setCursor(cursorLabel(event.currentTarget.value, event.currentTarget.selectionStart))}
									onKeyUp={event => setCursor(cursorLabel(event.currentTarget.value, event.currentTarget.selectionStart))}
									onKeyDown={event => {
										if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
											event.preventDefault();
											setCompiledSource(source);
											setNotice("Source checked.");
										}
									}}
									onPaste={event => {
										const pasted = event.clipboardData.getData("text");
										const unwrapped = unwrapThlFence(pasted);
										if (unwrapped !== pasted) {
											event.preventDefault();
											if (modified && !window.confirm("Replace your current edits? Unsaved changes will be lost.")) return;
											// A complete fenced block is a whole document, not an inline fragment.
											edit(unwrapped);
											setCompiledSource(unwrapped);
											setLoadedReferenceId(null);
											setNotice("Pasted a thl fence as editable source.");
										}
									}}
									onScroll={event => {
										if (!highlightRef.current) return;
										highlightRef.current.scrollTop = event.currentTarget.scrollTop;
										highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
									}}
								/>
							</div>
							<div className="editor-footer">
								<span id="editor-hint">Edit JSON · Ctrl/⌘ + Enter to check</span>
								<span>{cursor} <span className="footer-divider">·</span> {lineCount} lines</span>
							</div>
							<div className="diagnostic-section">
								{checking ? (
									<div className="diagnostic diagnostic-checking" role="status"><span className="status-spinner" /> Checking changes…</div>
								) : result.kind === "ready" ? (
									<div className="diagnostic diagnostic-success" role="status">
										<Icon name="check" size={17} /><span><strong>Artifact valid</strong> — semantic validation and compilation passed.</span>
									</div>
								) : (
									<div className={"diagnostic " + (result.kind === "intent" ? "diagnostic-intent" : "diagnostic-error")} role="status">
										<Icon name={result.kind === "intent" ? "warning" : "error"} size={18} />
										<div><strong>{result.kind === "intent" ? "Review required for prose" : "Unable to compile"}</strong>
											{result.kind === "invalid" && (result.path || result.code) && <code className="diagnostic-path">{result.path ?? result.code}</code>}
											<p>{result.message}</p>
										</div>
									</div>
								)}
							</div>
						</section>

						<section className="workspace-panel preview-pane" aria-labelledby="preview-title">
							<div className="panel-header">
								<div className="panel-heading"><span className="panel-symbol preview-symbol"><Icon name="expand" size={17} /></span>
									<div><h2 id="preview-title">Live preview</h2><p>Explore what your artifact describes</p></div>
								</div>
								<span className={"preview-status " + (ready ? "is-ready" : "")}>
									<span className="preview-status-dot" />
									{checking ? "Updating" : result.kind === "ready" ? "Ready" : "Needs attention"}
								</span>
							</div>
							<div className="preview-toolbar">
								<div className="preview-metrics">
									{ready && result.kind === "ready" ? (
										<>
											<span><strong>{result.trace.artifact.entities.length}</strong> entities</span>
											<span><strong>{result.trace.artifact.steps.length}</strong> steps</span>
											<span><strong>{result.trace.artifact.steps.reduce((sum, step) => sum + step.events.length, 0)}</strong> events</span>
										</>
									) : <span>Schema 2 · Strict validation</span>}
								</div>
								<div className="select-wrap viewport-select">
									<label htmlFor="viewport-select" className="sr-only">Preview width</label>
									<select id="viewport-select" value={viewport}
										onChange={event => setViewport(event.currentTarget.value as Viewport)}>
										<option value="wide">Desktop</option>
										<option value="tablet">Tablet · 768px</option>
										<option value="mobile">Mobile · 375px</option>
									</select>
									<Icon name="chevron" size={15} />
								</div>
							</div>
							<div className="preview-stage" data-viewport={viewport}>
								{checking ? (
									<div className="preview-empty" role="status">Validating latest edit…</div>
								) : result.kind === "ready" ? (
									<div className="visualization-frame">
										<ThroughlineGraphPlayer
											key={result.trace.artifact.id}
											trace={result.trace}
											title={result.trace.artifact.id}
											theme={theme}
											narration
										/>
									</div>
								) : (
									<div className="preview-empty">
										<div className="empty-icon"><Icon name={result.kind === "intent" ? "book" : "code"} size={28} /></div>
										<h3>{result.kind === "intent" ? "Prose needs a reviewed artifact" : "Your visualization will appear here"}</h3>
										<p>{result.kind === "intent"
											? "Write schema-2 JSON for an instant preview. Prose needs an approved materialization and cannot be generated automatically."
											: "Update the JSON in the editor to resolve its validation errors. Only compiled facts are displayed."}</p>
										<button type="button" className="button button-secondary"
											onClick={() => { setMobilePanel("editor"); window.requestAnimationFrame(() => editorRef.current?.focus()); }}>Back to editor <Icon name="arrow" size={16} /></button>
									</div>
								)}
							</div>
							<div className="preview-foot">
								<Icon name="check" size={15} /> Only authored events and state are shown. Missing evidence is not inferred.
							</div>
						</section>
					</div>
					<div className="workspace-message" aria-live="polite">{notice}</div>
				</section>

				<section className="support-grid" aria-label="Authoring resources">
					<div className="support-card">
						<div className="support-heading"><Icon name="file" size={18} /><h2>{loadedReference ? "About this reference" : "Authoring essentials"}</h2></div>
						{loadedReference ? (
							<>
								<p>{loadedReference.description}</p>
								<details>
									<summary>Explanation, questions and evidence limits <Icon name="chevron" size={15} /></summary>
									<div className="support-detail">
										<p>{loadedReference.explanation}</p>
										<ol>{loadedReference.questions.map(question => (
											<li key={question.id}><strong>{question.question}</strong>
												<p>{question.expectedAnswer}</p>
												<small>Source evidence: {question.evidenceEventIds.join(", ")}</small>
											</li>
										))}</ol>
										<h3>Evidence limits</h3>
										<ul>{loadedReference.caveats.map(item => <li key={item}>{item}</li>)}</ul>
									</div>
								</details>
							</>
						) : (
							<>
								<p>Declare entities and initial state, then add steps with explicit writes, messages, topology changes or observations. The compiler checks every transition.</p>
								<a href="https://github.com/0xbuffdev/throughline/blob/main/docs/grammar.md"
									target="_blank" rel="noopener noreferrer">Read the schema-2 authoring guide <Icon name="arrow" size={16} /></a>
							</>
						)}
					</div>
					<div className="support-card support-card-soft">
						<div className="support-heading"><Icon name="book" size={18} /><h2>Understand the model</h2></div>
						<p>Throughline is evidence-aware, not a code runner. JSON compiles locally; descriptive prose requires separately reviewed materialization. You control what the artifact claims.</p>
						<a href="https://github.com/0xbuffdev/throughline/blob/main/docs/schema-v2.md"
							target="_blank" rel="noopener noreferrer">Explore the schema and semantics <Icon name="arrow" size={16} /></a>
					</div>
				</section>
			</main>
			<footer className="site-footer">
				<div><BrandMark /><span>Throughline</span><span className="footer-subtle">Readable state over time.</span></div>
				<a href="https://github.com/0xbuffdev/throughline" target="_blank" rel="noopener noreferrer">Open source on GitHub <Icon name="arrow" size={15} /></a>
			</footer>
		</div>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing playground root.");
createRoot(root).render(<StrictMode><App /></StrictMode>);
