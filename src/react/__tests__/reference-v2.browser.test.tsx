import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { EXAMPLES } from "../../examples.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

it.each(EXAMPLES)("renders $title with the same native schema-2 player and exact frame count", async example => {
	const trace = compileArtifact(example.artifact);
	const screen = await render(
		<ThroughlineGraphPlayer
			key={example.id}
			trace={trace}
			title={example.title}
			narration={false}
		/>,
	);
	await expect.element(screen.getByRole("group", { name: "Visualization player" })).toBeVisible();
	await expect.element(screen.getByRole("heading", { name: example.title })).toBeVisible();
	await expect.element(screen.getByRole("status"))
		.toHaveTextContent("Step 1 of " + trace.frames.length);
	const forward = screen.getByRole("button", { name: "Step forward" });
	await forward.click();
	await expect.element(screen.getByRole("status"))
		.toHaveTextContent("Step 2 of " + trace.frames.length);
	expect(trace.frames[1]?.eventIds)
		.toEqual(example.artifact.steps[0].events.map(event => event.id));
});

it("does not present absent receipt evidence as a checkout acknowledgement", async () => {
	const example = EXAMPLES.find(item => item.id === "checkout")!;
	const screen = await render(
		<ThroughlineGraphPlayer trace={compileArtifact(example.artifact)} initialView="sequence" />,
	);
	await expect.element(screen.getByRole("status"))
		.toHaveTextContent("Step 1 of " + (example.artifact.steps.length + 1));
	// Source-derived sequences are visible; unanswered phases must remain
	// transparent rather than being synthesized into receipt or persistence.
	await expect.element(screen.getByRole("region", { name: /sequence/i })).toBeVisible();
	expect(example.artifact.steps
		.flatMap(step => step.events)
		.filter(event => event.type === "message" && event.phase === "acknowledged"))
		.toHaveLength(0);
});
