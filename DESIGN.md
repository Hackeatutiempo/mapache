# Mapache design notes

How the board is built and why. Numbers are in board pixels at 100 % zoom.

## Principles

- **Direct manipulation first.** Every object is edited in place. A floating context bar shows only the
  actions that apply to the current selection.
- **Keyboard for everything.** Every creation and editing action has a shortcut; press `?` in the app.
- **No build step, no dependencies.** Classic scripts on `window.MM*` namespaces. Pure modules (`layout`,
  `connectors`, `ink`, `tables`) also export for Node so they can be tested with `node --test`.
- **Local first.** Data lives in IndexedDB and the app works offline through a service worker. A server is
  optional and will add sync, not replace local storage.

## Document model

A map is `{ id, title, folderId, doc, createdAt, updatedAt }`. The `doc`:

```js
{
  rootId,
  settings: { layout: 'horizontal' | 'vertical', lines: 'curvy' | 'angular', origin: { x, y } },
  nodes: { [id]: { id, parentId, order, lines: [html], block: 'p'|'ul'|'ol'|'check'|'h1'|'h2'|'h3', checked: [], icon, style } },
  items: { [id]: { id, type, x, y, z, ... } },
}
```

- Node `order` is fractional, so inserting between two siblings never renumbers the rest.
- Node `style`: `color` and `side` (set on first-level branches and inherited), `dash`, `collapsed`.
- Item types: `note`, `text`, `sticker`, `image`, `shape`, `section`, `table`, `chart`, `conn`, `ink`.
- A connector end is either attached (`{ ref: '<itemId>' | 'node:<nodeId>', side: 'auto' | 'top' | ... }`)
  or free (`{ x, y }`). Charts reference their table by `tableId`.
- Undo and redo store JSON snapshots of `doc` (up to 200 steps).

## Several mind maps per board

`doc.rootId` is the primary map and uses `doc.settings`. Any other node with no parent is the root of another map
and keeps its own `{ layout, lines, origin }` in `node.map`. Rendering computes each tree with `computeLayout` and
merges the boxes; every box knows its `root` and whether its map is `vertical`. In a multi-selection a whole map is
named `map:<rootId>`.

## Mind map layout (`src/layout.js`)

`computeLayout(doc, size)` is pure: it takes measured node sizes and returns positions and line paths.

| | Root | Level 1 | Level 2+ |
|---|---|---|---|
| Font size | 27 | 21 | 18 |
| Line height | 36 | 28 | 24 |
| Padding (x × y) | 20 × 18 | 9 × 4 | 9 × 0 |
| Gap between siblings | | 36 | 24 |

- Parent edge to child edge: **96** at every level, in both layouts.
- Line width 4, solid or dashed per branch.
- Curvy from the root: lines leave from inside the root box, with start points spread vertically.
  Path `M s c 80,0 (w−80),dy w,dy`.
- Curvy at level 2+: `M s h10 c40,0 (L−40),dy L,dy h10`, with a 10 px straight run at each end.
- Angular from the root: vertical from 16 px inside the root edge, then horizontal. Level 2+: `h48 v dy h48`.
- Branch colors are assigned in a fixed order (purple, blue, green, orange, yellow, red, …), always picking
  the least used one, so a new branch never repeats a neighbour's color.

## Connectors (`src/connectors.js`)

- Ends sit 6 px off the object edge so arrowheads never touch the shape.
- **Sides are fixed.** Each attached end stores the side it leaves or enters from: the quick-add dot that
  was pressed, or the side nearest the cursor where the connector was dropped. Only a side still marked
  `'auto'` (connectors drawn with the connector tool, or saved by older versions) is chosen once, by trying
  every combination, and then stored. Moving objects never changes a side; only the path adapts.
- **Automatic path.** An elbow path is a list of *channels*: the lines (`x = v` or `y = v`) its middle
  segments run along. With the sides fixed, the router tries paths of up to three channels built from the
  gap between both objects, the stub ends, and lines just outside both objects, and keeps the lowest score:
  `length + bends × 16 + crossings × 100000`, preferring the middle of the gap on ties. A crossing is a
  segment through the interior of either connected object, so the path goes around them instead.
- **Manual path.** Every segment of a selected elbow connector can be dragged. Dragging stores the channels
  in `chans`, which then stay put when objects move. Dragging a segment attached to an object inserts a new
  bend next to it, so the end keeps its side. Changing the route type or reattaching an end returns to the
  automatic path.
- Routes: elbow (24 px straight run out of each side), curve (cubic, handles at 42 % of the distance), straight. Caps: none, arrow, triangle, triangle open, circle,
  circle open, diamond, diamond open, bar.
- Labels sit at a fraction `t` of the path length and can be dragged along it.
- Layering: sections → items sent back → mind map lines → mind map → **connectors** → front items. Shape
  fills are opaque so a connector passing behind a shape is hidden by it.

## Freehand (`src/ink.js`)

- Strokes are stored as points relative to the stroke origin and drawn as quadratic curves through the
  midpoints.
- The eraser radius is constant on screen, so it behaves the same at any zoom.
- Shape detection classifies closed and open strokes as line, rectangle, ellipse or diamond and replaces
  them with real shapes. Anything ambiguous stays as ink.

## Tables and charts

- Paste parsing accepts HTML tables, TSV, CSV (comma or semicolon), and Markdown. Indented outlines and
  comma-separated prose are rejected so they paste as mind map branches or text instead.
- Limits: 500 rows, 50 columns. CSV export uses `;` and a BOM so Excel opens it correctly in any locale.
- Numbers are read in both `1.234,5` and `1,234.5` forms.
- Charts are plain SVG, 17 kinds. Rules: one y-axis only, bars at most 24 px with 4 px rounded ends, 2 px
  lines, categorical colors in a fixed order validated for color blindness against the `#111821` surface,
  a single blue ramp for ordinal data, tooltips on hover.

## Storage

- IndexedDB database `mindmap` (name kept from early versions so existing data loads), stores `maps` and
  `folders`.
- Preferences such as the last note color or shape style live in `localStorage` under `mindmap:*`.
- Backups are JSON: `{ app: 'mapache', version: 3, folders, maps }`. Imports also accept a single `doc`.

## Planned server

- Self-hosted Node server with SQLite, shipped as a Docker image.
- Accounts with email and password, projects with roles, invite links.
- Real-time collaboration with Yjs; the browser keeps a local copy and syncs when online.
- A REST API and an MCP server over the same operations, so AI agents can create and edit boards.

## Text, media and guides

- Each line of a text has its own block type (`blocks[i]`, falling back to `block`); colors and highlights are
  inline spans with a sanitized `color` / `background-color`.
- Shapes keep `baseH` (the height before growing) so they can grow with their text and shrink back.
- Uploaded videos live in the IndexedDB store `media` as Blobs; the item only stores `mediaId`, so undo snapshots
  and saving stay small. Backups embed them as base64. Embeds (YouTube, Vimeo, Loom) are allowed by the CSP
  `frame-src`, and media by `media-src 'self' blob: https:`.
- While dragging, the moving box snaps its edges and center to nearby objects and map nodes within 6 screen px;
  Alt disables it.
- Native `alert`, `confirm` and `prompt` are never used: the app has its own dialog and link field.
- Themes: CSS variables with a `[data-theme="light"]` override; JS colors (notes, text, connectors, charts) come
  from a per-theme table. The light chart palette is validated against `#ffffff`.
