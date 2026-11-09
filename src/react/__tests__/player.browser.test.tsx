import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { EXAMPLES } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

it("steps references truthfully and announces the current state", async () => {
	const trace = compile(
		"```thl bindings\nlet a = [1,2]\nlet b = a\nb = [7]\n```",
	);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const titles = (): string[] =>
		[...document.querySelectorAll("svg title")].map(
			(title) => title.textContent ?? "",
		);
	const next = screen.getByRole("button", { name: "Step forward" });
	expect(titles()).not.toContain("a → o1: ref");
	await next.click();
	expect(titles()).toContain("a → o1: ref");
	await next.click();
	expect(titles()).toContain("b → o1: ref");
	await next.click();
	expect(titles()).not.toContain("b → o1: ref");
	expect(titles()).toContain("b → o2: ref");
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 4 of 4");
	await screen.getByRole("button", { name: "Step back" }).click();
	expect(titles()).toContain("b → o1: ref");
});

it("resets safely when replacing a trace with fewer frames", async () => {
	const screen = await render(
		<ThroughlinePlayer trace={compile(EXAMPLES[0].source)} />,
	);
	const timeline = screen.getByRole("slider", { name: "Timeline" });
	await timeline.fill(String(compile(EXAMPLES[0].source).frames.length - 1));
	await screen.rerender(
		<ThroughlinePlayer trace={compile('```thl flow\nnode a "A" = 14\n```')} />,
	);
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 1 of 1");
	await expect
		.element(screen.getByRole("button", { name: "Play" }))
		.toBeDisabled();
	await screen.rerender(
		<ThroughlinePlayer trace={{ version: 1, frames: [] }} />,
	);
	await expect
		.element(
			screen.getByRole("paragraph").filter({ hasText: "No steps to display." }),
		)
		.toBeVisible();
});

it("fits a phone without shrinking text or overflowing its controls", async () => {
	await page.viewport(375, 900);
	const screen = await render(
		<ThroughlinePlayer trace={compile(EXAMPLES[0].source)} />,
	);
	await expect
		.poll(() => document.querySelector("svg")?.getAttribute("width"))
		.toBe("100%");
	await expect
		.poll(() =>
			Number(
				document.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2],
			),
		)
		.toBeLessThan(375);
	const player = document.querySelector(".thl")!;
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
	expect(player.getBoundingClientRect().width).toBeLessThanOrEqual(
		player.parentElement!.clientWidth,
	);
	const text = document.querySelector(".thl-cell text")!;
	expect(
		Number.parseFloat(getComputedStyle(text).fontSize),
	).toBeGreaterThanOrEqual(13);
	await expect
		.element(screen.getByRole("button", { name: "Step forward" }))
		.toBeVisible();
});

it("exposes full values for inspection and keeps ordinary numbers readable", async () => {
	const screen = await render(
		<ThroughlinePlayer
			trace={compile(
				'```thl flow\nnode a "Accumulator" = 14\nnode list "List" = [0,1,2,3,4,5,6,7,8,9,10,11,12,13]\n```',
			)}
		/>,
	);
	expect(
		document.querySelector('[data-node="a"] .thl-cell text')?.textContent,
	).toBe("14");
	await screen.getByText("Inspect state").click();
	await expect
		.element(
			screen.getByText("[0,1,2,3,4,5,6,7,8,9,10,11,12,13]", { exact: true }),
		)
		.toBeVisible();
});

it("marks changed bits individually", async () => {
	const trace = compile(
		'```thl flow\nnode flags "Flags" as bits = 8\nstep "Set low bit"\n set flags = 9\n```',
	);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(
		document.querySelectorAll('[data-node="flags"] .thl-changed'),
	).toHaveLength(1);
});

it("keeps keyboard stepping on the player surface and audio explicitly optional", async () => {
	const { userEvent } = await import("vitest/browser");
	const { vi } = await import("vitest");
	const trace = compile(
		'```thl flow\nnode n "Number" = 0\nstep "One"\n set n = 1\nstep "Two"\n set n = 2\n```',
	);
	const onTone = vi.fn();
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await expect
		.element(screen.getByRole("button", { name: "Sonify trace" }))
		.not.toBeInTheDocument();
	await screen.rerender(
		<ThroughlinePlayer trace={trace} sonification={{ onTone }} />,
	);
	expect(onTone).not.toHaveBeenCalled();
	await screen.getByRole("button", { name: "Sonify trace" }).click();
	expect(onTone).toHaveBeenCalledTimes(1);
	screen.getByRole("group", { name: "Visualization player" }).element().focus();
	await userEvent.keyboard("{ArrowRight}");
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 2 of 3");
	expect(onTone).toHaveBeenCalledTimes(2);
	await userEvent.keyboard("{End}");
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 3 of 3");
	await screen.getByRole("button", { name: "Play" }).click();
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 1 of 3");
	await screen.getByRole("button", { name: "Pause" }).click();
});

it.each(["reconciliation", "distributed-checkout"] as const)(
	"renders %s and seeks its final state in the React player",
	async (id) => {
		const example = EXAMPLES.find((candidate) => candidate.id === id)!;
		const trace = compile(example.source);
		const screen = await render(<ThroughlinePlayer trace={trace} />);
		const timeline = screen.getByRole("slider", { name: "Timeline" });
		await timeline.fill(String(trace.frames.length - 1));
		await expect
			.element(screen.getByRole("status"))
			.toHaveTextContent(`Step ${trace.frames.length} of ${trace.frames.length}`);
		expect(document.querySelectorAll(".thl-cell").length).toBeGreaterThan(0);
		await screen.getByRole("button", { name: "Step back" }).click();
		await expect
			.element(screen.getByRole("status"))
			.toHaveTextContent(`Step ${trace.frames.length - 1} of ${trace.frames.length}`);
	},
);

it("renders the confirmed checkout transfer without inventing persistence", async () => {
	const source = EXAMPLES.find((example) => example.id === "distributed-checkout")!.source;
	const trace = compile(source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const received = trace.frames.findIndex(
		(frame) => frame.label === "Receive confirmed result",
	);
	expect(received).toBeGreaterThan(0);
	await screen.getByRole("slider", { name: "Timeline" }).fill(String(received));
	expect(
		[...document.querySelectorAll(".thl-transferred title")].some((title) =>
			title.textContent?.includes("provider → worker"),
		),
	).toBe(true);
	expect(
		trace.frames[received]!.state.entities.find((entity) => entity.id === "receipt")
			?.value,
	).toBe("unconfirmed");
});
