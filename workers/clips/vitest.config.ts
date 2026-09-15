import { defineConfig } from "vitest/config";

// Plain node environment: cors/passcode/tickets are pure Web-standard code
// (Request/Response/crypto are all available in Node), so there's no need
// for the Workers runtime pool here. Route handlers that actually touch R2
// bindings (Tasks 6/10) will need `@cloudflare/vitest-pool-workers` — not
// added yet, since nothing in this task exercises a binding.
export default defineConfig({
  test: {
    environment: "node",
  },
});
