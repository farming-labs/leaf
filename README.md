# leaf

**A tiny library for web user interfaces, and the adapter that runs it on [Farm.js](https://farmjs.dev).**

leaf is a small client UI library. You write components as `.leaf` files: HTML with `{{ values }}`, `@events`, and `<leaf:if>` and `<leaf:for>` tags, plus a script that keeps state in hooks. leaf renders to HTML on the server, streams, and hydrates in the browser, in about 1,000 lines of TypeScript. It knows nothing about Farm.

```html
<!-- counter.leaf -->
<script>
  import { useState } from "leaf";
  const [count, setCount] = useState(0);
</script>

<button @click="setCount((n) => n + 1)">Clicked {{ count }} times</button>
```

If you maintain a client UI library like this, React-like or not, this repo is the shortest path to running it on Farm. `farm-leaf` is the adapter that plugs leaf in, and `app/` is a Farm app that leaf renders: server rendering, hydration, islands, client navigation, server functions, its own file format, and streaming.

[Bring your own renderer](https://farmjs.dev/blog/bring-your-own-renderer) builds this adapter step by step. This repo is the code it walks through.

```bash
pnpm install      # also compiles packages/* to dist/
pnpm dev          # the app on http://localhost:3000
pnpm test         # farm-leaf against Farm's renderer conformance suite
pnpm test:e2e     # the app in Chrome, as a production build
pnpm test:e2e:dev # the same tests against farm dev
```

## What's where

| Path                                 | What it is                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `packages/leaf/src/index.ts`         | The UI library: elements, components, and hooks. No Farm code in the package.                        |
| `packages/leaf/src/dom.ts`           | `createRoot` and `hydrateRoot`: mounts, patches, and hydrates in the browser                         |
| `packages/leaf/src/server.ts`        | `renderToString` and `renderToReadableStream`                                                        |
| `packages/farm-leaf/src/index.ts`    | The descriptor: `renderer: leaf()` in `farm.config.ts`                                               |
| `packages/farm-leaf/src/server.ts`   | Six named exports Farm renders routes with on the server, `renderToReadableStream`, and `withIsland` |
| `packages/farm-leaf/src/client.ts`   | `createElement`, `Suspense`, `createRoot`, and `hydrateRoot` for the browser                         |
| `packages/farm-leaf/src/vite.ts`     | The Vite plugin: compiles `.leaf` files, and JSX in `.tsx` files, against leaf                       |
| `packages/farm-leaf/src/compile.ts`  | The `.leaf` compiler: markup in, a module whose default export is the component out                  |
| `packages/farm-leaf/src/bindings.ts` | `useRouter`, `useTheme`, `useAction`, `useServerQuery`, and `Link` over Farm's client stores         |
| `packages/farm-leaf/test`            | `@farm.js/renderer-tests` suites and a type-check against Farm's contract                            |
| `app/src/app/**/*.leaf`              | Every page but `ui/` and `islands/`: layout, pages, error and not-found pages, in leaf's own format  |
| `app/src/app/islands/page.tsx`       | A server page whose client components hydrate as islands, each when its `client:*` says              |
| `app/src/ui/toggle.tsx`              | A [ui-sdk](https://ui-sdk.dev) primitive rendered as a leaf component, in JSX                        |
| `app/src/app/ui/web/page.tsx`        | The same toggle as a ui-sdk web component                                                            |

Both packages are TypeScript, compiled by `tsc` to `dist/`, the same shape you'd publish to npm. `pnpm install` builds them through the root `prepare` script; after you edit one, run `pnpm build:packages`.

## .leaf files

A `.leaf` file is one component, and its markup is HTML. `farm-leaf/vite` compiles it to a module whose default export is that component, so Farm treats `page.leaf` and `layout.leaf` as routes like any other.

| Write                                                               | For                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `<script module>`                                                   | Module scope: imports, and exports such as `hydrate`, `metadata`, `generateMetadata`   |
| `<script>`                                                          | Runs on every render, with `props` in scope. A script that uses `await` makes an async component |
| `{{ expression }}`                                                  | A value, in text or in an attribute: `href="/crops/{{ crop }}"`                        |
| `@click="statement"`                                                | An event handler with `event` in scope. `@click="save"` passes the `save` function itself |
| `<leaf:if test="...">`, `<leaf:else-if test="...">`, `<leaf:else>` | Markup that depends on a condition                                                     |
| `<leaf:for each="crop" in="crops" index="i">`                       | Markup repeated for each item                                                          |

Attributes keep their HTML names, such as `class` and `for`. A component is a capitalized tag, such as `<Badge label="new" />`, and a layout renders its page with `{{ props.children }}`. A mistake fails the build with the file, the line, and the fix:

```
notes/page.leaf:18: `onClick={...}` is JSX. In a .leaf file, write `@click="..."` for an event and `onClick="{{ value }}"` for a value.
```

`.tsx` files with JSX work too, as `app/src/app/ui/` shows.

## Its own route files

Most of `app/src/app` uses Farm's folders: `about/page.leaf` is `/about`. `app/src/app/guides/` uses flat files instead, mapped by `routes()` in `packages/farm-leaf/src/index.ts`:

- `index.leaf` is `/guides`, `harvest.leaf` is `/guides/harvest`, and `[crop].leaf` is a dynamic page.
- `_layout.leaf` lays the folder out, and other files that start with `_` are components, not pages.
- `watering.client.leaf` hydrates: the `.client` rule says so.

`hydration.resolve()` in the same file reads leaf's own syntax: `// @hydrate` in a `.leaf` file's module script hydrates it, `// @hydrate visible` (or `load`, `idle`, `interaction`) also says when, and `// @hydrate false` keeps it static. `harvest.leaf` uses it.

## Make it yours

1. Copy `packages/farm-leaf`.
2. Point its imports at your library instead of `leaf`: `createElement`, `Fragment`, `Suspense`, `isValidElement`, `renderToString`, `createRoot`, and `hydrateRoot`. Keep `createRoot()` replacing what's already in its container, as the wrapper in `src/client.ts` does, or drop `hydrationFallback` from `src/index.ts`. If your library doesn't stream, drop `renderToReadableStream` and set `streaming.web` to `false` in `src/index.ts` and `src/server.ts`.
3. Rename the descriptor and the module ids in `src/index.ts`. `routes()` and `hydration` there are optional: drop them to keep Farm's folders and its `export const hydrate`.
4. Run `pnpm test`. The conformance suite and the contract type-check tell you what's missing.
5. For islands, keep `withIsland`, `wrapClientGraph` and `isolateServerPageGraph` in `src/server.ts`. They need a context in your library, as `createContext` is in leaf. Otherwise drop them and `islands` from `src/index.ts`. See [Islands](https://farmjs.dev/docs/renderers/custom#islands).

## What it doesn't do

- leaf streams in order: a `<Suspense>` boundary sends what came before it, then waits for the async components inside. It never shows `fallback`, and async components render on the server only, so a page that has one doesn't hydrate.
- leaf matches children by position and has no keys, so reordering a list re-renders its items.
- leaf has no refs, so the ui-sdk toggle skips the parts of ui-sdk that need the DOM element, such as focus management in toggle groups.
- `@ui-sdk/core/renderer`, which the leaf toggle uses, is ui-sdk's undocumented adapter entry. It can change in any release, so the versions here are pinned.
- React Server Components are React-only.
- TypeScript doesn't check `.leaf` files: it can't read the markup. Their scripts may use TypeScript syntax, which the compiler strips. Write code that needs type-checking in `.ts` or `.tsx` files.

## License

MIT
