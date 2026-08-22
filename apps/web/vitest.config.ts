import { defineConfig } from 'vitest/config';

/**
 * Minimal Node-environment vitest config for the web app. This app had zero
 * automated test infrastructure before this pass — deliberately kept small:
 * it covers pure-function logic (next-param safety) and structural regression
 * checks (route-group layout separation), not component rendering. A real
 * component/E2E harness (React Testing Library / Playwright) is a genuine
 * follow-on investment, not invented here — see the auth-routing final report
 * for what's covered by live browser UAT instead.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
