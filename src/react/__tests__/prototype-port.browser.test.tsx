import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { distributedGraph } from "../../__tests__/v2-graph-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

const trace = () => compileArtifact(distributedGraph());

it("uses the original prototype's compact layout, not the legacy player composition", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={trace()} initialView="graph"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 for (const name of [
  ".player-header", ".context-bar", ".view-tabs", ".player-content",
  ".canvas", ".canvas-meta", ".graph-wrap", ".canvas-hint", ".zoom-tools",
  ".transport", ".transport-buttons", ".transport-meta", ".step-caption",
 ]) expect(shell.querySelector(name)).not.toBeNull();
 expect(shell.querySelector(".thl-v2-mode")).toBeNull();
 expect(shell.querySelector(".thl-bottom")).toBeNull();
 expect((shell.querySelector(".step-caption") as HTMLDetailsElement).open).toBe(false);
 await expect.element(screen.getByRole("tab", { name: "Graph" })).toHaveAttribute("aria-selected", "true");
 await screen.getByText("Details", { exact: true }).click();
 expect((shell.querySelector(".step-caption") as HTMLDetailsElement).open).toBe(true);
 await screen.getByRole("tab", { name: "State" }).click();
 await expect.element(screen.getByRole("region", { name: "State and event table" })).toBeVisible();
 await screen.getByRole("tab", { name: "Sequence" }).click();
 await expect.element(screen.getByRole("region", { name: "Message sequence evidence" })).toBeVisible();
});

it("keeps the source palette, original graph card dimensions and real authored frame", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={trace()} initialView="graph" theme="dark"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 expect(shell.classList.contains("player-shell")).toBe(true);
 const css = getComputedStyle(shell);
 expect(css.getPropertyValue("--thl-active").trim()).not.toBe("");
 const node = shell.querySelector<SVGRectElement>(".thl-v2-diagram [data-node] .thl-node")!;
 expect(node).not.toBeNull();
 expect(Number(node.getAttribute("height"))).toBe(52);
 expect(Number(node.getAttribute("width"))).toBe(116);
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
 expect(shell.querySelector(".canvas-meta")?.textContent).toContain("FRAME 01");
 expect(shell.querySelectorAll("[data-source-event-ids]").length).toBeGreaterThan(0);
});

it("preserves prototype's sidebar drawer and control placement at mobile embed widths", async () => {
 await page.viewport(900, 800);
 const screen = await render(<ThroughlineGraphPlayer trace={trace()} initialView="graph"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 for (const width of [768, 375, 260]) {
  shell.style.width = width + "px";
  await expect.poll(() => Math.round(shell.getBoundingClientRect().width)).toBe(width);
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth + 2);
  await screen.getByRole("button", { name: "Inspect", exact: true }).click();
  const inspector = screen.getByRole("complementary", { name: "Entity inspector" });
  await expect.element(inspector).toBeVisible();
  expect(shell.querySelector(".player-content.with-inspector")).not.toBeNull();
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth + 2);
  await screen.getByRole("button", { name: "Close inspector" }).click();
 }
 await screen.getByRole("button", { name: "Player options" }).click();
 await expect.element(screen.getByRole("group", { name: "Player options" })).toBeVisible();
 const toStep = screen.getByRole("spinbutton", { name: "Go to step" });
 await toStep.fill("3");
 await screen.getByRole("button", { name: "Go", exact: true }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 3 of 7");
 shell.focus();
 await userEvent.keyboard("{Home}");
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 7");
});
