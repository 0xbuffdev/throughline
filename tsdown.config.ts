import { defineConfig } from "tsdown";

/**
 * Keep library exports and separate Node CLI entry aligned with package metadata.
 * The CSS remains an explicit, consumer-loaded source asset.
 */
export default defineConfig({
	entry: {
		index: "src/index.ts",
		"react/index": "src/react/index.ts",
		"remark/index": "src/remark/index.ts",
		examples: "src/examples.ts",
		"node/index": "src/node/index.ts",
		"cli/main": "src/cli/main.ts",
	},
	outDir: "dist",
	format: "esm",
	platform: "neutral",
	target: "es2022",
	fixedExtension: false,
	clean: true,
	sourcemap: true,
	dts: { sourcemap: false },
	tsconfig: "./tsconfig.build.json",
	deps: {
		// Keep optional React outside the pure compiler and prevent private imports.
		onlyImport: ["cn", "react", "react-dom", "node:fs", "node:path", "node:crypto"],
	},
});
