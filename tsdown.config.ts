import { defineConfig } from "tsdown";

/**
 * Keep these three JS + declaration entry paths aligned with package exports.
 * The CSS remains an explicit, consumer-loaded source asset.
 */
export default defineConfig({
	entry: {
		index: "src/index.ts",
		"react/index": "src/react/index.ts",
		examples: "src/examples.ts",
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
		onlyImport: ["cn", "react", "react-dom"],
	},
});
