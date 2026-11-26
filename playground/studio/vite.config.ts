import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Public authoring host: deliberately independent of the development-only
// Mermaid proof host. The public React entry remains native until cutover.
const root = fileURLToPath(new URL("./", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
	root,
	server: { port: 5174, fs: { allow: [repositoryRoot] } },
});
