import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests for pure, framework-free logic only (scoring, aggregation,
// validation schemas, and similar). Route/page/component behaviour is
// covered by the Playwright end-to-end suite in e2e/ instead - this
// config deliberately does not pull in Next.js or a DOM environment.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
