// leaf/dom: mounts, patches, and hydrates an element tree in the browser.
//
// Keyed siblings retain their instances across moves. Unkeyed siblings match by position. A state change
// re-renders its component in a microtask, and effects run after each commit.

import {
  Fragment,
  depsChanged,
  internals,
  toChildArray,
  type Children,
  type Component,
  type Key,
  type Context,
  type Dispatcher,
  type Effect,
  type LeafElement,
  type Ref,
  type SetState,
} from "./index.js";
import { RESERVED, attributeName, cssName, eventName, isEventProp, styleValue } from "./props.js";

export interface Root {
  render(element: Children): void;
  unmount(): void;
}

// ---------------------------------------------------------------------------------------------
// Instances: text, host (a DOM element), component, and root.

type Props = Record<string, any>;
type VNode = LeafElement | string;

interface TextInstance {
  kind: "text";
  text: string;
  node: Text;
  parent: ParentInstance;
  depth: number;
  mounted: boolean;
}

interface HostInstance {
  kind: "host";
  key: Key | null;
  type: string;
  props: Props;
  node: HTMLElement;
  ref: Ref<unknown> | null;
  parent: ParentInstance;
  depth: number;
  children: Instance[];
  mounted: boolean;
}

interface ComponentInstance {
  kind: "component";
  key: Key | null;
  type: Component<any> | typeof Fragment;
  props: Props;
  parent: ParentInstance;
  depth: number;
  children: Instance[];
  hooks: Hook[];
  mounted: boolean;
}

interface RootInstance {
  kind: "root";
  node: Element;
  children: Instance[];
  depth: 0;
}

type Instance = TextInstance | HostInstance | ComponentInstance;
type ParentInstance = HostInstance | ComponentInstance | RootInstance;

interface StateHook {
  state: unknown;
  set: SetState<unknown>;
  cleanup?: undefined;
}
interface EffectHook {
  deps: readonly unknown[] | null | undefined;
  cleanup: (() => void) | undefined;
}
interface RefHook {
  current: unknown;
  cleanup?: undefined;
}
interface MemoHook {
  deps: readonly unknown[] | null | undefined;
  value: unknown;
  cleanup?: undefined;
}
type Hook = StateHook | EffectHook | RefHook | MemoHook;

function domNodes(instance: Instance, out: ChildNode[] = []): ChildNode[] {
  if (instance.kind === "text" || instance.kind === "host") out.push(instance.node);
  else for (const child of instance.children) domNodes(child, out);
  return out;
}

function hostParent(instance: Instance): HostInstance | RootInstance {
  let parent = instance.parent;
  while (parent.kind === "component") parent = parent.parent;
  return parent;
}

/** Puts a host's child nodes in order, leaving nodes leaf doesn't own after them. */
function placeChildren(host: HostInstance | RootInstance): void {
  const parent = host.node as Element & { moveBefore?(node: Node, before: Node | null): void };
  let cursor = parent.firstChild;
  for (const child of host.children) {
    for (const node of domNodes(child)) {
      if (node === cursor) cursor = cursor.nextSibling;
      else if (node.parentNode === parent && parent.moveBefore) parent.moveBefore(node, cursor);
      else parent.insertBefore(node, cursor);
    }
  }
}

function sameType(instance: Instance, vnode: VNode): boolean {
  if (typeof vnode === "string") return instance.kind === "text";
  return instance.kind !== "text" && instance.type === vnode.type;
}

function elementType(vnode: LeafElement): "component" | "host" {
  const { type } = vnode;
  if (type === Fragment || typeof type === "function") return "component";
  if (typeof type === "string") return "host";
  throw new TypeError(`leaf can't render an element whose type is ${String(type)}.`);
}

// ---------------------------------------------------------------------------------------------
// Props.

type ListenerNode = HTMLElement & {
  __leafListeners?: Record<string, ((event: Event) => void) | undefined>;
};

function setRef(ref: Ref<unknown> | null | undefined, value: unknown): void {
  if (typeof ref === "function") ref(value);
  else if (ref && typeof ref === "object") ref.current = value;
}

let pendingRefs: Array<() => void> = [];

function attachRef(instance: HostInstance) {
  const ref = instance.ref;
  if (ref)
    pendingRefs.push(() => {
      if (instance.mounted && instance.ref === ref) setRef(ref, instance.node);
    });
}

function commit(place: () => void) {
  const previous = pendingRefs;
  pendingRefs = [];
  try {
    place();
    for (const attach of pendingRefs) attach();
  } finally {
    pendingRefs = previous;
  }
  flushEffects();
}

function setStyle(node: HTMLElement, next: unknown, previous: unknown): void {
  if (typeof next === "string" || next == null) {
    node.style.cssText = (next as string | null | undefined) ?? "";
    return;
  }
  if (previous && typeof previous === "object") {
    for (const name of Object.keys(previous)) {
      if (!(name in (next as object))) node.style.removeProperty(cssName(name));
    }
  } else if (typeof previous === "string") {
    node.style.cssText = "";
  }
  for (const [name, value] of Object.entries(next as Record<string, unknown>)) {
    const css = value == null || value === false ? "" : String(styleValue(name, value));
    if (name.startsWith("--")) node.style.setProperty(name, css);
    else (node.style as unknown as Record<string, string>)[name] = css;
  }
}

function setListener(
  node: ListenerNode,
  name: string,
  handler: ((event: Event) => void) | undefined,
): void {
  const event = eventName(name, node.localName);
  const listeners = (node.__leafListeners ??= {});
  if (handler && !(event in listeners)) {
    node.addEventListener(event, (domEvent) => listeners[event]?.(domEvent));
  }
  listeners[event] = handler;
}

function setProp(
  node: HTMLElement,
  name: string,
  next: unknown,
  previous: unknown,
  hydrating: boolean,
): void {
  if (RESERVED.has(name)) return;
  if (isEventProp(name, next) || isEventProp(name, previous)) {
    setListener(
      node,
      name,
      typeof next === "function" ? (next as (event: Event) => void) : undefined,
    );
    return;
  }
  if (name === "style") {
    if (!hydrating) setStyle(node, next, previous);
    return;
  }
  const live = node as unknown as Record<string, unknown>;
  if (name === "value" || name === "checked" || name === "selected") {
    // Live properties; what the user typed before hydration stays.
    if (!hydrating && live[name] !== next) live[name] = next ?? (name === "value" ? "" : false);
    return;
  }
  if (name === "defaultValue" || name === "defaultChecked") {
    if (previous === undefined && !hydrating) live[name] = next;
    return;
  }
  if (typeof next === "function") return;
  const attribute = attributeName(name);
  if (next == null || next === false) node.removeAttribute(attribute);
  else {
    const value = next === true ? "" : String(next);
    if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
  }
}

function patchProps(node: HTMLElement, next: Props, previous: Props, hydrating = false): void {
  for (const name of Object.keys(previous)) {
    if (!(name in next)) setProp(node, name, undefined, previous[name], hydrating);
  }
  for (const [name, value] of Object.entries(next)) {
    if (value !== previous[name]) setProp(node, name, value, previous[name], hydrating);
  }
  const html = next.dangerouslySetInnerHTML?.__html;
  if (html !== undefined && html !== previous.dangerouslySetInnerHTML?.__html && !hydrating) {
    node.innerHTML = html;
  }
}

// ---------------------------------------------------------------------------------------------
// Components and hooks.

let pendingEffects: Array<{ hook: EffectHook; effect: Effect; instance: ComponentInstance }> = [];
const dirty = new Set<ComponentInstance>();
let flushQueued = false;

function createDispatcher(instance: ComponentInstance): Dispatcher {
  let index = 0;
  const slot = <H extends Hook>(create: () => H): H => {
    const position = index++;
    if (position >= instance.hooks.length) instance.hooks.push(create());
    return instance.hooks[position] as H;
  };
  return {
    useState<T>(initial: T | (() => T)): [T, SetState<T>] {
      const hook = slot<StateHook>(() => {
        const created: StateHook = {
          state: typeof initial === "function" ? (initial as () => T)() : initial,
          set: (action) => {
            const next =
              typeof action === "function"
                ? (action as (previous: unknown) => unknown)(created.state)
                : action;
            if (Object.is(next, created.state)) return;
            created.state = next;
            schedule(instance);
          },
        };
        return created;
      });
      return [hook.state as T, hook.set as SetState<T>];
    },
    useEffect(effect, deps) {
      const hook = slot<EffectHook>(() => ({ deps: undefined, cleanup: undefined }));
      if (hook.deps === undefined || depsChanged(hook.deps, deps)) {
        hook.deps = deps ?? null;
        pendingEffects.push({ hook, effect, instance });
      }
    },
    useRef<T>(initial: T): { current: T } {
      return slot<RefHook>(() => ({ current: initial })) as { current: T };
    },
    useMemo<T>(compute: () => T, deps?: readonly unknown[]): T {
      const hook = slot<MemoHook>(() => ({ deps: undefined, value: undefined }));
      if (hook.deps === undefined || depsChanged(hook.deps, deps)) {
        hook.deps = deps ?? null;
        hook.value = compute();
      }
      return hook.value as T;
    },
    useContext<T>(context: Context<T>): T {
      for (let parent = instance.parent; parent.kind !== "root"; parent = parent.parent) {
        if (parent.kind === "component" && parent.type === context.Provider) {
          return parent.props.value as T;
        }
      }
      return context.defaultValue;
    },
  };
}

function renderComponent(instance: ComponentInstance): VNode[] {
  if (instance.type === Fragment) return toChildArray(instance.props.children);
  const output = internals.render(instance.type, instance.props, createDispatcher(instance));
  if (output && typeof (output as PromiseLike<unknown>).then === "function") {
    throw new Error(
      `leaf can't render async components in the browser: ${instance.type.name || "a component"} returned a promise. Async components render on the server, so use them in a page or layout that doesn't hydrate.`,
    );
  }
  return toChildArray(output as Children);
}

function flushEffects(): void {
  const effects = pendingEffects;
  pendingEffects = [];
  for (const { hook, effect, instance } of effects) {
    if (!instance.mounted) continue;
    hook.cleanup?.();
    const cleanup = effect();
    hook.cleanup = typeof cleanup === "function" ? cleanup : undefined;
  }
}

function schedule(instance: ComponentInstance): void {
  dirty.add(instance);
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(flushUpdates);
}

function flushUpdates(): void {
  flushQueued = false;
  const queue = [...dirty].sort((left, right) => left.depth - right.depth);
  dirty.clear();
  commit(() => {
    for (const instance of queue) {
      if (!instance.mounted) continue;
      instance.children = reconcileChildren(instance, instance.children, renderComponent(instance));
      placeChildren(hostParent(instance));
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Mounting, patching, and unmounting.

function textInstance(text: string, node: Text, parent: ParentInstance): TextInstance {
  return { kind: "text", text, node, parent, depth: parent.depth + 1, mounted: true };
}

function hostInstance(vnode: LeafElement, node: HTMLElement, parent: ParentInstance): HostInstance {
  return {
    kind: "host",
    key: vnode.key,
    type: vnode.type as string,
    props: vnode.props,
    node,
    ref: vnode.ref,
    parent,
    depth: parent.depth + 1,
    children: [],
    mounted: true,
  };
}

function componentInstance(vnode: LeafElement, parent: ParentInstance): ComponentInstance {
  return {
    kind: "component",
    key: vnode.key,
    type: vnode.type as Component<any>,
    props: vnode.props,
    parent,
    depth: parent.depth + 1,
    children: [],
    hooks: [],
    mounted: true,
  };
}

function mount(vnode: VNode, parent: ParentInstance): Instance {
  if (typeof vnode === "string") return textInstance(vnode, document.createTextNode(vnode), parent);
  if (elementType(vnode) === "host") {
    const node = document.createElement(vnode.type as string);
    const instance = hostInstance(vnode, node, parent);
    patchProps(node, vnode.props, {});
    if (vnode.props.dangerouslySetInnerHTML == null) {
      instance.children = toChildArray(vnode.props.children).map((child) => mount(child, instance));
      for (const child of instance.children) for (const dom of domNodes(child)) node.append(dom);
    }
    attachRef(instance);
    return instance;
  }
  const instance = componentInstance(vnode, parent);
  instance.children = renderComponent(instance).map((child) => mount(child, instance));
  return instance;
}

function update(instance: Instance, vnode: VNode): void {
  if (instance.kind === "text") {
    const text = vnode as string;
    if (instance.text !== text) instance.node.data = instance.text = text;
    return;
  }
  const element = vnode as LeafElement;
  const previous = instance.props;
  instance.props = element.props;
  if (instance.kind === "component") {
    instance.children = reconcileChildren(instance, instance.children, renderComponent(instance));
    return;
  }
  patchProps(instance.node, element.props, previous);
  if (element.props.dangerouslySetInnerHTML == null) {
    if (previous.dangerouslySetInnerHTML != null) instance.node.textContent = "";
    const children = toChildArray(element.props.children);
    instance.children = reconcileChildren(instance, instance.children, children);
    placeChildren(instance);
  } else {
    for (const child of instance.children) unmount(child, false);
    instance.children = [];
  }
  if (instance.ref !== element.ref) {
    setRef(instance.ref, null);
    instance.ref = element.ref;
    attachRef(instance);
  }
}

function reconcileChildren(
  parent: ParentInstance,
  previous: Instance[],
  vnodes: VNode[],
): Instance[] {
  if (
    !previous.some((child) => child.kind !== "text" && child.key !== null) &&
    !vnodes.some((vnode) => typeof vnode !== "string" && vnode.key !== null)
  ) {
    const next = vnodes.map((vnode, index) => {
      const existing = previous[index];
      if (existing && sameType(existing, vnode)) {
        update(existing, vnode);
        return existing;
      }
      if (existing) unmount(existing, true);
      return mount(vnode, parent);
    });
    for (const extra of previous.slice(vnodes.length)) unmount(extra, true);
    return next;
  }
  const keyed = new Map<Key, Instance>();
  for (const child of previous) {
    if (child.kind !== "text" && child.key !== null) keyed.set(child.key, child);
  }
  const retained = new Set<Instance>();
  const matches = vnodes.map((vnode, index) => {
    const key = typeof vnode === "string" ? null : vnode.key;
    const candidate = key === null ? previous[index] : keyed.get(key);
    if (!candidate || (candidate.kind !== "text" && candidate.key !== key)) return;
    if (sameType(candidate, vnode) && !retained.has(candidate)) {
      retained.add(candidate);
      return candidate;
    }
  });
  for (const child of previous) {
    if (!retained.has(child)) unmount(child, true);
  }
  return vnodes.map((vnode, index) => {
    const existing = matches[index];
    if (!existing) return mount(vnode, parent);
    update(existing, vnode);
    return existing;
  });
}

function unmount(instance: Instance, removeNodes: boolean): void {
  if (removeNodes) for (const node of domNodes(instance)) node.remove();
  instance.mounted = false;
  if (instance.kind === "text") return;
  if (instance.kind === "component") dirty.delete(instance);
  for (const child of instance.children) unmount(child, false);
  if (instance.kind === "host") setRef(instance.ref, null);
  else for (const hook of instance.hooks) hook.cleanup?.();
}

// ---------------------------------------------------------------------------------------------
// Hydration: adopt the server's nodes instead of creating new ones.

interface Cursor {
  node: ChildNode | null;
}

function skipComments(cursor: Cursor): void {
  while (cursor.node && cursor.node.nodeType === Node.COMMENT_NODE)
    cursor.node = cursor.node.nextSibling;
}

function hydrate(vnode: VNode, parent: ParentInstance, cursor: Cursor, container: Node): Instance {
  skipComments(cursor);
  const existing = cursor.node;
  if (typeof vnode === "string") {
    // The server writes adjacent strings as one text node; split off this string's part.
    if (
      existing?.nodeType === Node.TEXT_NODE &&
      vnode.length > 0 &&
      (existing as Text).data.startsWith(vnode)
    ) {
      const text = existing as Text;
      if (text.data.length > vnode.length) text.splitText(vnode.length);
      cursor.node = text.nextSibling;
      return textInstance(vnode, text, parent);
    }
    const instance = mount(vnode, parent) as TextInstance;
    container.insertBefore(instance.node, existing);
    return instance;
  }
  if (elementType(vnode) === "component") {
    const instance = componentInstance(vnode, parent);
    instance.children = renderComponent(instance).map((child) =>
      hydrate(child, instance, cursor, container),
    );
    return instance;
  }
  if (existing?.nodeType !== Node.ELEMENT_NODE || (existing as Element).localName !== vnode.type) {
    const instance = mount(vnode, parent) as HostInstance;
    container.insertBefore(instance.node, existing);
    return instance;
  }
  const node = existing as HTMLElement;
  const instance = hostInstance(vnode, node, parent);
  cursor.node = node.nextSibling;
  patchProps(node, vnode.props, {}, true);
  if (vnode.props.dangerouslySetInnerHTML == null) {
    const inner: Cursor = { node: node.firstChild };
    instance.children = toChildArray(vnode.props.children).map((child) =>
      hydrate(child, instance, inner, node),
    );
    // Whatever the server rendered past the client's children doesn't belong to the tree.
    for (let extra = inner.node; extra; ) {
      const next = extra.nextSibling;
      if (extra.nodeType !== Node.COMMENT_NODE) extra.remove();
      extra = next;
    }
  }
  attachRef(instance);
  return instance;
}

// ---------------------------------------------------------------------------------------------
// Roots.

function createRootHandle(root: RootInstance): Root {
  return {
    render(element) {
      commit(() => {
        root.children = reconcileChildren(root, root.children, toChildArray(element));
        placeChildren(root);
      });
    },
    unmount() {
      for (const child of root.children) unmount(child, true);
      root.children = [];
    },
  };
}

export function createRoot(container: Element): Root {
  return createRootHandle({ kind: "root", node: container, children: [], depth: 0 });
}

export function hydrateRoot(container: Element, element: Children): Root {
  const root: RootInstance = { kind: "root", node: container, children: [], depth: 0 };
  const cursor: Cursor = { node: container.firstChild };
  commit(() => {
    root.children = toChildArray(element).map((child) => hydrate(child, root, cursor, container));
  });
  return createRootHandle(root);
}
