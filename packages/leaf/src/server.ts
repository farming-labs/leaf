// leaf/server: renders an element tree to HTML, as a string or as a stream. Effects never run on
// the server and state keeps its initial value.
//
// A component may be async in the stream. It sends everything before each <Suspense> boundary as
// soon as it's rendered, then waits for the async components inside it, in order.

import {
  Fragment,
  Suspense,
  internals,
  toChildArray,
  type Children,
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
};

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

function* renderNode(node: LeafElement | string): Render {
  if (typeof node === "string") {
    yield escapeHtml(node);
    return;
  }
  const { type, props } = node;
  if (type === Suspense) {
    yield FLUSH;
    yield* renderChildren(props.children);
    return;
  }
  if (typeof type === "function") {
    let output = internals.render(type, props, serverDispatcher);
    if (isThenable(output)) output = yield output as Promise<Children>;
    yield* renderChildren(output as Children);
    return;
  }
  if (type === Fragment) {
    yield* renderChildren(props.children);
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
    yield* renderChildren(props.children);
  }
  yield `</${type}>`;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === "function";
}

function* renderChildren(children: Children): Render {
  for (const child of toChildArray(children)) yield* renderNode(child);
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
  /** Called with an error thrown after the first chunk went out; the stream then ends. */
  onError?(error: unknown): void;
}

const encoder = new TextEncoder();

/** The HTML as a Web stream: everything before a Suspense boundary goes out before what's in it. */
export function renderToReadableStream(
  element: Children,
  options?: RenderToReadableStreamOptions,
): ReadableStream<Uint8Array> {
  const chunks = renderChunks(renderChildren(element));
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let result: IteratorResult<string, void>;
      try {
        result = await chunks.next();
      } catch (error) {
        // Before any output, the error decides the status. After it, the status is already
        // sent, so report the error and end the document.
        if (!started) return controller.error(error);
        options?.onError?.(error);
        return controller.close();
      }
      if (result.done) return controller.close();
      started = true;
      controller.enqueue(encoder.encode(result.value));
    },
    async cancel() {
      await chunks.return();
    },
  });
}
