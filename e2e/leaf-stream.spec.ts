import { createServer } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { expect, test } from "@playwright/test";
import { Suspense, createElement as h, type Children } from "../packages/leaf/dist/index.js";
import { renderToReadableStream } from "../packages/leaf/dist/server.js";

test("the browser reveals independent siblings in completion order at their original positions", async ({
  page,
}) => {
  const first = Promise.withResolvers<Children>();
  const second = Promise.withResolvers<Children>();
  const server = createServer((_req, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "script-src 'nonce-test-stream'",
    });
    const tree = h(
      "main",
      null,
      h(
        Suspense,
        { fallback: "Loading first" },
        h(() => first.promise),
      ),
      h(
        Suspense,
        { fallback: "Loading second" },
        h(() => second.promise),
      ),
    );
    Readable.from(renderToReadableStream(tree, { nonce: "test-stream" })).pipe(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener.");
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "commit" });
    const main = page.locator("main");
    await expect(main).toHaveText("Loading firstLoading second");
    second.resolve(h("p", null, "Second"));
    await expect(main).toHaveText("Loading firstSecond");
    first.resolve(h("p", null, "First"));
    await expect(main.locator("p")).toHaveText(["First", "Second"]);
    await expect(page.locator("template, script")).toHaveCount(0);
  } finally {
    first.resolve(null);
    second.resolve(null);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
