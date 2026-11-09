import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "throughline-frameworks-"));

function write(dir, path, content) {
  const destination = join(dir, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function run(dir, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ASTRO_TELEMETRY_DISABLED: "1" },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      [executable, ...args].join(" ") + " failed:\n" +
      (result.stdout ?? "") + "\n" + (result.stderr ?? "") +
      (result.error ? "\n" + result.error.message : ""),
    );
  }
  return result.stdout;
}

function consumer(name, tarball, dependencies) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  write(dir, "package.json", JSON.stringify({ name: "throughline-" + name, private: true, type: "module" }));
  run(dir, "npm", [
    "install", "--no-audit", "--no-fund", "--no-package-lock",
    tarball, ...dependencies,
  ]);
  return dir;
}

function assertBuiltPage(dir, path, label) {
  const file = join(dir, path);
  assert(existsSync(file), label + " did not emit " + path);
  const html = readFileSync(file, "utf8");
  assert.match(html, /Visualization player/, label + " did not render the trace");
  assert.match(html, /trace integration/i, label + " lost surrounding MDX content");
}


/** Serve an actual framework export and verify browser hydration, not just SSR. */
async function assertHydratedPage(dir, pagePath, label, plainPath = "/plain.html") {
  const output = resolve(dir);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let file = resolve(output, "." + (pathname === "/" ? "/index.html" : pathname));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      // The Fumadocs/React Router fixture is a client-routed Vite export.
      if (!existsSync(file) && pathname === "/plain") file = join(output, "index.html");
      if (!file.startsWith(output + sep) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
      response.end(readFileSync(file));
    } catch {
      response.writeHead(400);
      response.end("Bad request");
    }
  });
  let browser;
  try {
    await new Promise((done, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", done);
    });
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    await page.goto(origin + pagePath, { waitUntil: "networkidle" });
    const player = page.getByRole("group", { name: "Visualization player" });
    await player.waitFor({ state: "visible" });
    await page.waitForFunction(() => window.__THL_HYDRATED === true);
    const initial = (await page.getByRole("status").textContent()).trim();
    await page.getByRole("button", { name: "Step forward" }).click();
    await page.waitForFunction((before) => {
      const current = document.querySelector('[role="status"]')?.textContent?.trim();
      return current && current !== before;
    }, initial);
    assert.match(await page.getByRole("status").textContent(), /Step 2 of/);
    const styling = await player.evaluate((node) => ({
      radius: getComputedStyle(node).getPropertyValue("--thl-radius").trim(),
      overflow: node.scrollWidth > node.clientWidth,
    }));
    assert.equal(styling.radius, "0.325rem", label + " did not load package CSS");
    assert.equal(styling.overflow, false, label + " overflows on mobile");
    if (label === "Fumadocs / React Router") {
      assert((await page.locator(".katex").count()) > 0, "Fumadocs lost remark-math / rehype-katex");
      assert((await page.getByTestId("mermaid-fixture").count()) > 0, "Fumadocs lost Mermaid JSX output");
    }
    assert.deepEqual(errors, [], label + " emitted browser errors");
    await page.goto(origin + plainPath, { waitUntil: "networkidle" });
    assert.match(await page.locator("body").textContent(), /Unchanged MDX content/);
    assert.equal(await page.getByRole("group", { name: "Visualization player" }).count(), 0);
    assert.deepEqual(errors, [], label + " plain page emitted browser errors");
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
}

try {
  const tarball = join(scratch, "throughline.tgz");
  run(root, "pnpm", ["pack", "--out", tarball]);

  // A real Fumadocs Unified project must generate entries from a source.config.ts
  // retaining existing remark/rehype hooks. It must also validate malformed fences.
  const fumadocs = consumer("fumadocs", tarball, [
    "fumadocs-mdx@15.4.10", "fumadocs-core@16.17.8", "react-router@8.5.1",
    "remark-math@6.0.0", "rehype-katex@7.0.1",
    "@mdx-js/mdx@3.1.1", "vite@8.3.6", "react@19.3.1", "react-dom@19.3.1",
  ]);
  write(fumadocs, "source.config.ts", [
    'import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";',
    'import { defineConfig, defineDocs } from "fumadocs-mdx/config";',
    'import rehypeKatex from "rehype-katex";',
    'import remarkMath from "remark-math";',
    'import { remarkThroughline } from "@0xbuff/throughline/remark";',
    'export default defineConfig({ mdxOptions: {',
    '  remarkPlugins: (existing) => [[remarkThroughline, { mode: "mdx" }], remarkMath, remarkMdxMermaid, ...existing],',
    '  rehypePlugins: (existing) => [rehypeKatex, ...existing],',
    '} });',
    'export const { docs, meta } = defineDocs({ dir: "content/docs" });',
    "",
  ].join("\n"));
  write(fumadocs, "content/docs/index.mdx", [
    "---", "title: Trace integration", "description: A safe MDX build.", "---", "",
    "# Trace integration", "", "$1+1=2$", "",
    "~~~thl flow", 'node a "A" = 0', 'step "Advance"', "  set a = 1", "~~~",
    "", "~~~mermaid", "graph TD", "  A --> B", "~~~",
    "", "~~~js", "const untouched = true;", "~~~",
  ].join("\n"));
  write(fumadocs, "content/docs/plain.mdx", [
    "---", "title: Unchanged MDX content", "---", "",
    "# Unchanged MDX content", "", "Ordinary Markdown without a trace.", "",
    "~~~js", "const stillPlain = true;", "~~~",
  ].join("\n"));
  run(fumadocs, join(fumadocs, "node_modules/.bin/fumadocs-mdx"), []);
  assert(existsSync(join(fumadocs, ".source")), "Fumadocs config did not generate .source");

  const fumadocsCheck = [
    'import assert from "node:assert/strict";',
    'import { compile } from "@mdx-js/mdx";',
    'import config from "./source.config.ts";',
    'import { readFileSync } from "node:fs";',
    'const plugins = config.mdxOptions.remarkPlugins([]);',
    'const rehype = config.mdxOptions.rehypePlugins([]);',
    'assert.equal(plugins.length, 3);',
    'assert.equal(rehype.length, 1);',
    'const md = readFileSync("./content/docs/index.mdx", "utf8");',
    'const compiled = String(await compile(md.replace(/^---[\\s\\S]*?---\\n/, ""), { remarkPlugins: plugins, rehypePlugins: rehype }));',
    'assert.match(compiled, /ThroughlineEmbed/);',
    'assert.match(compiled, /untouched/);',
    'assert.match(compiled, /katex/);',
    'assert.match(compiled, /Mermaid/);',
    'const plain = readFileSync("./content/docs/plain.mdx", "utf8");',
    'const plainCompiled = String(await compile(plain.replace(/^---[\\s\\S]*?---\\n/, ""), { remarkPlugins: plugins, rehypePlugins: rehype }));',
    'assert.match(plainCompiled, /stillPlain/);',
    'assert.doesNotMatch(plainCompiled, /ThroughlineEmbed/);',
    'await assert.rejects(() => compile("~~~thl flow\\ninvalid\\n~~~", { remarkPlugins: plugins, rehypePlugins: rehype }), /invalid|Expected|Unknown/i);',
  ].join("\n");
  run(fumadocs, "node", ["--experimental-strip-types", "--input-type=module", "-e", fumadocsCheck]);


  // Exercise Fumadocs' real Vite MDX compiler and the React Router component
  // boundary. The generated .source alone does not prove MDX renders in a route.
  write(fumadocs, "vite.config.mjs", [
    'import { defineConfig } from "vite";',
    'import { fumadocsMdx } from "fumadocs-mdx/vite";',
    'export default defineConfig({ plugins: [fumadocsMdx()] });',
  ].join("\n"));
  write(fumadocs, "src/docs.js", [
    'import { defineDocs } from "fumadocs-mdx/macro";',
    'export const docs = defineDocs({ dir: "content/docs" });',
  ].join("\n"));
  write(fumadocs, "index.html", [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>',
    '<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
  ].join("\n"));
  write(fumadocs, "src/main.jsx", [
    'import React, { useEffect } from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { BrowserRouter, Routes, Route } from "react-router";',
    'import { docs } from "./docs.js";',
    'import { ThroughlineEmbed as BaseEmbed } from "@0xbuff/throughline/react";',
    'import "@0xbuff/throughline/styles/throughline.css";',
    'function ThroughlineEmbed(props) {',
    '  useEffect(() => { window.__THL_HYDRATED = true; }, []);',
    '  return React.createElement(BaseEmbed, props);',
    '}',
    'const components = {',
    '  ThroughlineEmbed,',
    '  Mermaid: () => React.createElement("div", { "data-testid": "mermaid-fixture" }, "Mermaid diagram"),',
    '};',
    'function Document({ name }) {',
    '  const page = docs.getPage(name + ".mdx") ?? docs.getPage(name) ??',
    '    docs.getPages().find((item) => item.path.endsWith("/" + name + ".mdx"));',
    '  if (!page) throw new Error("Missing generated Fumadocs page: " + name);',
    '  const Content = page.body;',
    '  return React.createElement(Content, { components });',
    '}',
    'const app = React.createElement(BrowserRouter, null,',
    '  React.createElement(Routes, null,',
    '    React.createElement(Route, { path: "/", element: React.createElement(Document, { name: "index" }) }),',
    '    React.createElement(Route, { path: "/plain", element: React.createElement(Document, { name: "plain" }) }),',
    '  ));',
    'createRoot(document.getElementById("root")).render(app);',
  ].join("\n"));
  run(fumadocs, join(fumadocs, "node_modules/.bin/vite"), ["build"]);
  assert(existsSync(join(fumadocs, "dist/index.html")), "Fumadocs React Router fixture did not build");
  await assertHydratedPage(join(fumadocs, "dist"), "/", "Fumadocs / React Router", "/plain");

  // A Next.js App Router build checks the real @next/mdx loader, component map,
  // React client boundary and CSS import. webpack allows function-form plugins.
  const next = consumer("next", tarball, [
    "next@16.4.5", "@next/mdx@16.4.5",
    "@mdx-js/loader@3.1.1", "@mdx-js/react@3.1.1", "@types/mdx@2.0.14",
    "react@19.3.1", "react-dom@19.3.1",
  ]);
  write(next, "next.config.mjs", [
    'import createMDX from "@next/mdx";',
    'import { remarkThroughline } from "@0xbuff/throughline/remark";',
    'export default createMDX({ options: { remarkPlugins: [[remarkThroughline, { mode: "mdx" }]] } })({',
    '  output: "export", pageExtensions: ["js", "jsx", "mdx"],',
    '  experimental: { cpus: 2 },',
    '});',
  ].join("\n"));
  write(next, "app/layout.jsx", [
    'import "@0xbuff/throughline/styles/throughline.css";',
    'export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html>; }',
  ].join("\n"));
  write(next, "app/trace-embed.jsx", [
    '"use client";',
    'import { useEffect } from "react";',
    'import { ThroughlineEmbed as BaseEmbed } from "@0xbuff/throughline/react";',
    'export function ThroughlineEmbed(props) {',
    '  useEffect(() => { window.__THL_HYDRATED = true; }, []);',
    '  return <BaseEmbed {...props} />;',
    '}',
  ].join("\n"));
  write(next, "mdx-components.jsx", [
    'import { ThroughlineEmbed } from "./app/trace-embed";',
    'export function useMDXComponents(components = {}) { return { ThroughlineEmbed, ...components }; }',
  ].join("\n"));
  write(next, "app/page.mdx", [
    "# Next trace integration", "",
    "~~~thl binary", "a = 1011", "b = 0110", "~~~",
    "", "~~~js", "const unaffected = true;", "~~~",
  ].join("\n"));
  write(next, "app/plain/page.mdx", [
    "# Unchanged MDX content", "", "Ordinary Markdown without a trace.", "",
    "~~~js", "const stillPlain = true;", "~~~",
  ].join("\n"));
  run(next, join(next, "node_modules/.bin/next"), ["build", "--webpack"]);
  assertBuiltPage(next, "out/index.html", "Next.js");
  await assertHydratedPage(join(next, "out"), "/", "Next.js");

  // Astro's Markdown/MDX pipeline emits an Astro component wrapper, which in
  // turn owns the hydration directive for the React island and the player CSS.
  const astro = consumer("astro", tarball, [
    "astro@7.4.2", "@astrojs/mdx@8.1.3", "@astrojs/react@7.1.4", "@astrojs/markdown-remark@7.3.6",
    "react@19.3.1", "react-dom@19.3.1",
  ]);
  write(astro, "astro.config.mjs", [
    'import { defineConfig } from "astro/config";',
    'import mdx from "@astrojs/mdx";',
    'import react from "@astrojs/react";',
    'import { unified } from "@astrojs/markdown-remark";',
    'import { remarkThroughline } from "@0xbuff/throughline/remark";',
    'export default defineConfig({ integrations: [',
    '  mdx({ processor: unified({ remarkPlugins: [[remarkThroughline, { mode: "mdx" }]] }) }), react(),',
    '] });',
  ].join("\n"));
  write(astro, "src/components/HydratedTrace.jsx", [
    'import { useEffect } from "react";',
    'import { ThroughlineEmbed } from "@0xbuff/throughline/react";',
    'export default function HydratedTrace(props) {',
    '  useEffect(() => { window.__THL_HYDRATED = true; }, []);',
    '  return <ThroughlineEmbed {...props} />;',
    '}',
  ].join("\n"));
  write(astro, "src/components/ThroughlineEmbed.astro", [
    "---",
    'import HydratedTrace from "./HydratedTrace.jsx";',
    'import "@0xbuff/throughline/styles/throughline.css";',
    'const { source } = Astro.props;',
    "---",
    "<HydratedTrace source={source} client:load />",
  ].join("\n"));
  write(astro, "src/pages/index.mdx", [
    'import ThroughlineEmbed from "../components/ThroughlineEmbed.astro";',
    "", "# Astro trace integration", "",
    "~~~thl flow", 'node x "X" = 0', 'step "Change"', "  set x = 1", "~~~",
  ].join("\n"));
  write(astro, "src/pages/plain.mdx", [
    "# Unchanged MDX content", "", "Ordinary Markdown without a trace.", "",
    "~~~js", "const stillPlain = true;", "~~~",
  ].join("\n"));
  run(astro, join(astro, "node_modules/.bin/astro"), ["build"]);
  assertBuiltPage(astro, "dist/index.html", "Astro");
  const astroHtml = readFileSync(join(astro, "dist/index.html"), "utf8");
  assert.match(astroHtml, /astro-island/, "Astro must emit a hydrated React island");
  await assertHydratedPage(join(astro, "dist"), "/", "Astro", "/plain/");
  console.log("Independent Fumadocs, Next.js and Astro consumers passed (Next/Astro browser hydration verified).");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
