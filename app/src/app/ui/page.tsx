"use client";

import type { Metadata } from "@farm.js/core";
import { Link } from "farm-leaf/bindings";
import { Toggle } from "../../ui/toggle";

export const metadata: Metadata = { title: "ui-sdk primitives on leaf" };

export default function UiPage() {
  return (
    <section>
      <h1>A ui-sdk primitive, rendered by leaf</h1>
      <p>The primitive runs on the server too, so the first HTML already has aria-pressed.</p>
      <Toggle id="bold" defaultPressed>
        Bold
      </Toggle>
      <p>
        <Link href="/ui/web">The same toggle as a web component</Link>
      </p>
    </section>
  );
}
