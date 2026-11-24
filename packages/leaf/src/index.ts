// leaf: elements, components, and hooks. The DOM renderer lives in `leaf/dom` and the HTML
// renderer in `leaf/server`; both drive components through the hook dispatcher below.

export const Fragment: unique symbol = Symbol.for("leaf.fragment");

const ELEMENT: unique symbol = Symbol.for("leaf.element");

export type Key = string | number | bigint;
export type Ref<T> = { current: T | null } | ((value: T | null) => void);

export type Child = LeafElement | string | number | bigint | boolean | null | undefined;
export type Children = Child | readonly Children[];
export type Component<P = {}> = (props: P) => Children;
/** Renders on the server only: leaf/server waits for it, and the browser can't hydrate it. */
export type AsyncComponent<P = {}> = (props: P) => Promise<Children>;
export type ElementType = string | Component<any> | AsyncComponent<any> | typeof Fragment;

export interface LeafElement<P = any> {
  readonly $$typeof: typeof ELEMENT;
  readonly type: ElementType;
  readonly key: Key | null;
  readonly ref: Ref<unknown> | null;
  readonly props: P;
}

export function createElement(
  type: ElementType,
  props?: Record<string, unknown> | null,
  ...children: Children[]
): LeafElement {
  const { key, ref, ...rest } = (props ?? {}) as Record<string, unknown> & {
    key?: Key | null;
    ref?: Ref<unknown> | null;
  };
  if (children.length === 1) rest.children = children[0];
  else if (children.length > 1) rest.children = children;
  return { $$typeof: ELEMENT, type, key: key ?? null, ref: ref ?? null, props: rest };
}

export function isValidElement(value: unknown): value is LeafElement {
  return typeof value === "object" && value !== null && (value as LeafElement).$$typeof === ELEMENT;
}

/**
 * Renders its children. On the server it's also where leaf/server's stream sends what it has
 * before waiting on the async components inside. The stream is in order, so `fallback` never shows.
 */
export function Suspense(props: { children?: Children; fallback?: Children }): Children {
  return props.children ?? null;
}

/**
 * Flattens children into a list of elements and strings. `null`, `undefined`, and booleans are
 * dropped, so `cond && <X />` renders nothing; numbers become text, `0` included.
 */
export function toChildArray(
  children: Children,
  out: Array<LeafElement | string> = [],
): Array<LeafElement | string> {
  if (children == null || typeof children === "boolean") return out;
  if (Array.isArray(children)) {
    for (const child of children) toChildArray(child, out);
  } else if (isValidElement(children) && children.type === Fragment) {
    toChildArray(children.props.children, out);
  } else if (isValidElement(children)) {
    out.push(children);
  } else if (typeof children === "string" || typeof children === "number") {
    out.push(String(children));
  } else if (typeof children === "bigint") {
    out.push(String(children));
  } else {
    throw new TypeError(
      `leaf can't render ${Object.prototype.toString.call(children)} as a child; render an element, a string, or a number.`,
    );
  }
  return out;
}

export type SetState<T> = (next: T | ((previous: T) => T)) => void;
export type Effect = () => void | (() => void);

/** What a renderer implements so components can call hooks while it runs them. */
export interface Dispatcher {
  useState<T>(initial: T | (() => T)): [T, SetState<T>];
  useEffect(effect: Effect, deps?: readonly unknown[]): void;
  useRef<T>(initial: T): { current: T };
  useMemo<T>(compute: () => T, deps?: readonly unknown[]): T;
  useContext<T>(context: Context<T>): T;
}

/** A value the components below its `Provider` read with `useContext`. */
export interface Context<T> {
  readonly defaultValue: T;
  /** Gives the components below it `value`. */
  readonly Provider: ContextProvider<T>;
}

export interface ContextProvider<T> extends Component<{ value: T; children?: Children }> {
  readonly context: Context<T>;
}

// The renderer that is running a component installs a dispatcher for the duration of the call.
let dispatcher: Dispatcher | null = null;

export const internals = {
  render<P>(
    component: Component<P> | AsyncComponent<P>,
    props: P,
    nextDispatcher: Dispatcher,
  ): Children | Promise<Children> {
    const previous = dispatcher;
    dispatcher = nextDispatcher;
    try {
      return component(props);
    } finally {
      dispatcher = previous;
    }
  },
};

function current(hook: string): Dispatcher {
  if (!dispatcher) {
    throw new Error(`leaf: ${hook}() can only be called while a component renders.`);
  }
  return dispatcher;
}

export function useState<T>(initial: T | (() => T)): [T, SetState<T>] {
  return current("useState").useState(initial);
}

export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
): [S, (action: A) => void] {
  const [state, setState] = current("useReducer").useState(initial);
  return [state, (action) => setState((previous) => reducer(previous, action))];
}

export function useEffect(effect: Effect, deps?: readonly unknown[]): void {
  current("useEffect").useEffect(effect, deps);
}

export function useRef<T>(initial: T): { current: T } {
  return current("useRef").useRef(initial);
}

export function useMemo<T>(compute: () => T, deps: readonly unknown[]): T {
  return current("useMemo").useMemo(compute, deps);
}

/**
 * A value the components below its `Provider` read with `useContext`, without a prop at each
 * level. A component reads the value of the nearest Provider above it as it renders.
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const Provider = ((props: { value: T; children?: Children }) =>
    props.children ?? null) as ContextProvider<T>;
  const context: Context<T> = { defaultValue, Provider };
  (Provider as { context: Context<T> }).context = context;
  return context;
}

/** The value of the nearest `Provider` above the component, or the context's default. */
export function useContext<T>(context: Context<T>): T {
  return current("useContext").useContext(context);
}

export function useCallback<T extends (...args: any[]) => unknown>(
  callback: T,
  deps: readonly unknown[],
): T {
  return current("useCallback").useMemo(() => callback, deps);
}

export function depsChanged(
  previous: readonly unknown[] | null | undefined,
  next: readonly unknown[] | null | undefined,
): boolean {
  if (!previous || !next) return true;
  if (previous.length !== next.length) return true;
  return next.some((value, index) => !Object.is(value, previous[index]));
}
