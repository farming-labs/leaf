// leaf/server: renders an element tree to HTML, as a string or as a stream. Effects never run on
// the server and state keeps its initial value.
//
// Suspense boundaries can stream independently when the caller supplies a fallback.

import {
  Fragment,
  Suspense,
  internals,
  toChildArray,
  type Children,
  type Context,
  type Dispatcher,
  type LeafElement,
} from "./index.js";
import {
  RESERVED,
  VOID_ELEMENTS,
  attributeName,
  cssName,
  isEventProp,
  styleValue,
} from "./props.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

const serverDispatcher: Dispatcher = {
  useState: <T>(initial: T | (() => T)) =>
    [typeof initial === "function" ? (initial as () => T)() : initial, () => {}] as [T, () => void],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useMemo: (compute) => compute(),
  useContext: (context) => context.defaultValue,
};

/** The context values above a node: a chain of frames, null at the top. */
interface ContextScope {
  context: Context<unknown>;
  value: unknown;
  parent: ContextScope | null;
}

function dispatcherFor(scope: ContextScope | null): Dispatcher {
  if (!scope) return serverDispatcher;
  return {
    ...serverDispatcher,
    useContext<T>(context: Context<T>): T {
      for (let frame: ContextScope | null = scope; frame; frame = frame.parent) {
        if (frame.context === context) return frame.value as T;
      }
      return context.defaultValue;
    },
  };
}

function renderStyle(style: unknown): string {
  if (typeof style === "string") return style;
  return Object.entries(style as Record<string, unknown>)
    .filter(([, value]) => value != null && value !== false && value !== "")
    .map(([name, value]) => `${cssName(name)}:${styleValue(name, value)}`)
    .join(";");
}

function renderAttributes(type: string, props: Record<string, unknown>): string {
  let html = "";
  for (let [name, value] of Object.entries(props)) {
    if (RESERVED.has(name) || value == null || value === false || isEventProp(name, value))
      continue;
    if (typeof value === "function") continue;
    // An uncontrolled field starts from its default, as React renders it.
    if (name === "defaultValue") {
      if (type === "textarea" || "value" in props) continue;
      name = "value";
    } else if (name === "defaultChecked") {
      if ("checked" in props) continue;
      name = "checked";
    } else if (type === "textarea" && name === "value") {
      continue;
    }
    if (name === "style") {
      const css = renderStyle(value);
      if (css) html += ` style="${escapeHtml(css)}"`;
      continue;
    }
    if (typeof value === "object") continue;
    html +=
      value === true
        ? ` ${attributeName(name)}=""`
        : ` ${attributeName(name)}="${escapeHtml(value)}"`;
  }
  return html;
}

// The renderer is a generator. It yields HTML strings, FLUSH where a Suspense boundary starts,
// and the promise an async component returned; whoever drives it sends back the resolved output.
const FLUSH: unique symbol = Symbol("leaf.flush");

type Step = string | typeof FLUSH | Promise<Children>;
type Render = Generator<Step, void, Children>;

type Completion = { id: string; html: string; children: Task[] } | { error: unknown };
type Task = Promise<Completion>;
type Region = { tasks: Task[]; active(): boolean };

function* renderNode(
  node: LeafElement | string,
  scope: ContextScope | null,
  region?: Region,
): Render {
  if (typeof node === "string") {
    yield escapeHtml(node);
    return;
  }
  const { type, props } = node;
  if (type === Suspense) {
    if (region && props.fallback !== undefined) {
      const children: Task[] = [];
      const steps = renderChildren(props.children, scope, {
        tasks: children,
        active: region.active,
      });
      const content = collect(steps, steps.next(), "", region.active);
      if (typeof content === "string") {
        region.tasks.push(...children);
        yield content;
      } else {
        const id = "leaf-" + crypto.randomUUID();
        region.tasks.push(
          content.then(
            (html) => ({ id, html, children }),
            (error: unknown) => ({ error }),
          ),
        );
        yield `<template id="${id}"></template>`;
        yield* renderChildren(props.fallback, scope);
        yield `<template id="${id}-end"></template>`;
      }
      return;
    }
    yield FLUSH;
    yield* renderChildren(props.children, scope, region);
    return;
  }
  if (typeof type === "function") {
    // A context's Provider sets its value for everything it renders.
    const context = (type as { context?: Context<unknown> }).context;
    if (context) scope = { context, value: props.value, parent: scope };
    let output = internals.render(type, props, dispatcherFor(scope));
    if (isThenable(output)) output = yield output as Promise<Children>;
    yield* renderChildren(output as Children, scope, region);
    return;
  }
  if (type === Fragment) {
    yield* renderChildren(props.children, scope, region);
    return;
  }
  if (typeof type !== "string") {
    throw new TypeError(`leaf can't render an element whose type is ${String(type)}.`);
  }
  yield `<${type}${renderAttributes(type, props)}>`;
  if (VOID_ELEMENTS.has(type)) return;
  if (props.dangerouslySetInnerHTML) {
    yield String(props.dangerouslySetInnerHTML.__html ?? "");
  } else if (type === "textarea") {
    yield escapeHtml(props.value ?? props.defaultValue ?? "");
  } else {
    yield* renderChildren(props.children, scope, region);
  }
  yield `</${type}>`;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === "function";
}

function* renderChildren(
  children: Children,
  scope: ContextScope | null = null,
  region?: Region,
): Render {
  for (const child of toChildArray(children)) yield* renderNode(child, scope, region);
}

/** A synchronous subtree stays inline. Resume the same generator if a component suspends. */
function collect(
  steps: Render,
  step: IteratorResult<Step, void>,
  html: string,
  active: () => boolean,
): string | Promise<string> {
  while (!step.done) {
    const value = step.value;
    if (typeof value === "string") html += value;
    else if (value !== FLUSH) {
      return Promise.resolve(value).then((result) =>
        active() ? collect(steps, steps.next(result), html, active) : "",
      );
    }
    step = steps.next();
  }
  return html;
}

/** Drives the renderer from `step` on, awaiting async components. Yields one chunk per boundary. */
async function* renderChunks(
  steps: Render,
  step: IteratorResult<Step, void> = steps.next(),
  html = "",
): AsyncGenerator<string, void, undefined> {
  while (!step.done) {
    const value = step.value;
    if (value === FLUSH) {
      if (html) yield html;
      html = "";
      step = steps.next();
    } else if (typeof value === "string") {
      html += value;
      step = steps.next();
    } else {
      step = steps.next(await value);
    }
  }
  if (html) yield html;
}

/** The HTML as a string. Async components need the stream, which can wait for them. */
export function renderToString(element: Children): string {
  let html = "";
  for (const value of renderChildren(element)) {
    if (value === FLUSH) continue;
    if (typeof value !== "string") {
      // The render fails here with the error below; the component's own result goes unread.
      value.catch(() => {});
      throw new Error(
        "leaf can't render an async component to a string. Render it with renderToReadableStream(), which waits for it.",
      );
    }
    html += value;
  }
  return html;
}

export interface RenderToReadableStreamOptions {
  /** Set false for buffered HTML consumers that never execute reveal scripts. */
  progressive?: boolean;
  /** CSP nonce for the inline script that reveals a completed boundary. */
  nonce?: string;
  /** Reports a late error. A failed deferred boundary keeps its fallback while siblings finish. */
  onError?(error: unknown): void;
}

const encoder = new TextEncoder();

// The payload stays in a template. Only this fixed script runs, and it removes its own markers.
const REVEAL = `(() => {
  const script = document.currentScript;
  const payload = script.previousElementSibling;
  const id = payload.dataset.leafReveal;
  const start = document.getElementById(id);
  const end = document.getElementById(id + "-end");
  if (start && end && start.parentNode === end.parentNode) {
    const range = document.createRange();
    range.setStartBefore(start);
    range.setEndAfter(end);
    range.deleteContents();
    range.insertNode(payload.content);
  }
  payload.remove();
  script.remove();
})()`;

export function renderToReadableStream(
  element: Children,
  options?: RenderToReadableStreamOptions,
): ReadableStream<Uint8Array> {
  let active = true;
  const region: Region = { tasks: [], active: () => active };
  const shell = renderChunks(
    renderChildren(element, null, options?.progressive === false ? undefined : region),
  );
  const ready: Completion[] = [];
  let pending = 0;
  let wake: (() => void) | undefined;
  let shellDone = false;
  let started = false;

  function track(tasks: Task[]) {
    pending += tasks.length;
    for (const task of tasks)
      task.then((part) => {
        if (!active) return;
        ready.push(part);
        wake?.();
      });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!shellDone) {
          const part = await shell.next();
          if (!active) return;
          if (!part.done) {
            started = true;
            controller.enqueue(encoder.encode(part.value));
            return;
          }
          shellDone = true;
          track(region.tasks.splice(0));
        }
        while (pending) {
          if (!ready.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          wake = undefined;
          if (!active) return;
          const part = ready.shift()!;
          pending--;
          if ("error" in part) {
            options?.onError?.(part.error);
            continue;
          }
          track(part.children);
          const nonce = options?.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";
          controller.enqueue(
            encoder.encode(
              `<template data-leaf-reveal="${part.id}">${part.html}</template><script${nonce}>${REVEAL}</script>`,
            ),
          );
          return;
        }
        active = false;
        controller.close();
      } catch (error) {
        if (!active) return;
        active = false;
        if (!started) return controller.error(error);
        options?.onError?.(error);
        controller.close();
      }
    },
    cancel() {
      active = false;
      wake?.();
      void shell.return();
    },
  });
}
