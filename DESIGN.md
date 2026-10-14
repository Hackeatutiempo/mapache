# Mapache design notes

How the board is built and why. Numbers are in board pixels at 100 % zoom.

## Principles

- **Direct manipulation first.** Every object is edited in place. A floating context bar shows only the
  actions that apply to the current selection.
- **Keyboard for everything.** Every creation and editing action has a shortcut; press `?` in the app.
- **No build step, no dependencies.** Classic scripts on `window.MM*` namespaces. Pure modules (`layout`,
  `connectors`, `ink`, `tables`) also export for Node so they can be tested with `node --test`.
- **Local first.** Boards are plain JSON files on your computer (`~/.mapache`). The browser keeps a full copy in
  IndexedDB, so the app opens and works without the server, and syncs when it is back.
- **Agents are first-class users.** Everything you can build by hand, an AI agent can build through the same
  document model: an MCP server and a command line ship with the app.

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

## Storage and sync

- **Files** (`lib/store.js`): `~/.mapache` (or `MAPACHE_DATA`) holds `boards/<id>.json`, `folders.json`,
  `media/<id>` (+ `<id>.json` with type and name) and `trash/`. Writes are atomic (temp file + rename). Every
  board has a `rev` that grows on each save; a write carries the `rev` it started from and is refused with a
  conflict if someone saved in between. Deleting moves the board to `trash/`.
- **Server** (`server.js`, 127.0.0.1 only): serves `src/`, a small JSON API (`/api/boards`, `/api/folders`,
  `/api/media`, `/api/session`, `/api/open`), Server-Sent Events on `/api/events`, and MCP on `/mcp`. It watches
  the data folder, so a change written by the command line or the MCP server reaches open tabs in well under a
  second. API requests must come with a `localhost` Host header and, if present, the app's own Origin: other
  websites cannot read or change boards (this also blocks DNS rebinding).
- **Browser** (`src/store.js`): IndexedDB database `mindmap` (name kept from early versions) with `maps`,
  `folders`, `media` and `sync`. Every save goes to IndexedDB first and is pushed in the background; per board,
  all operations run in a queue. On a conflict the browser merges and pushes again. Boards created before files
  existed are uploaded on the first sync. Without the Mapache server (for example on a static host) it stays
  browser-only, as before.
- **Merging** (`src/merge.js`, shared by browser and Node): three-way merge of `base` (last common version),
  `ours` and `theirs`, per node and per item and then per field. If both sides changed the same field, ours wins;
  an edit beats a deletion; deleted branches come back if the other side added children to them. The open board
  applies outside changes in place (undoable with Ctrl+Z) and waits while you are typing or dragging.
- Preferences such as the last note color or shape style live in `localStorage` under `mindmap:*`.
- Backups are JSON: `{ app: 'mapache', version: 4, folders, maps, media }`. Imports also accept a single `doc`.

## Interface language

- Spanish and English. `src/i18n.js` loads first and exposes `MMI18n.t(spanish, vars)`: the Spanish text is the key
  and `src/i18n-en.js` holds the English dictionary (`{name}` placeholders in both). A missing entry shows the Spanish.
- The preference is `mindmap:lang` (`auto`, `es` or `en`); `auto` picks Spanish when the browser's first language
  starts with `es`, English otherwise. The globe button in the top bar changes it and reloads the page.
- Static text in `index.html` is translated once at start-up by `MMI18n.apply`. Only displayed text is translated:
  stored values and internal keys (such as the `FMT_COLORS` names) never change, so boards open the same in both.
- Text the app creates (the first node, section names, the sample table) is written in the current language.
- `test/i18n.test.js` fails if a `t('…')` key or a static string in `index.html` has no English entry.

## Agents (`lib/tools.js`, `lib/mcp.js`, `bin/mapache.js`)

- One set of tools (list, read, search, create and update boards, add and edit nodes, items and connectors, open a
  board) is exposed twice: as an MCP server (`mapache mcp`, JSON-RPC over stdio, or Streamable HTTP on `/mcp`) and
  as a command line (`mapache tool <name> <json>` plus friendly shortcuts such as `mapache add`).
- Agents write Markdown-like text (`# heading`, `- bullet`, `[ ] task`, `**bold**`, links) and indented outlines;
  `lib/board.js` turns it into the app's line format and escapes everything else.
- Boards, nodes and items can be referenced by id, by title or text, by a path (`Root > Branch`) or, for the
  board, as `open` (the board shown in the app, reported by the browser).
- New content is placed in free space: right of or below what is there, whichever keeps the board closest to a
  screen's shape, using the real mind map layout with estimated text sizes.

## Export and share

- Every format starts from one self-contained SVG of the board (`buildSVG`): each layer's HTML in a `foreignObject`
  with the stylesheet inside, plus the line and connector SVG.
- **PNG** and **PDF** draw that SVG on a canvas (2× when the size allows). The PDF is written by hand: one page the
  size of the board with the image as JPEG (`/DCTDecode`), no library.
- **HTML** is a single file: the SVG as a JSON string, parsed with `DOMParser` (so the CDATA stylesheet survives) and
  shown with a tiny pan and zoom viewer. Text and links stay real text. Uploaded videos become a placeholder, since
  they only live in the app.
- Agents export through the app: `export_board` asks the server, which sends an `export` event to the most recently
  connected tab; that tab opens the board, builds the file and uploads it to `/api/export/<request>`.

## Team mode (`lib/auth.js`, `lib/team.js`, `src/team-ui.js`)

- `MAPACHE_MODE=team` turns the same server into a multi-user one. Local mode refuses to listen on anything but
  loopback, so boards are never on a network without accounts.
- **Accounts** in `users.json` (scrypt `N=16384, r=8, p=1`), **sessions** in `sessions.json` (30 days, cookie
  `HttpOnly; SameSite=Lax`, `Secure` over HTTPS), **invitations** (7 days, one use, optional email) and **agent
  tokens** (`mpk_…`); every token is stored only as a SHA-256 hash. The first admin needs a one-time setup code that
  is printed in the server log.
- **Authorization**: every `/api` and `/mcp` call needs a session or a bearer token. Cookie requests that change data
  must carry the app's own `Origin` (CSRF). Roles: admin, editor, viewer; viewers get read-only routes and read-only
  MCP tools, and the app hides editing tools and reverts any change locally.
- **Live collaboration** reuses the sync above (revisions, three-way merge, SSE). On top: `presence` events (who is
  connected and on which board) and `cursor` events (positions in board coordinates, sent at most ~15 times a
  second, relayed only to people on the same board). Changing someone's role or password closes their live
  connections (`signout`) so their tabs return to the login screen at once.
- In the browser each person gets their own IndexedDB (`mapache-team-<userId>`), deleted on log out.
- **Docker**: `node:22-alpine` plus the source, data in the `/data` volume, runs as `node`, with a health check.
  `docker-compose.yml` has an optional `https` profile with Caddy.

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
