import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileProgram } from "../../compiler.js";
import { ThroughlinePlayer } from "../index.js";
import "../../styles/throughline.css";

it("renders malicious-looking labels, notes and values as inert text on mobile", async () => {
	await page.viewport(375, 900);
	const payload = '<img src=x onerror="globalThis.injected=true">';
	const trace = compileProgram({
		version: 1,
		entities: [{ id: "node", label: payload, value: { html: "<script>bad()</script>" } }],
		relations: [],
		beats: [{ label: "<svg onload=alert(1)>", events: [{ op: "note", text: payload }] }],
	});
	const screen = await render(<ThroughlinePlayer trace={trace} />);
	await screen.getByRole("button", { name: "Step forward" }).click();
	const player = document.querySelector(".thl") as HTMLElement;
	expect(player.querySelector("img, iframe, script")).toBeNull();
	expect(player.querySelector(".thl-caption-note")?.textContent).toBe(payload);
	expect(player.querySelector(".thl-caption-title")?.textContent).toBe("<svg onload=alert(1)>");
	await screen.getByText("Inspect state").click();
	expect(player.querySelector(".thl-inspector")?.textContent).toContain("<script>bad()</script>");
	expect(player.scrollWidth).toBeLessThanOrEqual(player.clientWidth);
});
