import { useMemo, useState } from "react";
import { EXAMPLES } from "../src/examples.js";
import { compileArtifact } from "../src/index.js";
import { ThroughlineGraphPlayer } from "../src/react/index.js";
import type { ViewKind, VisualArtifact } from "../src/v2/model.js";
import { compileWorkbenchSource } from "./workbench.js";
import "./player-design.css";

type ReviewTheme = "auto" | "light" | "dark";
type FixtureVariant = "reference" | "long" | "untitled" | "invalid";
type ReviewView = "graph" | "sequence" | "state-table";

export const REVIEW_WIDTHS = [260, 320, 375, 768, 1280] as const;
export const REVIEW_STATES = ["initial", "middle", "final", "selected", "inspect", "invalid"] as const;
export const REVIEW_THEMES = ["light", "dark"] as const;

/**
 * Source-owned UX fixtures. No alternate compiler, invented events, arbitrary
 * code execution or fabricated "successful" result is introduced for design review.
 * Actual middle/final/selected/Inspect states are reached with the native player.
 */
export function makePlayerReviewFixture(id: string, variant: FixtureVariant): {
	artifact: VisualArtifact | null;
	title: string | undefined;
	invalidReason: string | null;
} {
	const reference = EXAMPLES.find(item => item.id === id);
	if (!reference) throw new Error("Unknown player design reference: " + id);
	if (variant === "invalid") {
		const rejected = compileWorkbenchSource(JSON.stringify({
			...reference.artifact, schemaVersion: 999,
		}));
		if (rejected.kind === "ready") throw new Error("Invalid review artifact unexpectedly compiled.");
		return {
			artifact: null,
			title: reference.title,
			invalidReason: "This fixture is intentionally invalid and was rejected by the real parser/compiler: " +
				rejected.message + " No replacement scene or inferred evidence is generated.",
		};
	}
	const source = reference.artifact;
	if (variant === "untitled") {
		const { title: _title, ...withoutTitle } = source;
		return { artifact: withoutTitle, title: undefined, invalidReason: null };
	}
	if (variant === "long") {
		return {
			artifact: {
				...source,
				entities: source.entities.map((entity, index) => index === 0
					? { ...entity, label: entity.label + " — a deliberately long source-backed entity label to expose truncation and narrow-embed issues" }
					: entity),
				steps: source.steps.map((step, index) => index === 0
					? { ...step, label: step.label + " — an unusually detailed step title", note: (step.note ?? "") +
						" This explanation contains several sentences to test wrapping, inspector reachability, and crowded transport controls at narrow container widths." }
					: step),
			},
			title: reference.title + " — long labels and explanations",
			invalidReason: null,
		};
	}
	return { artifact: source, title: reference.title, invalidReason: null };
}

const SECTIONS = [
	{
		key: "01",
		title: "Orientation",
		meta: "Optional compact title, view selection, Inspect",
		why: "The reader can immediately identify the artifact and change how its evidence is represented.",
	},
	{
		key: "02",
		title: "Visualization",
		meta: "Source-backed graph, sequence, or state table",
		why: "The modeled system is the central focus, not a frame of menus and cards.",
	},
	{
		key: "03",
		title: "Explanation",
		meta: "Current step title, concise note, one step count",
		why: "Meaning stays visible without forcing the reader to open a debugger.",
	},
	{
		key: "04",
		title: "Transport",
		meta: "Previous, play/pause, next, discrete seek",
		why: "The primary actions remain available at 260px; advanced controls move into secondary areas.",
	},
	{
		key: "05",
		title: "Evidence",
		meta: "Contextual source-linked Inspect",
		why: "Investigate values and uncertainty without permanently replacing the visualization.",
	},
] as const;

function ProposedAnatomy({ theme }: { theme: ReviewTheme }) {
	return (
		<div className="pdr-proposal" data-theme={theme} aria-label="Static proposed player anatomy">
			<div className="pdr-proposal-top">
				<div>
					<strong>Example title</strong>
					<span>Trace explanation</span>
				</div>
				<div className="pdr-proposal-actions">
					<span>Graph ▾</span>
					<span>Inspect</span>
				</div>
			</div>
			<div className="pdr-proposal-scene">
				<span className="pdr-region-id">02 · Visualization</span>
				<div className="pdr-proposal-placeholder">
					<div className="pdr-proposal-node">Source entity</div>
					<div className="pdr-proposal-connector" />
					<div className="pdr-proposal-node pdr-proposal-node-active">Source-backed change</div>
				</div>
				<span>Renderer content is designed and verified in TL-P03/P04.</span>
			</div>
			<div className="pdr-proposal-caption">
				<div><strong>Current modeled step</strong><span>Short explanation and a visible link to supporting evidence</span></div>
				<small>Step 1 of N</small>
			</div>
			<div className="pdr-proposal-transport" aria-hidden="true">
				<span className="pdr-proposal-btn">‹</span>
				<span className="pdr-proposal-btn pdr-proposal-play">▶</span>
				<span className="pdr-proposal-btn">›</span>
				<div className="pdr-proposal-track"><i /></div>
			</div>
			<div className="pdr-proposal-foot">05 · Inspect opens beside or below this scene; evidence is never synthesized.</div>
		</div>
	);
}

export function PlayerDesignLab() {
	const [referenceId, setReferenceId] = useState(EXAMPLES[0].id);
	const [variant, setVariant] = useState<FixtureVariant>("reference");
	const [theme, setTheme] = useState<ReviewTheme>("light");
	const [width, setWidth] = useState<number>(375);
	const [initialView, setInitialView] = useState<ReviewView>("graph");
	const [showAnatomy, setShowAnatomy] = useState(false);
	const fixture = useMemo(() => makePlayerReviewFixture(referenceId, variant), [referenceId, variant]);
	const trace = useMemo(() => fixture.artifact ? compileArtifact(fixture.artifact) : null, [fixture]);
	const frameCount = trace?.frames.length ?? 0;

	return (
		<div className="pdr-app" data-theme={theme}>
			<a className="pdr-skip" href="#player-review-preview">Skip to player review preview</a>
			<header className="pdr-site-header">
				<a href="./" aria-label="Back to Throughline authoring playground">Throughline <span>/ Playground</span></a>
				<nav aria-label="Playground pages">
					<a href="./">Authoring studio</a>
					<strong aria-current="page">Player design</strong>
				</nav>
			</header>
			<main className="pdr-main">
				<div className="pdr-intro">
					<div>
						<span className="pdr-kicker">TL-P01 · DESIGN SYSTEM REVIEW</span>
						<h1>Build the right player.</h1>
						<p>Compare today's native schema-2 player with the proposed compact layout. This review surface is not the redesigned production player; TL-P02–P04 implement the approved anatomy.</p>
					</div>
					<a className="pdr-spec-link" href="https://github.com/0xbuffdev/throughline/blob/main/docs/player-design-system.md" target="_blank" rel="noopener noreferrer">Player design guide ↗</a>
				</div>

				<div className="pdr-toolbar" role="group" aria-label="Player review settings">
					<label>Reference
						<select aria-label="Player review reference" value={referenceId} onChange={event => setReferenceId(event.currentTarget.value)}>
							{EXAMPLES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
						</select>
					</label>
					<label>Fixture
						<select aria-label="Player review fixture" value={variant} onChange={event => setVariant(event.currentTarget.value as FixtureVariant)}>
							<option value="reference">Validated reference</option>
							<option value="long">Long labels and explanation</option>
							<option value="untitled">No explicit title</option>
							<option value="invalid">Invalid / no player</option>
						</select>
					</label>
					<label>View
						<select aria-label="Player review initial view" value={initialView} onChange={event => setInitialView(event.currentTarget.value as ReviewView)}>
							<option value="graph">Graph</option>
							<option value="sequence">Sequence</option>
							<option value="state-table">State table</option>
						</select>
					</label>
					<label>Container
						<select aria-label="Player review width" value={width} onChange={event => setWidth(Number(event.currentTarget.value))}>
							{REVIEW_WIDTHS.map(value => <option key={value} value={value}>{value}px</option>)}
						</select>
					</label>
					<label>Theme
						<select aria-label="Player review theme" value={theme} onChange={event => setTheme(event.currentTarget.value as ReviewTheme)}>
							<option value="light">Light</option>
							<option value="dark">Dark</option>
							<option value="auto">System</option>
						</select>
					</label>
				</div>

				<section className="pdr-workspace" aria-label="Player design review">
					<div className="pdr-review-header">
						<div>
							<h2>Review surface</h2>
							<p>{showAnatomy ? "Static proposed composition. No transport or semantic scene is simulated." : "Real player using the selected compiled schema-2 artifact."}</p>
						</div>
						<div role="group" aria-label="Review surface type" className="pdr-switch">
							<button type="button" aria-pressed={!showAnatomy} onClick={() => setShowAnatomy(false)}>Live player</button>
							<button type="button" aria-pressed={showAnatomy} onClick={() => setShowAnatomy(true)}>Layout study</button>
						</div>
					</div>
					<div id="player-review-preview" className="pdr-stage" tabIndex={-1}>
						<div className="pdr-stage-label">
							<span>Container · {width} CSS px</span>
							<span>{showAnatomy ? "Proposed layout / static" : trace ? frameCount + " compiled frames" : "Validation rejected"}</span>
						</div>
						<div className="pdr-host" style={{ width }} data-review-width={width}>
							{showAnatomy ? (
								<ProposedAnatomy theme={theme} />
							) : trace ? (
								<ThroughlineGraphPlayer
									key={referenceId + ":" + variant + ":" + initialView}
									trace={trace}
									title={fixture.title}
									theme={theme}
									initialView={initialView as ViewKind}
								/>
							) : (
								<div className="pdr-rejected" role="status">
									<strong>Artifact not rendered</strong>
									<p>{fixture.invalidReason}</p>
									<p>Rejecting invalid input instead of drawing an imagined trace is required by PLR-001 and PLR-014.</p>
								</div>
							)}
						</div>
					</div>
					<div className="pdr-review-footer">
						<p><strong>Review procedure:</strong> use the native transport to reach the middle and final frames; select a node, switch Explain/Inspect, seek backward and verify that only explicit evidence appears. For narrow fixtures, inspect the player rather than the surrounding page width.</p>
						<p>The static layout study intentionally contains no interactive playback. Production player interaction changes belong to TL-P02.</p>
					</div>
				</section>

				<section className="pdr-bottom-grid" aria-label="Design principles and anatomy">
					<div className="pdr-panel">
						<h2>Five regions, one experience</h2>
						<ol className="pdr-anatomy-list">
							{SECTIONS.map(section => <li key={section.key}>
								<span className="pdr-number">{section.key}</span>
								<div><h3>{section.title}</h3><p>{section.meta}</p><small>{section.why}</small></div>
							</li>)}
						</ol>
					</div>
					<div className="pdr-panel">
						<h2>Player token study</h2>
						<p>Neutral, host-friendly surfaces. Semantic emphasis is reserved for known model facts, focus and selection.</p>
						<div className="pdr-swatches">
							{[
								["Canvas", "#fafafa"], ["Surface", "#ffffff"], ["Text", "#171717"],
								["Subtle", "#737373"], ["Evidence", "#0f766e"], ["Changed", "#b45309"],
							].map(([name, value]) => <div className="pdr-swatch" key={name}>
								<span style={{ background: value }} />
								<strong>{name}</strong><code>{value}</code>
							</div>)}
						</div>
						<div className="pdr-criteria">
							<h3>Review checkpoints</h3>
							<p>Readable at 260px · Single step counter · Discoverable Inspect · 40px primary targets · No global theme leakage · Explicit unknown values · Reduced motion</p>
						</div>
						<p className="pdr-footnote">These tokens are design proposals for the later player shell. They do not change the production renderer in TL-P01.</p>
					</div>
				</section>
			</main>
		</div>
	);
}
