import { defineConfig } from "@farm.js/core";
import { leaf } from "farm-leaf";

export default defineConfig({
  renderer: leaf(),
  routeRules: { "/streaming": { render: "dynamic", headers: { Vary: "Sec-Fetch-Dest" } } },
  experimental: {
    // Browser modules can import server functions: each call posts to the page.
    serverActions: true,
    // A client component rendered from a server page hydrates as its own island, through
    // farm-leaf/server's withIsland (`capabilities.islands`).
    serverComponents: { mode: "islands" },
  },
  deploy: {
    target: "node",
  },
});
