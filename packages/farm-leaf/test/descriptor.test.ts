// @vitest-environment node

import type { FarmRendererRoute, FarmRendererRouteFile } from "@farm.js/core/renderer";
import { describe, expect, it } from "vitest";
import { leaf } from "../src/index.js";

function file(path: string): FarmRendererRouteFile {
  const segments = path.split("/");
  const base = segments.pop()!;
  const extension = base.slice(base.lastIndexOf("."));
  return { path, segments, name: base.slice(0, -extension.length), extension };
}

describe("leaf routes()", () => {
  // Farm's own folder routing stands in for `defaults`: it claims page.tsx and nothing else here.
  const folderPage: FarmRendererRoute = { kind: "page", pattern: "/about" };
  const resolve = async (path: string) => {
    const routes = await leaf().routes!({
      root: "/app",
      defaults: { resolve: (route) => (route.path === "about/page.tsx" ? folderPage : null) },
    });
    return routes.resolve(file(path));
  };

  it("keeps Farm's folder routes", async () => {
    expect(await resolve("about/page.tsx")).toBe(folderPage);
    expect(await resolve("about/notes.leaf")).toBeNull();
  });

  it("makes every .leaf file in guides/ a page, index.leaf the folder's own", async () => {
    expect(await resolve("guides/index.leaf")).toEqual({ kind: "page", pattern: "/guides" });
    expect(await resolve("guides/harvest.leaf")).toEqual({
      kind: "page",
      pattern: "/guides/harvest",
    });
    expect(await resolve("guides/[crop].leaf")).toEqual({
      kind: "page",
      pattern: "/guides/[crop]",
    });
  });

  it("lays guides/ out with _layout.leaf and skips other _ files", async () => {
    expect(await resolve("guides/_layout.leaf")).toEqual({ kind: "layout", pattern: "/guides" });
    expect(await resolve("guides/_tip.leaf")).toBeNull();
    expect(await resolve("guides/notes.tsx")).toBeNull();
  });

  it("hydrates a .client page", async () => {
    expect(await resolve("guides/watering.client.leaf")).toEqual({
      kind: "page",
      pattern: "/guides/watering",
      hydrate: true,
    });
  });
});

describe("leaf hydration.resolve()", () => {
  const read = (source: string) =>
    leaf().hydration!.resolve!(source, "/app/src/app/guides/harvest.leaf");

  it("reads the // @hydrate pragma", () => {
    expect(read("<script module>\n// @hydrate\n</script>")).toEqual({ hydrate: true });
    expect(read("<script module>\n  // @hydrate visible\n</script>")).toEqual({
      hydrate: true,
      strategy: "visible",
    });
    expect(read("// @hydrate false")).toEqual({ hydrate: false });
  });

  it("says nothing without one, or for a strategy leaf doesn't know", () => {
    expect(read("<section>Static</section>")).toBeUndefined();
    expect(read("// @hydrate soon")).toBeUndefined();
    expect(read("const note = '// @hydrate';")).toBeUndefined();
  });
});
