import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { EXAMPLES } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";
import { openPlayerPanel, seekFrame, stepCount } from "./player-actions.js";

it("keeps authored tree and column lane metadata through the React projection", async () => {
	const trace = compile([
		"```thl flow",
		'group "Tree" as tree',
		'group "Column" as column',
		'node root "Root" in "Tree" = 0',
		'node child "Child" in "Tree" = 1',
		'node top "Top" in "Column" = 2',
		'node bottom "Bottom" in "Column" = 3',
		'link branch root -> child',
		"```",
	].join("\n"));
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const lanes = () =>
		[...document.querySelectorAll(".thl-scene g[data-layout]")].map((group) => ({
			name: group.querySelector(".thl-group-label")?.textContent,
			layout: group.getAttribute("data-layout"),
		}));
	expect(lanes()).toEqual([
		{ name: "Tree", layout: "tree" },
		{ name: "Column", layout: "column" },
	]);
	const y = (id: string) => {
		const transform = document.querySelector(`[data-node="${id}"]`)?.getAttribute("transform");
		return Number(transform?.match(/translate\([^,]+,([^)]*)\)/)?.[1]);
	};
	expect(y("child")).toBeGreaterThan(y("root"));
	expect(y("bottom")).toBeGreaterThan(y("top"));
	await expect.element(screen.getByRole("img")).toBeVisible();
});

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
	await seekFrame(screen, compile(EXAMPLES[0].source).frames.length - 1);
	await screen.rerender(
		<ThroughlinePlayer trace={compile('```thl flow\nnode a "A" = 14\n```')} />,
	);
	await expect
		.element(screen.getByRole("status"))
		.toHaveTextContent("Step 1 of 1");
	await expect
		.element(screen.getByRole("button", { name: "Play", exact: true }))
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
		.poll(() => document.querySelector(".thl-scene")?.getAttribute("width"))
		.toBe("100%");
	await expect
		.poll(() =>
			Number(
				document.querySelector(".thl-scene")?.getAttribute("viewBox")?.split(" ")[2],
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
	).toBeGreaterThanOrEqual(12);
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
	await screen.getByText("Details", { exact: true }).click();
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
	await openPlayerPanel(screen, "Player options");
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
	await screen.getByRole("button", { name: "Play", exact: true }).click();
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
		await seekFrame(screen, trace.frames.length - 1);
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

it("renders the checkout receipt only after persistence and restores it when seeking back", async () => {
	const source = EXAMPLES.find(
		(example) => example.id === "distributed-checkout",
	)!.source;
	const trace = compile(source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const frameIndex = (label: string): number => {
		const index = trace.frames.findIndex((frame) => frame.label === label);
		expect(index).toBeGreaterThan(0);
		return index;
	};
	const received = frameIndex("Receive confirmed result");
	const persisted = frameIndex("Persist payment confirmation");
	const renderedReceipt = () =>
		document.querySelector('[data-node="receipt"] .thl-cell text')?.textContent;
	const receiptTitle = () =>
		document.querySelector('[data-node="receipt"] > title')?.textContent;

	await seekFrame(screen, received);
	await expect.poll(renderedReceipt).toBe("unconfirmed");
	await expect.poll(receiptTitle).toBe("Payment record: unconfirmed");
	expect(
		[...document.querySelectorAll(".thl-transferred title")].some((title) =>
			title.textContent?.includes("provider → worker"),
		),
	).toBe(true);

	await seekFrame(screen, persisted);
	await expect.poll(renderedReceipt).toBe("paid: pay-ord-1042");
	await expect.poll(receiptTitle).toBe("Payment record: paid: pay-ord-1042 (focus)");

	await seekFrame(screen, received);
	await expect.poll(renderedReceipt).toBe("unconfirmed");
	await expect.poll(receiptTitle).toBe("Payment record: unconfirmed");
});

it("renders only the current tree and commit plan after reconciliation commits", async () => {
	const source = EXAMPLES.find((example) => example.id === "reconciliation")!.source;
	const trace = compile(source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const reused = trace.frames.findIndex((frame) => frame.label === "Reuse key a");
	const committed = trace.frames.findIndex(
		(frame) => frame.label === "Commit the planned tree",
	);
	expect(reused).toBeGreaterThan(0);
	expect(committed).toBeGreaterThan(reused);
	expect(
		[...document.querySelectorAll(".thl-link title")].some((title) =>
			title.textContent?.includes("a → reuse"),
		),
	).toBe(false);
	await seekFrame(screen, reused);
	await expect.poll(() =>
		[...document.querySelectorAll(".thl-link title")].some((title) =>
			title.textContent?.includes("a → reuse"),
		),
	).toBe(true);
	await seekFrame(screen, committed);
	await expect.poll(() =>
		[...document.querySelectorAll("[data-node]")].map((node) =>
			node.getAttribute("data-node"),
		),
	).toEqual(["current", "a", "committedC", "changes"]);
	expect(
		[...document.querySelectorAll(".thl-link title")].map(
			(title) => title.textContent?.split(":")[0],
		),
	).toEqual(["current → a", "current → committedC"]);
});

it("keeps the reference player hierarchy, optional title, and one transport step count", async () => {
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(
		<ThroughlinePlayer
			trace={trace}
			title="React Reconciliation"
			theme="light"
		/>,
	);
	const player = document.querySelector(".thl") as HTMLElement;
	const heading = player.querySelector(".thl-title") as HTMLElement;
	const stage = player.querySelector(".thl-stage") as HTMLElement;
	const caption = player.querySelector(".thl-caption") as HTMLElement;
	const count = player.querySelector(".thl-step-count") as HTMLElement;
	const controls = player.querySelector(".thl-controls") as HTMLElement;

	expect(heading.textContent).toBe("React Reconciliation");
	expect(heading.getBoundingClientRect().top).toBeLessThan(
		stage.getBoundingClientRect().top,
	);
	expect(stage.getBoundingClientRect().top).toBeLessThan(
		caption.getBoundingClientRect().top,
	);
	expect(controls.getBoundingClientRect().bottom).toBeLessThanOrEqual(
		caption.getBoundingClientRect().top,
	);
	expect(stepCount(screen)?.textContent).toBe(`Step 1 of ${trace.frames.length}`);
	expect(controls.contains(count)).toBe(true);
	expect(player.querySelectorAll(".thl-step-count")).toHaveLength(1);
	expect(screen.getByRole("slider").query()).toBeNull();
	expect((caption as HTMLDetailsElement).open).toBe(false);
	expect(getComputedStyle(player).borderTopWidth).toBe("0px");
	expect(getComputedStyle(caption).borderTopWidth).toBe("0px");
	expect(getComputedStyle(player).borderTopLeftRadius).toBe("2px");
	expect(player.querySelector(".thl-count")).toBeNull();
	expect(controls.textContent).not.toMatch(/\\d+:\\d{2}/);

	await screen.rerender(<ThroughlinePlayer trace={trace} theme="light" />);
	expect(player.querySelector(".thl-title")).toBeNull();
	await openPlayerPanel(screen, "Player options");
	await expect
		.element(screen.getByRole("button", { name: "Maximize player" }))
		.toBeInTheDocument();
});

it("isolates neutral light/dark/auto tokens and permits host overrides", async () => {
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(<ThroughlinePlayer trace={trace} theme="light" />);
	const player = document.querySelector(".thl") as HTMLElement;
	const light = getComputedStyle(player).backgroundColor;
	expect(getComputedStyle(player).colorScheme).toBe("light");
	await screen.rerender(<ThroughlinePlayer trace={trace} theme="dark" />);
	const dark = getComputedStyle(player).backgroundColor;
	expect(dark).not.toBe(light);
	expect(getComputedStyle(player).colorScheme).toBe("dark");
	await screen.rerender(<ThroughlinePlayer trace={trace} theme="auto" />);
	expect(getComputedStyle(player).colorScheme).toBe("light dark");

	const style = document.createElement("style");
	style.textContent = ".thl.thl-custom-theme { --thl-bg: rgb(248, 247, 246); }";
	document.head.append(style);
	try {
		await screen.rerender(
			<ThroughlinePlayer trace={trace} theme="light" className="thl-custom-theme" />,
		);
		expect(getComputedStyle(player).backgroundColor).toBe(
			"rgb(248, 247, 246)",
		);
		expect(getComputedStyle(document.body).backgroundColor).not.toBe(
			"rgb(248, 247, 246)",
		);
	} finally {
		style.remove();
	}
});

it("enters and exits fullscreen with the real browser event contract", async () => {
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const player = document.querySelector(".thl") as HTMLElement;
	const keys = ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"] as const;
	const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(document, key)] as const);
	const previousRequest = Object.getOwnPropertyDescriptor(player, "requestFullscreen");
	let active: Element | null = null;
	const request = vi.fn(async () => {
		active = player;
		document.dispatchEvent(new Event("fullscreenchange"));
	});
	const exit = vi.fn(async () => {
		active = null;
		document.dispatchEvent(new Event("fullscreenchange"));
	});
	Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		get: () => active,
	});
	Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
	Object.defineProperty(player, "requestFullscreen", { configurable: true, value: request });

	try {
		document.dispatchEvent(new Event("fullscreenchange"));
		await openPlayerPanel(screen, "Player options");
		const maximize = screen.getByRole("button", { name: "Maximize player" });
		await expect.element(maximize).toBeEnabled();
		await maximize.click();
		expect(request).toHaveBeenCalledOnce();
		await openPlayerPanel(screen, "Player options");
		await expect
			.element(screen.getByRole("button", { name: "Minimize player" }))
			.toBeEnabled();
		await screen.getByRole("button", { name: "Minimize player" }).click();
		expect(exit).toHaveBeenCalledOnce();
		await openPlayerPanel(screen, "Player options");
		await expect
			.element(screen.getByRole("button", { name: "Maximize player" }))
			.toBeEnabled();

		active = player;
		document.dispatchEvent(new Event("fullscreenchange"));
		active = null;
		document.dispatchEvent(new Event("fullscreenchange"));
		await openPlayerPanel(screen, "Player options");
		await expect
			.element(screen.getByRole("button", { name: "Maximize player" }))
			.toBeEnabled();
	} finally {
		for (const [key, descriptor] of saved) {
			if (descriptor) Object.defineProperty(document, key, descriptor);
			else Reflect.deleteProperty(document, key);
		}
		if (previousRequest)
			Object.defineProperty(player, "requestFullscreen", previousRequest);
		else Reflect.deleteProperty(player, "requestFullscreen");
	}
});

it("disables fullscreen controls where the host forbids the API", async () => {
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const original = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
	try {
		Object.defineProperty(document, "fullscreenEnabled", {
			configurable: true,
			value: false,
		});
		document.dispatchEvent(new Event("fullscreenchange"));
		await openPlayerPanel(screen, "Player options");
		await expect
			.element(screen.getByRole("button", { name: "Maximize player" }))
			.toBeDisabled();
		await expect
			.element(screen.getByRole("button", { name: "Sonify trace" }))
			.not.toBeInTheDocument();
	} finally {
		if (original) Object.defineProperty(document, "fullscreenEnabled", original);
		else Reflect.deleteProperty(document, "fullscreenEnabled");
	}
});

it("keeps sound controllers alongside fullscreen at narrow widths", async () => {
	await page.viewport(375, 900);
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(
		<ThroughlinePlayer trace={trace} sonification={{ onTone: vi.fn() }} />,
	);
	const player = document.querySelector(".thl") as HTMLElement;
	await openPlayerPanel(screen, "Player options");
	const sound = screen.getByRole("button", { name: "Sonify trace" });
	await expect.element(sound).toHaveAttribute("aria-pressed", "false");
	await sound.click();
	await expect.element(sound).toHaveAttribute("aria-pressed", "true");
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
	expect(
		(player.querySelector(".thl-controls") as HTMLElement).scrollWidth,
	).toBeLessThanOrEqual(
		(player.querySelector(".thl-controls") as HTMLElement).clientWidth,
	);
	await expect
		.element(screen.getByRole("button", { name: "Maximize player" }))
		.toBeInTheDocument();
});

it("keeps observing the same scene stage across empty and populated trace transitions", async () => {
	const empty = { version: 1 as const, frames: [] };
	const populated = compile(EXAMPLES[0].source);
	const screen = await render(<ThroughlinePlayer trace={empty} />);
	const player = document.querySelector(".thl") as HTMLElement;
	const stage = player.querySelector(".thl-stage");
	const sceneWidth = (): number | undefined => {
		const viewBox = player.querySelector(".thl-scene")?.getAttribute("viewBox");
		return viewBox ? Number(viewBox.split(" ")[2]) : undefined;
	};

	expect(stage).not.toBeNull();
	expect(player.querySelector(".thl-scene")).toBeNull();
	expect(player.querySelector(".thl-empty")?.textContent).toBe(
		"No steps to display.",
	);

	player.style.width = "320px";
	await screen.rerender(<ThroughlinePlayer trace={populated} />);
	expect(player.querySelector(".thl-stage")).toBe(stage);
	await expect.poll(sceneWidth).toBeLessThan(320);

	player.style.width = "620px";
	await expect.poll(sceneWidth).toBeGreaterThan(500);

	await screen.rerender(<ThroughlinePlayer trace={empty} />);
	expect(player.querySelector(".thl-stage")).toBe(stage);
	expect(player.querySelector(".thl-scene")).toBeNull();

	player.style.width = "300px";
	await screen.rerender(<ThroughlinePlayer trace={populated} />);
	expect(player.querySelector(".thl-stage")).toBe(stage);
	await expect.poll(sceneWidth).toBeLessThan(300);
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
});

it("shows a decorative playback speed chevron without replacing the native select", async () => {
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const speed = screen.getByRole("combobox", { name: "Playback speed" });
	const chevron = document.querySelector(".thl-speed-chevron") as SVGElement;
	const wrapper = document.querySelector(".thl-speed-control") as HTMLElement;

	expect(wrapper.contains(speed.element())).toBe(true);
	expect(wrapper.contains(chevron)).toBe(true);
	expect(chevron.getAttribute("aria-hidden")).toBe("true");
	expect(getComputedStyle(chevron).pointerEvents).toBe("none");
	expect(getComputedStyle(chevron).position).toBe("absolute");
	expect(chevron.getBoundingClientRect().width).toBeGreaterThan(0);
	expect(chevron.getBoundingClientRect().right).toBeLessThanOrEqual(
		wrapper.getBoundingClientRect().right,
	);
	expect(getComputedStyle(speed.element()).appearance).toBe("none");

	await speed.selectOptions("2");
	await expect.element(speed).toHaveValue("2");
	await speed.selectOptions("0.5");
	await expect.element(speed).toHaveValue("0.5");
});

it("keeps keyboard shortcuts and validates keyboard step jumps", async () => {
	const { userEvent } = await import("vitest/browser");
	const trace = compile(
		'```thl flow\nnode n "Number" = 0\nstep "One"\n set n = 1\nstep "Two"\n set n = 2\n```',
	);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const player = screen.getByRole("group", { name: "Visualization player" }).element();
	expect(player.getAttribute("aria-keyshortcuts")).toBe(
		"ArrowLeft ArrowRight Home End Space",
	);
	expect(
		document.getElementById(player.getAttribute("aria-describedby")!)?.textContent,
	).toContain("Controls also work independently");

	player.focus();
	await userEvent.keyboard("{End}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
	await userEvent.keyboard("{Home}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	await userEvent.keyboard("{ArrowRight}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
	await userEvent.keyboard(" ");
	await expect.element(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
	await userEvent.keyboard(" ");
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeEnabled();

	const options = screen.getByRole("button", { name: "Player options" });
	options.element().focus();
	await userEvent.keyboard("{Enter}");
	const step = screen.getByRole("spinbutton", { name: "Step number" });
	await expect.element(step).toHaveValue(2);
	await step.fill("4");
	await userEvent.keyboard("{Enter}");
	await expect.element(step).toBeVisible();
	expect(stepCount(screen)?.textContent).toBe("Step 2 of 3");
	await step.fill("3");
	await userEvent.keyboard("{Enter}");
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
	expect(step.query()).toBeNull();
	expect(document.activeElement).toBe(options.element());
});

it("resets an in-flight playback interval and speed on unrelated trace replacement", async () => {
	const first = compile(
		'```thl flow\nnode a "A" = 0\nstep "One"\n set a = 1\nstep "Two"\n set a = 2\n```',
	);
	const second = compile(
		'```thl flow\nnode b "B" = 5\nstep "Changed"\n set b = 7\n```',
	);
	const screen = await render(<ThroughlinePlayer trace={first} />);
	await screen.getByRole("combobox", { name: "Playback speed" }).selectOptions("2");
	await screen.getByRole("button", { name: "Play", exact: true }).click();
	await expect.element(screen.getByRole("button", { name: "Pause" })).toBeEnabled();

	await screen.rerender(<ThroughlinePlayer trace={second} />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 2");
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await expect.element(screen.getByRole("combobox", { name: "Playback speed" })).toHaveValue("1");
	expect(stepCount(screen)?.textContent).toBe("Step 1 of 2");
	await screen.rerender(<ThroughlinePlayer trace={{ version: 1, frames: [] }} />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("No steps to display.");
	await screen.rerender(<ThroughlinePlayer trace={first} />);
	await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
	await expect.element(screen.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});

it("reports refused fullscreen requests without preventing further interaction", async () => {
	const trace = compile(EXAMPLES[0].source);
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	const player = document.querySelector(".thl") as HTMLElement;
	const keys = ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"] as const;
	const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(document, key)] as const);
	const oldRequest = Object.getOwnPropertyDescriptor(player, "requestFullscreen");
	const request = vi.fn(async () => {
		throw new DOMException("Permission denied", "NotAllowedError");
	});
	try {
		Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
		Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
		Object.defineProperty(document, "exitFullscreen", { configurable: true, value: vi.fn() });
		Object.defineProperty(player, "requestFullscreen", { configurable: true, value: request });
		document.dispatchEvent(new Event("fullscreenchange"));
		await openPlayerPanel(screen, "Player options");
		await screen.getByRole("button", { name: "Maximize player" }).click();
		expect(request).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole("alert")).toHaveTextContent(
			"Fullscreen is unavailable in this browser or embedded view.",
		);
		await screen.getByRole("button", { name: "Step forward" }).click();
		await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of");
	} finally {
		for (const [key, descriptor] of saved) {
			if (descriptor) Object.defineProperty(document, key, descriptor);
			else Reflect.deleteProperty(document, key);
		}
		if (oldRequest) Object.defineProperty(player, "requestFullscreen", oldRequest);
		else Reflect.deleteProperty(player, "requestFullscreen");
	}
});

it("keeps the transfer animation disabled in the reduced-motion stylesheet", async () => {
	await render(<ThroughlinePlayer trace={compile(EXAMPLES[0].source)} />);
	const reducedMotionAnimationNames: string[] = [];
	for (const sheet of document.styleSheets) {
		for (const rule of sheet.cssRules) {
			if (
				rule instanceof CSSMediaRule &&
				rule.conditionText.includes("prefers-reduced-motion: reduce")
			) {
				for (const nested of rule.cssRules) {
					if (nested instanceof CSSStyleRule && nested.selectorText === ".thl-transferred .thl-edge") {
						reducedMotionAnimationNames.push(nested.style.animationName);
					}
				}
			}
		}
	}
	expect(reducedMotionAnimationNames).toContain("none");
});
