# leaf

**A tiny library for web user interfaces, and the adapter that runs it on [Farm.js](https://farmjs.dev).**

leaf is a small client UI library in the React mold: components are functions, state lives in hooks, and JSX describes the UI. It renders to HTML on the server, streams, and hydrates in the browser, in about 1,000 lines of TypeScript. It knows nothing about Farm.

```tsx
import { useState } from "leaf";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((n) => n + 1)}>Clicked {count} times</button>;
}
```

If you maintain a client UI library like this, React-like or not, this repo is the shortest path to running it on Farm. `farm-leaf` is the adapter that plugs leaf in, and `app/` is a Farm app that leaf renders: server rendering, hydration, client navigation, server functions, its own file format, and streaming.

[Bring your own renderer](https://farmjs.dev/blog/bring-your-own-renderer) builds this adapter step by step. This repo is the code it walks through.

```bash
pnpm install      # also compiles packages/* to dist/
pnpm dev          # the app on http://localhost:3000
pnpm test         # farm-leaf against Farm's renderer conformance suite
pnpm test:e2e     # the app in Chrome, as a production build
pnpm test:e2e:dev # the same tests against farm dev
```

## What's where

| Path                                 | What it is                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `packages/leaf/src/index.ts`         | The UI library: elements, components, and hooks. No Farm code in the package.                |
| `packages/leaf/src/dom.ts`           | `createRoot` and `hydrateRoot`: mounts, patches, and hydrates in the browser                 |
| `packages/leaf/src/server.ts`        | `renderToString` and `renderToReadableStream`                                                |
| `packages/farm-leaf/src/index.ts`    | The descriptor: `renderer: leaf()` in `farm.config.ts`                                       |
| `packages/farm-leaf/src/server.ts`   | Six named exports Farm renders routes with on the server, plus `renderToReadableStream`      |
| `packages/farm-leaf/src/client.ts`   | `createElement`, `Suspense`, `createRoot`, and `hydrateRoot` for the browser                 |
| `packages/farm-leaf/src/vite.ts`     | The Vite plugin: JSX against leaf, and the `.leaf` file compiler                             |
| `packages/farm-leaf/src/bindings.ts` | `useRouter`, `useTheme`, `useAction`, `useServerQuery`, and `Link` over Farm's client stores |
| `packages/farm-leaf/test`            | `@farm.js/renderer-tests` suites and a type-check against Farm's contract                    |
| `app/src/ui/toggle.tsx`              | A [ui-sdk](https://ui-sdk.dev) primitive rendered as a leaf component                        |
| `app/src/app/ui/web/page.tsx`        | The same toggle as a ui-sdk web component                                                    |

Both packages are TypeScript, compiled by `tsc` to `dist/`, the same shape you'd publish to npm. `pnpm install` builds them through the root `prepare` script; after you edit one, run `pnpm build:packages`.

## Make it yours

1. Copy `packages/farm-leaf`.
2. Point its imports at your library instead of `leaf`: `createElement`, `Fragment`, `Suspense`, `isValidElement`, `renderToString`, `createRoot`, and `hydrateRoot`. Keep `createRoot()` replacing what's already in its container, as the wrapper in `src/client.ts` does, or drop `hydrationFallback` from `src/index.ts`. If your library doesn't stream, drop `renderToReadableStream` and set `streaming.web` to `false` in `src/index.ts` and `src/server.ts`.
3. Rename the descriptor and the module ids in `src/index.ts`.
4. Run `pnpm test`. The conformance suite and the contract type-check tell you what's missing.

## What it doesn't do

- leaf streams in order: a `<Suspense>` boundary sends what came before it, then waits for the async components inside. It never shows `fallback`, and async components render on the server only, so a page that has one doesn't hydrate.
- leaf matches children by position and has no keys, so reordering a list re-renders its items.
- leaf has no refs, so the ui-sdk toggle skips the parts of ui-sdk that need the DOM element, such as focus management in toggle groups.
- `@ui-sdk/core/renderer`, which the leaf toggle uses, is ui-sdk's undocumented adapter entry. It can change in any release, so the versions here are pinned.
- React Server Components are React-only.

## License

MIT
