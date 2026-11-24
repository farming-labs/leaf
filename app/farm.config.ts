import { defineConfig } from "@farm.js/core";
import { withDocs } from "@farming-labs/farmjs/config";
import { leaf } from "farm-leaf";

// withDocs() sees the leaf renderer and builds the docs pages with it: no React in the browser.
export default withDocs(
  defineConfig({
    renderer: leaf(),
    // Browser modules can import server functions: each call posts to the page.
    experimental: { serverActions: true },
    deploy: {
      target: "node",
    },
  }),
  {
    config: {
      entry: "/docs",
      nav: { title: "leaf docs" },
      metadata: { description: "leaf, a UI library Farm renders through farm-leaf." },
    },
  },
);
