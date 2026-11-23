"use client";

import type { Metadata } from "@farm.js/core";
// Registers <ui-toggle> in the browser. On the server it does nothing: ui-sdk skips the
// registration when customElements doesn't exist.
import "@ui-sdk/web/toggle";

export const metadata: Metadata = { title: "ui-sdk web components on leaf" };

export default function UiWebPage() {
  return (
    <section>
      <h1>A ui-sdk web component, written by leaf</h1>
      <p>leaf writes the tag like any other. The browser upgrades it after the page loads.</p>
      <ui-toggle default-pressed>
        <button type="button" aria-pressed="true">
          Bold
        </button>
      </ui-toggle>
    </section>
  );
}
