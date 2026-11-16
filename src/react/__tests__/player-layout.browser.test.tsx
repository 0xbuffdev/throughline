import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { compileArtifact } from "../../v2/compiler.js";
import { layoutGraph, layoutGraphView } from "../../v2/graph-layout.js";
import { inspectTrace } from "../../v2/inspector.js";
import { projectView } from "../../v2/views.js";
import { distributedGraph } from "../../__tests__/v2-graph-fixture.js";
import { ThroughlineGraphPlayer } from "../graph-player.js";
import "../../styles/throughline.css";

const trace = () => compileArtifact(distributedGraph());

it("uses the compact player layout, not the legacy player composition", async () => {
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

it("keeps the source palette, unchanged graph card dimensions and real authored frame", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={trace()} initialView="graph" theme="dark"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 expect(shell.classList.contains("player-shell")).toBe(true);
 const css = getComputedStyle(shell);
 expect(css.getPropertyValue("--thl-active").trim()).not.toBe("");
 const node = shell.querySelector<SVGRectElement>(".thl-v2-diagram [data-node] .thl-node")!;
 expect(node).not.toBeNull();
 expect(Number(node.getAttribute("height"))).toBe(74);
 expect(Number(node.getAttribute("width"))).toBe(188);
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
 expect(shell.querySelector(".canvas-meta")?.textContent).toContain("FRAME 01");
 expect(shell.querySelectorAll("[data-source-event-ids]").length).toBeGreaterThan(0);
});

it("preserves the player sidebar drawer and control placement at mobile embed widths", async () => {
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

it("keeps authored node positions, original edge routes and semantic highlighting at changing host widths", async () => {
 const compiled = trace();
 const inspector = inspectTrace(compiled);
 const screen = await render(<ThroughlineGraphPlayer trace={compiled} initialView="graph"/>);
 const player = screen.getByRole("group", { name: "Visualization player" }).element();
 const canvas = player.querySelector<HTMLElement>(".canvas")!;
 const node = player.querySelector<SVGGElement>('[data-node="client"]')!;
 const link = player.querySelector<SVGGElement>('.thl-v2-diagram [data-source-relation-ids="request"]')!;
 expect(node).not.toBeNull();
 expect(link).not.toBeNull();
 const compareAuthoredGeometry = () => {
  const layout = layoutGraph(compiled, Math.floor(canvas.clientWidth));
  const view = projectView(inspector, { kind: "graph", frameIndex: 0 });
  const geometry = layoutGraphView(layout, view);
  const entity = view.items.find(item => item.role === "entity" && item.source.entityIds?.includes("client"))!;
  const relation = view.items.find(item => item.role === "relation" && item.source.relationIds?.includes("request"))!;
  const box = geometry.nodes[entity.id];
  return node.getAttribute("transform") === `translate(${box.x},${box.y})`
   && Number(node.querySelector(".thl-node")?.getAttribute("width")) === box.w
   && Number(node.querySelector(".thl-node")?.getAttribute("height")) === box.h
   && link.querySelector(".thl-edge")?.getAttribute("d") === geometry.edges[relation.id]?.d;
 };
 for (const width of [900, 375]) {
  player.style.width = width + "px";
  await expect.poll(compareAuthoredGeometry).toBe(true);
  expect(player.querySelectorAll(".thl-v2-diagram .entity")).toHaveLength(0);
  expect(node.querySelector("circle")).toBeNull();
  expect(node.querySelector(".thl-v2-change")).toBeNull();
  const path = link.querySelector<SVGPathElement>(".thl-edge")!;
  expect(Number.parseFloat(getComputedStyle(path).strokeWidth)).toBeCloseTo(1.3);
 }
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
 const activePath = link.querySelector<SVGPathElement>(".thl-edge")!;
 expect(link.classList.contains("thl-transferred")).toBe(true);
 expect(Number.parseFloat(getComputedStyle(activePath).strokeWidth)).toBeCloseTo(2.5);
 expect(activePath.getAttribute("stroke-dasharray")).toBeNull();
});
