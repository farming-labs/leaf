---
title: leaf
description: A small UI library with hooks, rendered by Farm through farm-leaf.
---

# leaf

leaf is a UI library with elements, function components, and hooks. Farm has no code for it:
the `farm-leaf` package describes it to Farm, and Farm does the rest.

## Install

```bash
pnpm add leaf farm-leaf
```

## What runs where

| Part | Server | Browser |
| --- | --- | --- |
| Pages and layouts | `leaf/server` | `leaf/dom` |
| These docs | `leaf/server`, with the Markdown compiled to HTML | `leaf/dom` |
