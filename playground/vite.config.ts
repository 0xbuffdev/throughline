import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Serve the actual package source without depending on a published npm version.
// Keep this development-only page out of the package's explicit files list.
const root = fileURLToPath(new URL("./", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
	root,
	server: {
		port: 5173,
		fs: { allow: [repositoryRoot] },
	},
});
