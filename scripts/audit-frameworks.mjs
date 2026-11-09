import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

try {
  const tarball = join(scratch, "throughline.tgz");
  run(root, "pnpm", ["pack", "--out", tarball]);

  // A real Fumadocs Unified project must generate entries from a source.config.ts
  // retaining existing remark/rehype hooks. It must also validate malformed fences.
  const fumadocs = consumer("fumadocs", tarball, [
    "fumadocs-mdx@15.4.10", "fumadocs-core@16.17.8",
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
    "", "~~~js", "const untouched = true;", "~~~",
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
    'await assert.rejects(() => compile("~~~thl flow\\ninvalid\\n~~~", { remarkPlugins: plugins, rehypePlugins: rehype }), /invalid|Expected|Unknown/i);',
  ].join("\n");
  run(fumadocs, "node", ["--experimental-strip-types", "--input-type=module", "-e", fumadocsCheck]);

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
    'export { ThroughlineEmbed } from "@0xbuff/throughline/react";',
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
  run(next, join(next, "node_modules/.bin/next"), ["build", "--webpack"]);
  assertBuiltPage(next, "out/index.html", "Next.js");

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
  write(astro, "src/components/ThroughlineEmbed.astro", [
    "---",
    'import { ThroughlineEmbed as ReactEmbed } from "@0xbuff/throughline/react";',
    'import "@0xbuff/throughline/styles/throughline.css";',
    'const { source } = Astro.props;',
    "---",
    "<ReactEmbed source={source} client:load />",
  ].join("\n"));
  write(astro, "src/pages/index.mdx", [
    'import ThroughlineEmbed from "../components/ThroughlineEmbed.astro";',
    "", "# Astro trace integration", "",
    "~~~thl flow", 'node x "X" = 0', 'step "Change"', "  set x = 1", "~~~",
  ].join("\n"));
  run(astro, join(astro, "node_modules/.bin/astro"), ["build"]);
  assertBuiltPage(astro, "dist/index.html", "Astro");
  const astroHtml = readFileSync(join(astro, "dist/index.html"), "utf8");
  assert.match(astroHtml, /astro-island/, "Astro must emit a hydrated React island");
  console.log("Independent Fumadocs, Next.js and Astro consumers passed.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
