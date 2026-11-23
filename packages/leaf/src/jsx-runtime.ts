// The automatic JSX runtime: `jsxImportSource: "leaf"` compiles <p /> to jsx("p", props).

import {
  Fragment,
  createElement,
  type AsyncComponent,
  type Children,
  type Component,
  type ElementType,
  type Key,
  type LeafElement,
  type Ref,
} from "./index.js";

export { Fragment };

export function jsx(type: ElementType, props: Record<string, unknown>, key?: Key): LeafElement {
  return createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
export const jsxDEV = jsx;

type EventHandler = (event: any) => void;

/** Attributes leaf writes as written, plus React-style names it maps (className, htmlFor). */
export interface HTMLAttributes {
  children?: Children;
  key?: Key;
  ref?: Ref<any>;
  className?: string;
  style?: string | Record<string, string | number | null | undefined>;
  dangerouslySetInnerHTML?: { __html: string };
  [attribute: `on${string}`]: EventHandler | undefined;
  [attribute: string]: unknown;
}

export declare namespace JSX {
  type Element = LeafElement;
  type ElementType = string | Component<any> | AsyncComponent<any>;
  interface ElementChildrenAttribute {
    children: {};
  }
  interface IntrinsicAttributes {
    key?: Key;
  }
  interface IntrinsicElements {
    [tag: string]: HTMLAttributes;
  }
}
