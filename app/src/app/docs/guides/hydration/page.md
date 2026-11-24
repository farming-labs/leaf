---
title: Hydration
description: How leaf adopts the HTML the server wrote.
---

# Hydration

`hydrateRoot()` walks the server's DOM and attaches to it instead of building new nodes, so
focus, selection, and scroll survive.

## Raw HTML

An element with `dangerouslySetInnerHTML` keeps the server's inner HTML while hydrating. The
docs pages rely on it for their Markdown.
