/**
 * Exact direct versions for independently installed Throughline host fixtures.
 * Refresh the checked-in npm lockfiles with update-integration-locks.mjs when
 * deliberately changing one of these versions.
 */
export const fixtureDependencies = Object.freeze({
  fumadocs: [
    "fumadocs-mdx@15.4.10", "fumadocs-core@16.17.8",
    "react-router@8.5.1", "remark-math@6.0.0", "rehype-katex@7.0.1",
    "@mdx-js/mdx@3.1.1", "vite@8.3.6", "react@19.3.1", "react-dom@19.3.1",
  ],
  next: [
    "next@16.4.5", "@next/mdx@16.4.5",
    "@mdx-js/loader@3.1.1", "@mdx-js/react@3.1.1",
    "@types/mdx@2.0.14", "react@19.3.1", "react-dom@19.3.1",
  ],
  astro: [
    "astro@7.4.2", "@astrojs/mdx@8.1.3", "@astrojs/react@7.1.4",
    "@astrojs/markdown-remark@7.3.6", "react@19.3.1", "react-dom@19.3.1",
  ],
  "markdown-hosts": [
    "react@19.3.1", "react-dom@19.3.1",
    "react-markdown@10.1.0", "mdx-bundler@10.1.1",
    "markdown-to-jsx@9.10.6", "esbuild@0.25.12",
  ],
});

export function fixtureManifest(name) {
  const specs = fixtureDependencies[name];
  if (!specs) throw new Error("Unknown integration fixture: " + name);
  const dependencies = { "@0xbuff/throughline": "file:throughline.tgz" };
  for (const spec of specs) {
    const at = spec.lastIndexOf("@");
    if (at <= 0) throw new Error("Expected an exact package version: " + spec);
    dependencies[spec.slice(0, at)] = spec.slice(at + 1);
  }
  return { name: "throughline-" + name, private: true, type: "module", dependencies };
}
