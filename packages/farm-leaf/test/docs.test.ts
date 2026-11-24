// @vitest-environment jsdom

import { defineFarmDocsRendererConformance } from "@farming-labs/farmjs/testing";
import * as client from "../src/client.js";
import * as server from "../src/server.js";

// withDocs() builds an app's docs pages with its renderer, so leaf must write and hydrate them.
defineFarmDocsRendererConformance({ name: "leaf", server, client });
