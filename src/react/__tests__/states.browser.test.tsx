import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compile } from "../../domains/registry.js";
import { EXAMPLES } from "../../examples.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

const checkout = compile(EXAMPLES.find((example) => example.id === "distributed-checkout")!.source);
const sendAt = checkout.frames.findIndex((frame) => frame.label === "Send first charge request");
const changedAt = checkout.frames.findIndex((frame, index) => index > 1 && frame.state.changed.length > 0);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const chargeLink = () =>
	[...document.querySelectorAll<SVGGElement>(".thl-link")].find((element) =>
		element.querySelector("title")?.textContent?.trim().startsWith("worker → provider"),
	)!;
const edgeAnimation = () => getComputedStyle(chargeLink().querySelector(".thl-edge")!).animationName;

it("animates a send only when it is reached by one forward step", async () => {
	expect(sendAt).toBeGreaterThan(1);
	const screen = await render(<ThroughlinePlayer trace={checkout} />);
	const timeline = screen.getByRole("slider", { name: "Timeline" });

	// A jump straight onto the send frame settles without animating.
	await timeline.fill(String(sendAt));
	expect(chargeLink().classList.contains("thl-transferred")).toBe(true);
	expect(chargeLink().classList.contains("thl-animate")).toBe(false);
	expect(edgeAnimation()).toBe("none");

	// Even an adjacent timeline seek is a seek, not explicit Step forward.
	await timeline.fill(String(sendAt - 1));
	await timeline.fill(String(sendAt));
	expect(chargeLink().classList.contains("thl-animate")).toBe(false);
	expect(edgeAnimation()).toBe("none");

	// Stepping forward onto it animates the same connector path.
	await timeline.fill(String(sendAt - 1));
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(chargeLink().classList.contains("thl-animate")).toBe(true);
	expect(chargeLink().querySelectorAll("path")).toHaveLength(1);
	// Animates normally; under reduced motion the same step settles at once.
	expect(edgeAnimation()).toBe(reduced() ? "none" : "thl-draw");

	// An unrelated re-render keeps the same step's animation latched.
	const path = chargeLink().querySelector(".thl-edge");
	await page.viewport(400, 800);
	await page.viewport(420, 800);
	expect(chargeLink().querySelector(".thl-edge")).toBe(path);
	expect(chargeLink().classList.contains("thl-animate")).toBe(true);

	// Rewinding onto a send frame does not replay it.
	await timeline.fill(String(sendAt + 1));
	await screen.getByRole("button", { name: "Step back" }).click();
	expect(chargeLink().classList.contains("thl-transferred")).toBe(true);
	expect(chargeLink().classList.contains("thl-animate")).toBe(false);
	expect(edgeAnimation()).toBe("none");
});

it("paints the link carrying the current send above every other link", async () => {
	const screen = await render(<ThroughlinePlayer trace={checkout} />);
	await screen.getByRole("slider", { name: "Timeline" }).fill(String(sendAt));
	const links = [...document.querySelectorAll(".thl-link")];
	expect(links.at(-1)).toBe(chargeLink());
	expect(links.filter((link) => link.classList.contains("thl-transferred")).at(0)).toBe(links.at(-1));
});

it("flashes a changed value only for a forward single step", async () => {
	expect(changedAt).toBeGreaterThan(1);
	const screen = await render(<ThroughlinePlayer trace={checkout} />);
	const timeline = screen.getByRole("slider", { name: "Timeline" });
	await timeline.fill("0");
	await timeline.fill(String(changedAt));
	expect(document.querySelector(".thl-cell.thl-changed")).not.toBeNull();
	expect(document.querySelector(".thl-cell.thl-animate")).toBeNull();

	await timeline.fill(String(changedAt - 1));
	await screen.getByRole("button", { name: "Step forward" }).click();
	expect(document.querySelector(".thl-cell.thl-changed.thl-animate")).not.toBeNull();
});

it("derives motion timing from the playback speed", async () => {
	const screen = await render(<ThroughlinePlayer trace={checkout} />);
	const root = () => document.querySelector<HTMLElement>(".thl")!;
	expect(root().style.getPropertyValue("--thl-step-ms")).toBe("1500ms");
	await screen.getByRole("combobox", { name: "Playback speed" }).selectOptions("2");
	expect(root().style.getPropertyValue("--thl-step-ms")).toBe("750ms");
	const draw = (value: string) => Number.parseFloat(getComputedStyle(root()).getPropertyValue(value));
	expect(getComputedStyle(root()).getPropertyValue("--thl-draw-ms").trim()).not.toBe("");
	expect(draw("--thl-step-ms")).toBe(750);
});

it("declares every player animation only for users who have not asked for reduced motion", async () => {
	await render(<ThroughlinePlayer trace={checkout} />);
	const unguarded: string[] = [];
	let guarded = 0;
	const visit = (rules: CSSRuleList, safe: boolean) => {
		for (const rule of rules) {
			if (rule instanceof CSSMediaRule) {
				// Rules inside a reduced-motion block are opt-outs, not animations.
				if (rule.conditionText.includes("prefers-reduced-motion: reduce")) continue;
				visit(rule.cssRules, safe || rule.conditionText.includes("prefers-reduced-motion: no-preference"));
			} else if (rule instanceof CSSStyleRule && rule.selectorText.includes(".thl")) {
				// A shorthand containing var() has no longhands in the CSSOM, so read
				// the shorthand itself or these rules would go unnoticed.
				const declared = rule.style.getPropertyValue("animation") || rule.style.getPropertyValue("animation-name");
				if (!declared || /^none\b/.test(declared.trim())) continue;
				if (safe) guarded++;
				else unguarded.push(`${rule.selectorText} → ${declared}`);
			}
		}
	};
	for (const sheet of document.styleSheets) visit(sheet.cssRules, false);
	// A short reduced-motion override cannot beat these more specific selectors.
	expect(unguarded).toEqual([]);
	expect(guarded).toBeGreaterThanOrEqual(3);
});

it("shows selection and keyboard focus as outer rings, not dashes or authored focus", async () => {
	const screen = await render(<ThroughlinePlayer trace={compile([
		"```thl flow",
		'node a "A" = 1',
		'node b "B" = 2',
		'link ab a -> b "go"',
		'step "Go"',
		"  send ab = 1",
		"  focus a",
		"```",
	].join("\n"))} />);
	await screen.getByRole("combobox", { name: "Select entity" }).selectOptions("a");
	const selected = document.querySelector<SVGRectElement>('[data-node="a"] .thl-ring.thl-ring-selected')!;
	expect(selected).not.toBeNull();
	expect(getComputedStyle(selected).stroke).not.toBe("none");
	expect(getComputedStyle(document.querySelector('[data-node="a"] .thl-node')!).strokeDasharray).toBe("none");

	const target = document.querySelector<SVGGElement>('[data-node="b"]')!;
	const ring = target.querySelector<SVGRectElement>(".thl-ring")!;
	expect(getComputedStyle(ring).strokeWidth).toBe("1.5px");
	target.focus({ focusVisible: true } as FocusOptions);
	await userEvent.keyboard("{Shift}");
	expect(getComputedStyle(ring).strokeWidth).toBe("2px");
	expect(getComputedStyle(target).outlineStyle).toBe("none");
	// The first rect of a node remains its body.
	expect(target.querySelector("rect")!.classList.contains("thl-node")).toBe(true);
});
