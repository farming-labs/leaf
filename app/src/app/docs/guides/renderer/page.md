---
title: The renderer
description: What farm-leaf hands Farm.
---

# The renderer

`farm-leaf` is a renderer descriptor and three modules: `farm-leaf/server`, `farm-leaf/client`,
and `farm-leaf/vite`.

## Server

The server module exports `createElement()` and `renderToString()`. Farm renders pages with
them, and so does the docs UI.

## Client

The client module exports `createElement()` and `hydrateRoot()`. The browser hydrates pages
with them.
