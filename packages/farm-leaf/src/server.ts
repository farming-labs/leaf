// What Farm imports to render a route on the server.

import {
  renderToReadableStream as renderLeafToReadableStream,
  type RenderToReadableStreamOptions,
} from "leaf/server";

export { Fragment, Suspense, createElement, isValidElement } from "leaf";
export { renderToString } from "leaf/server";

/** leaf's stream, typed the way Farm calls it: with the route tree its createElement built. */
export const renderToReadableStream = renderLeafToReadableStream as (
  element: unknown,
  options?: RenderToReadableStreamOptions,
) => ReadableStream<Uint8Array>;

export const name = "leaf";
export const capabilities = { streaming: { node: false, web: true } } as const;
