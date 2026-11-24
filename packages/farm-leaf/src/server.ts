// What Farm imports to render a route on the server.

import {
  resolveFarmIsland,
  type FarmIslandReference,
  type FarmIslandScript,
} from "@farm.js/core/renderer";
import { Fragment, createContext, createElement, useContext, type Component } from "leaf";
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

// Whether a component renders inside a tree that hydrates as one root. There, a client component
// is part of that root rather than an island of its own.
const ClientGraph = createContext(false);

/** Farm marks a route's tree that hydrates as one root. */
export function wrapClientGraph(element: unknown): unknown {
  return createElement(ClientGraph.Provider, { value: true }, element as never);
}

/** And a page such a root keeps as server HTML, where client components are islands again. */
export function isolateServerPageGraph(element: unknown): unknown {
  return createElement(ClientGraph.Provider, { value: false }, element as never);
}

type Props = Record<string, unknown>;

function withoutClientAttributes(props: Props): Props {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith("client:")));
}

function script({ attributes, text }: FarmIslandScript) {
  // Farm escaped the text for a script element already.
  return createElement("script", { ...attributes, dangerouslySetInnerHTML: { __html: text } });
}

/**
 * Farm wraps each export of a "use client" module in the server graph with this. Rendered from
 * server output, the component starts an island: Farm's island element around it, and the
 * scripts that carry its props. The browser hydrates it with farm-leaf/client's hydrateRoot.
 */
export function withIsland(component: unknown, reference: FarmIslandReference): unknown {
  if (typeof component !== "function") return component;
  const Inner = component as Component<Props>;
  function Island(props: Props) {
    const island = useContext(ClientGraph) ? undefined : resolveFarmIsland(props, reference);
    if (!island) return createElement(Inner, withoutClientAttributes(props));
    return createElement(
      Fragment,
      null,
      ...island.values.map(script),
      createElement(island.element.tag, island.element.attributes, createElement(Inner, island.props)),
      script(island.script),
    );
  }
  return Island;
}
