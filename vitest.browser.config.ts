import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Main quality CI uses Chromium. The separate release QA workflow exercises
// the identical browser suite in Firefox and WebKit without changing defaults.
const requestedBrowser = process.env.THROUGHLINE_QA_BROWSER ?? "chromium";
if (!["chromium", "firefox", "webkit"].includes(requestedBrowser)) {
	throw new Error("Unsupported Throughline QA browser: " + requestedBrowser);
}
const browser = requestedBrowser as "chromium" | "firefox" | "webkit";
const webkitExecutable = browser === "webkit" ? process.env.THROUGHLINE_QA_WEBKIT_EXECUTABLE : undefined;

export default defineConfig({
	optimizeDeps: { include: ["react", "react-dom/client", "react-dom/server", "mermaid/dist/mermaid.esm.min.mjs"] },
	test: {
		css: true,
		include: ["src/**/__tests__/**/*.browser.test.tsx"],
		name: "browser",
		browser: {
			enabled: true,
			provider: playwright(webkitExecutable ? { launchOptions: { executablePath: webkitExecutable } } : undefined),
			instances: [{ browser }],
		},
	},
});
