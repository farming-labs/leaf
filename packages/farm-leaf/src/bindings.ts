// Farm's router, theme, server functions, and server queries as leaf hooks, plus a Link.
//
// Farm keeps that state in renderer-neutral stores (getSnapshot + subscribe). One hook,
// useFarmStore, turns any of them into leaf state; the rest are thin wrappers.

import { createElement, useEffect, useMemo, useState, type Children, type LeafElement } from "leaf";
import type { HTMLAttributes } from "leaf/jsx-runtime";
import {
  FARM_LINK_OPTION_KEYS,
  createRendererAction,
  createRendererQuery,
  createRendererRouter,
  createRendererTheme,
  resolveLinkAttributes,
  type DefaultRouteHref,
  type FarmAction,
  type FarmActionOptions,
  type FarmActionSnapshot,
  type FarmClientStore,
  type FarmLinkOptions,
  type FarmRendererQueryOptions,
  type FarmRendererQuerySnapshot,
  type FarmRendererRouter,
  type FarmRendererRouterOptions,
  type FarmRendererRouterSnapshot,
  type FarmRendererTheme,
} from "@farm.js/core/renderer-client";
import type { ServerFn } from "@farm.js/core/server-fn";
import type { ServerQuery } from "@farm.js/core/server-query";
import type { FarmThemeSnapshot } from "@farm.js/core/theme";

export function useFarmStore<T>(store: FarmClientStore<T>): T {
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());
  useEffect(() => {
    // Catch a change between the first render and the subscription.
    setSnapshot(() => store.getSnapshot());
    const unsubscribe = store.subscribe(() => setSnapshot(() => store.getSnapshot()));
    return unsubscribe;
  }, [store]);
  return snapshot;
}

export type LeafRouter = FarmRendererRouterSnapshot &
  Pick<FarmRendererRouter, "push" | "replace" | "refresh" | "prefetch" | "back" | "forward">;

export function useRouter(options?: FarmRendererRouterOptions): LeafRouter {
  const [router] = useState(() => createRendererRouter(options));
  return {
    ...useFarmStore(router),
    push: router.push,
    replace: router.replace,
    refresh: router.refresh,
    prefetch: router.prefetch,
    back: router.back,
    forward: router.forward,
  };
}

export function useTheme(): FarmThemeSnapshot &
  Pick<FarmRendererTheme, "setTheme" | "toggleTheme"> {
  const [theme] = useState(() => createRendererTheme());
  return { ...useFarmStore(theme), setTheme: theme.setTheme, toggleTheme: theme.toggleTheme };
}

export type LeafAction<TInput, TResult, TError extends Error = Error> = FarmActionSnapshot<
  TResult,
  TError
> &
  Pick<FarmAction<TInput, TResult, TError>, "submit" | "reset">;

/** A server function's call state: `submit()` calls it, and the snapshot has `pending`, `data`, and `error`. */
export function useAction<TInput, TResult, TError extends Error = Error>(
  target:
    | ServerFn<TInput, TResult, TError>
    | { readonly action: ServerFn<TInput, TResult, TError> },
  options?: FarmActionOptions<TInput, TResult, TError>,
): LeafAction<TInput, TResult, TError> {
  const [action] = useState(() => createRendererAction(target, options));
  return { ...useFarmStore(action), submit: action.submit, reset: action.reset };
}

export type LeafServerQuery<TData> = FarmRendererQuerySnapshot<TData> & {
  refetch(): Promise<TData>;
};

/**
 * A server query's result from Farm's browser cache. It reads after hydration, and reads again
 * when a server function invalidates its key.
 */
export function useServerQuery<TInput, TData>(
  query: ServerQuery<TInput, TData>,
  input: TInput,
  options?: FarmRendererQueryOptions,
): LeafServerQuery<TData> {
  // Inputs are serializable, since the browser posts them, so their JSON identifies a new read.
  const observer = useMemo(
    () => createRendererQuery(query, input, options),
    [query, JSON.stringify(input ?? null)],
  );
  useEffect(() => () => observer.dispose(), [observer]);
  return { ...useFarmStore(observer), refetch: observer.refetch };
}

export type LinkProps<
  TRoute extends string = DefaultRouteHref,
  THref extends string = string,
> = Omit<HTMLAttributes, "href"> & FarmLinkOptions<TRoute, THref> & { children?: Children };

/**
 * An anchor Farm's router navigates on the client. The router handles every
 * `a[data-farm-link]`, so a Link only has to render the attributes Farm resolves.
 */
export function Link<TRoute extends string = DefaultRouteHref, THref extends string = string>(
  props: LinkProps<TRoute, THref>,
): LeafElement {
  const options: Record<string, unknown> = {};
  const anchor: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if ((FARM_LINK_OPTION_KEYS as readonly string[]).includes(name)) options[name] = value;
    else anchor[name] = value;
  }
  return createElement("a", {
    ...anchor,
    ...resolveLinkAttributes(options as unknown as FarmLinkOptions),
  });
}
