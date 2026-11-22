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

it("keeps the source palette, compact measured cards and real authored frame", async () => {
 const screen = await render(<ThroughlineGraphPlayer trace={trace()} initialView="graph" theme="dark"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 expect(shell.classList.contains("player-shell")).toBe(true);
 const css = getComputedStyle(shell);
 expect(css.getPropertyValue("--thl-active").trim()).not.toBe("");
 const node = shell.querySelector<SVGRectElement>(".thl-v2-diagram [data-node] .thl-node")!;
 expect(node).not.toBeNull();
 expect(Number(node.getAttribute("height"))).toBe(52);
 expect(Number(node.getAttribute("width"))).toBeLessThan(188);
 await screen.getByRole("button", { name: "Step forward" }).click();
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 2 of 7");
 expect(shell.querySelector(".canvas-meta")?.textContent).not.toContain("FRAME 01");
 expect(shell.querySelectorAll("[data-source-event-ids]").length).toBeGreaterThan(0);
});

it("keeps a bounded side panel, mobile bottom sheet and a single reading scroll", async () => {
 await page.viewport(1200, 900);
 const compiled = trace();
 const screen = await render(<ThroughlineGraphPlayer trace={compiled} initialView="graph"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 const canvas = shell.querySelector<HTMLElement>(".canvas")!;
 const svg = shell.querySelector<SVGSVGElement>(".thl-v2-diagram")!;
 for (const width of [900, 768, 600, 560, 375, 260]) {
  shell.style.width = width + "px";
  await expect.poll(() => Math.round(shell.getBoundingClientRect().width)).toBe(width);
  await expect.poll(() => Number(svg.getAttribute("viewBox")?.split(" ")[2]))
   .toBe(layoutGraph(compiled, canvas.clientWidth).width);
  const originalCanvasWidth = canvas.clientWidth;
  const originalViewBox = svg.getAttribute("viewBox");
  const originalNode = shell.querySelector('[data-node="client"]')?.getAttribute("transform");
  await screen.getByRole("button", { name: "Inspect", exact: true }).click();
  const inspector = screen.getByRole("complementary", { name: "Workflow inspector" });
  await expect.element(inspector).toBeVisible();
  const panel = inspector.element();
  const panelRect = panel.getBoundingClientRect();
  const playerRect = shell.getBoundingClientRect();
  const contentRect = shell.querySelector(".player-content")!.getBoundingClientRect();
  const expectedWidth = width <= 560 ? playerRect.width - 2 : Math.min(contentRect.width * .6, 448);
  expect(Math.abs(panelRect.width - expectedWidth)).toBeLessThanOrEqual(3);
  expect(Math.abs(panelRect.right - playerRect.right)).toBeLessThanOrEqual(3);
  // The overlay replaces the visualization surface while the header and
  // playback controls remain accessible for stepping through evidence.
  expect(Math.abs(panelRect.top - (width <= 560 ? contentRect.bottom - contentRect.height * .75 : contentRect.top))).toBeLessThanOrEqual(3);
  expect(Math.abs(panelRect.bottom - contentRect.bottom)).toBeLessThanOrEqual(3);
  expect(getComputedStyle(panel).overflowY).toBe("auto");
  expect(canvas.clientWidth).toBe(originalCanvasWidth);
  expect(svg.getAttribute("viewBox")).toBe(originalViewBox);
  expect(shell.querySelector('[data-node="client"]')?.getAttribute("transform")).toBe(originalNode);
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth + 2);
  await screen.getByText("Source details", { exact: true }).click();
  const evidence = panel.querySelector<HTMLElement>(".thl-v2-inspect")!;
  expect(evidence).not.toBeNull();
  expect(getComputedStyle(evidence).overflowY).toBe("visible");
  expect(getComputedStyle(evidence).maxHeight).toBe("none");
  const close = screen.getByRole("button", { name: "Close inspector" });
  panel.scrollTop = panel.scrollHeight;
  await expect.poll(() => close.element().getBoundingClientRect().top -
   panel.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  await close.click();
 }
 await screen.getByRole("button", { name: "Player options" }).click();
 await expect.element(screen.getByRole("dialog", { name: "Player options" })).toBeVisible();
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

it("follows factorial's authored focus through every frame at desktop and mobile widths", async () => {
 const { factorialReference } = await import("../../reference/factorial.js");
 const compiled = compileArtifact(factorialReference.artifact);
 const screen = await render(<ThroughlineGraphPlayer trace={compiled}/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 const svg = screen.getByRole("img", { name: "Source-linked graph at current frame" }).element();
 const follow = screen.getByRole("button", { name: "Follow active", exact: true });
 for (const width of [900, 375]) {
  shell.style.width = width + "px";
  shell.focus();
  await userEvent.keyboard("{Home}");
  await expect.poll(() => Number(svg.getAttribute("viewBox")?.split(" ")[2])).toBe(width - 2);
  await expect.element(follow).toHaveAttribute("aria-pressed", "false");
  for (const step of compiled.artifact.steps) {
   await screen.getByRole("button", { name: "Step forward" }).click();
   const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
   for (const id of step.focusEntityIds ?? []) {
    const node = shell.querySelector<SVGGElement>(`[data-node="${id}"]`)!;
    const box = node.getBBox();
    const transform = node.transform.baseVal.consolidate()!.matrix;
    expect(box.x + transform.e).toBeGreaterThanOrEqual(x);
    expect(box.y + transform.f).toBeGreaterThanOrEqual(y);
    expect(box.x + transform.e + box.width).toBeLessThanOrEqual(x + w);
    expect(box.y + transform.f + box.height).toBeLessThanOrEqual(y + h);
   }
  }
 }
 await screen.getByRole("button", { name: "Zoom in", exact: true }).click();
 await expect.element(follow).toHaveAttribute("aria-pressed", "false");
 const manualView = svg.getAttribute("viewBox");
 await screen.getByRole("button", { name: "Step back" }).click();
 expect(svg.getAttribute("viewBox")).toBe(manualView);
 await follow.click();
 await expect.element(follow).toHaveAttribute("aria-pressed", "true");
 expect(svg.getAttribute("viewBox")).not.toBe(manualView);
});

it("hides unsupported tabs, keeps supported tabs stable and supports arrow navigation", async () => {
 const { factorialReference } = await import("../../reference/factorial.js");
 const screen = await render(<ThroughlineGraphPlayer trace={compileArtifact(factorialReference.artifact)}/>);
 expect(screen.getByRole("tab", { name: "Sequence" }).query()).toBeNull();
 const graph = screen.getByRole("tab", { name: "Graph", exact: true });
 graph.element().focus();
 await userEvent.keyboard("{ArrowRight}");
 await expect.element(screen.getByRole("tab", { name: "State", exact: true })).toHaveFocus();
 await expect.element(screen.getByRole("tab", { name: "State", exact: true })).toHaveAttribute("aria-selected", "true");
 await screen.getByRole("button", { name: "Step forward" }).click();
 expect(screen.getByRole("tab", { name: "Sequence" }).query()).toBeNull();
 await screen.rerender(<ThroughlineGraphPlayer trace={trace()} initialView="sequence"/>);
 await expect.element(screen.getByRole("tab", { name: "Sequence" })).toHaveAttribute("aria-selected", "true");
 await screen.rerender(<ThroughlineGraphPlayer trace={compileArtifact({
  schemaVersion: 2, id: "empty", origins: [{ id: "author", kind: "authored" }],
  entities: [], relations: [], initialState: {}, steps: [],
 })}/>);
 expect(screen.getByRole("tab", { name: "Graph" }).query()).toBeNull();
 expect(screen.getByRole("tab", { name: "Sequence" }).query()).toBeNull();
 await expect.element(screen.getByRole("tab", { name: "State" })).toHaveAttribute("aria-selected", "true");
});

it("keeps Options inside a narrow embed, dismisses with Escape and restores inspector focus", async () => {
 await page.viewport(1200, 900);
 const screen = await render(<ThroughlineGraphPlayer trace={trace()} initialView="graph"/>);
 const shell = screen.getByRole("group", { name: "Visualization player" }).element();
 shell.style.width = "260px";
 const trigger = screen.getByRole("button", { name: "Player options", exact: true });
 await trigger.click();
 const options = screen.getByRole("dialog", { name: "Player options", exact: true });
 await expect.element(options).toBeVisible();
 const bounds = options.element().getBoundingClientRect();
 const playerBounds = shell.getBoundingClientRect();
 expect(bounds.left).toBeGreaterThanOrEqual(playerBounds.left);
 expect(bounds.right).toBeLessThanOrEqual(playerBounds.right);
 expect(options.element().querySelectorAll("select:disabled")).toHaveLength(0);
 await expect.element(screen.getByText("Restart timeline", { exact: true })).toBeVisible();
 await userEvent.keyboard("{Escape}");
 expect(options.query()).toBeNull();
 await expect.element(trigger).toHaveFocus();
 const inspect = screen.getByRole("button", { name: "Inspect", exact: true });
 await inspect.click();
 await expect.element(screen.getByRole("button", { name: "Close inspector" })).toHaveFocus();
 await userEvent.keyboard("{Escape}");
 expect(screen.getByRole("complementary", { name: "Workflow inspector" }).query()).toBeNull();
 await expect.element(inspect).toHaveFocus();
});

it("follows a collapsed focus summary and seeks without mutating compiled state", async () => {
 const { factorialReference } = await import("../../reference/factorial.js");
 const compiled = compileArtifact(factorialReference.artifact);
 const before = JSON.stringify(compiled.frames);
 const screen = await render(<ThroughlineGraphPlayer trace={compiled}/>);
 await screen.getByRole("button", { name: "Step forward" }).click();
 await screen.getByRole("button", { name: "Player options", exact: true }).click();
 await userEvent.selectOptions(screen.getByRole("combobox", { name: "Focus group" }).element(), "recursion");
 await screen.getByRole("button", { name: "Collapse group", exact: true }).click();
 await screen.getByRole("button", { name: "Close options" }).click();
 await screen.getByRole("button", { name: "Follow active", exact: true }).click();
 const svg = screen.getByRole("img", { name: "Source-linked graph at current frame" }).element();
 const summary = document.querySelector<SVGGElement>('[data-group-summary="recursion"]')!;
 const box = summary.getBBox();
 const matrix = summary.transform.baseVal.consolidate()!.matrix;
 const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
 expect(matrix.e + box.x).toBeGreaterThanOrEqual(x);
 expect(matrix.f + box.y).toBeGreaterThanOrEqual(y);
 expect(matrix.e + box.x + box.width).toBeLessThanOrEqual(x + w);
 expect(matrix.f + box.y + box.height).toBeLessThanOrEqual(y + h);
 await screen.getByRole("button", { name: "Expand group Authored recursive evaluation" }).click();
 screen.getByRole("group", { name: "Visualization player" }).element().focus();
 await userEvent.keyboard("{End}");
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 9 of 9");
 expect(document.querySelector('[data-node="result"] .thl-v2-value')?.textContent).toBe("24");
 await userEvent.keyboard("{Home}");
 await expect.element(screen.getByRole("status")).toHaveTextContent("Step 1 of 9");
 expect(document.querySelector('[data-node="result"] .thl-v2-value')?.textContent).toBe("null");
 expect(JSON.stringify(compiled.frames)).toBe(before);
});
