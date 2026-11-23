# leaf

**A small UI library, and the adapter that makes it a [Farm.js](https://farmjs.dev) renderer. Copy the adapter to plug in your own library.**

leaf looks like React if you squint: elements, function components, hooks, a DOM patcher that hydrates server markup, and an HTML renderer that streams. It knows nothing about Farm. `farm-leaf` is the adapter that plugs it in, and `app/` is a Farm app that leaf renders.

[Bring your own renderer](https://farmjs.dev/blog/bring-your-own-renderer) builds this adapter step by step. This repo is the code it walks through.

```bash
pnpm install
pnpm dev          # the app on http://localhost:3000
pnpm test         # farm-leaf against Farm's renderer conformance suite
pnpm test:e2e     # the app in Chrome, as a production build
pnpm test:e2e:dev # the same tests against farm dev
```

## What's where

| Path                                 | What it is                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `packages/leaf`                      | The UI library. No Farm code in it.                                                          |
| `packages/farm-leaf/src/index.js`    | The descriptor: `renderer: leaf()` in `farm.config.ts`                                       |
| `packages/farm-leaf/src/server.js`   | Six named exports Farm renders routes with on the server, plus `renderToReadableStream`      |
| `packages/farm-leaf/src/client.js`   | `createElement`, `Suspense`, `createRoot`, and `hydrateRoot` for the browser                 |
| `packages/farm-leaf/src/vite.js`     | The Vite plugin: JSX against leaf, and the `.leaf` file compiler                             |
| `packages/farm-leaf/src/bindings.js` | `useRouter`, `useTheme`, `useAction`, `useServerQuery`, and `Link` over Farm's client stores |
| `packages/farm-leaf/test`            | `@farm.js/renderer-tests` suites and a type-check against Farm's contract                    |
| `app/src/ui/toggle.tsx`              | A [ui-sdk](https://ui-sdk.dev) primitive rendered as a leaf component                        |
| `app/src/app/ui/web/page.tsx`        | The same toggle as a ui-sdk web component                                                    |

Both packages are plain JavaScript with `.d.ts` files, so neither needs a build step.

## Make it yours

1. Copy `packages/farm-leaf`.
2. Point its imports at your library instead of `leaf`: `createElement`, `Fragment`, `Suspense`, `isValidElement`, `renderToString`, `createRoot`, and `hydrateRoot`. If your library doesn't stream, drop `renderToReadableStream` and set `streaming.web` to `false` in `src/index.js` and `src/server.js`.
3. Rename the descriptor and the module ids in `src/index.js`.
4. Run `pnpm test`. The conformance suite and the contract type-check tell you what's missing.

## What it doesn't do

- leaf streams in order: a `<Suspense>` boundary sends what came before it, then waits for the async components inside. It never shows `fallback`, and async components render on the server only, so a page that has one doesn't hydrate.
- leaf matches children by position and has no keys, so reordering a list re-renders its items.
- leaf has no refs, so the ui-sdk toggle skips the parts of ui-sdk that need the DOM element, such as focus management in toggle groups.
- `@ui-sdk/core/renderer`, which the leaf toggle uses, is ui-sdk's undocumented adapter entry. It can change in any release, so the versions here are pinned.
- React Server Components are React-only.

## License

MIT
