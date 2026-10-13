<p align="center">
  <img src="docs/banner.png" alt="Mapache: mind maps and whiteboard that live in your browser" width="100%">
</p>

<h3 align="center">Mind maps and an infinite whiteboard that live in your browser.<br>Open source. Works offline. No account.</h3>

<p align="center">
  <a href="#-quick-start"><b>Quick start</b></a> ·
  <a href="#-features">Features</a> ·
  <a href="#%EF%B8%8F-keyboard-first">Shortcuts</a> ·
  <a href="#%EF%B8%8F-roadmap">Roadmap</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-8b5cf6"></a>
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-22c55e">
  <img alt="Works offline" src="https://img.shields.io/badge/works-offline-0ea5e9">
  <img alt="No build step" src="https://img.shields.io/badge/build%20step-none-f59e0b">
  <a href="#-contributing"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-f97316"></a>
  <a href="https://github.com/Hackeatutiempo/mapache/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Hackeatutiempo/mapache?style=social"></a>
</p>

<p align="center">
  <img src="docs/demo.gif" width="860" alt="Building a mind map, a sticky note and a shape in seconds, only with the keyboard">
</p>

---

## Why Mapache?

Most whiteboard tools want an account, a monthly fee and a copy of your ideas on their servers.
**Mapache is a folder you run on your own computer.** Your boards stay in your browser, it opens instantly,
and it keeps working on a plane.

- ⚡ **Fast like a native app.** No framework, no build step, no loading spinners.
- 🧠 **Mind maps that keep up with you.** Tab for a child, Enter for a sibling, drag to re-parent, colored
  branches, and as many maps as you want on one board.
- 🎨 **A real whiteboard around them.** Sticky notes, 12 shapes, sections, connectors that route around
  objects, freehand drawing with shape recognition, images and videos.
- 📊 **Data built in.** Paste a table from Excel or Google Sheets and turn it into any of 17 chart types.
- 🔒 **Yours, for real.** Local-first, no telemetry, export everything whenever you want. AGPL-3.0.

|  | **Mapache** | Typical SaaS whiteboard |
|---|:---:|:---:|
| Price | **Free** | Free tier, then per seat |
| Account required | **No** | Yes |
| Where your boards live | **Your browser / your server** | Their cloud |
| Works offline | **Yes** | Limited |
| Open source and self-hostable | **Yes** | No |
| Dependencies to install | **0** | — |

## 🤖 Let your AI agent install it

Not technical? Give this to your AI agent (Claude Code, Codex, Cursor…) and it does everything for you:

```text
Install Mapache for me following https://github.com/Hackeatutiempo/mapache/blob/main/AGENTS.md
and leave a shortcut so I can open it with a double-click.
```

The step-by-step guide for agents lives in [AGENTS.md](AGENTS.md): it checks Node.js, gets the code, starts it,
creates a desktop shortcut and explains how to keep your boards safe.

## 🚀 Quick start

All you need is [Node.js](https://nodejs.org) 18 or newer. There is nothing else to install.

```bash
git clone https://github.com/Hackeatutiempo/mapache.git
cd mapache
npm start
```

Open **<http://localhost:4321>** and start thinking. Next time, double-click `Abrir Mapache.cmd` (Windows) or run
`./start.sh` (macOS and Linux): they start Mapache if needed and open the browser.

> **Tip:** in Chrome or Edge choose *Install app* in the address bar. Mapache gets its own window and icon and
> works even when the server is off.

Your boards are saved automatically in that browser. Use **Export backup** (bottom left) from time to time,
especially before clearing your browser data.

## ✨ Features

### Mind maps that grow as fast as you think
Quick-add dots, Tab and Enter, drag a branch and watch the map re-flow live, collapse with a counter,
horizontal or vertical layouts, curved or angular lines. Paste an indented outline and it becomes a map.

<p align="center"><img src="docs/feature-mindmap.png" width="860" alt="A colorful mind map with five branches"></p>

### Flowcharts with connectors that route themselves
Connect shapes, notes, tables or mind map nodes. Ends keep their side while the path re-routes around
objects; drag any segment to shape it by hand. Elbow, curved or straight, with labels and nine end caps.

<p align="center"><img src="docs/feature-flow.png" width="760" alt="A flowchart inside a section with Yes and No branches"></p>

### Your data, as charts
Paste from Excel, Google Sheets, Notion or Markdown, or drop a CSV. Charts stay linked to their table and
update while you type. Color-blind-safe palettes in light and dark mode.

<p align="center"><img src="docs/feature-data.png" width="760" alt="A table and the column chart built from it"></p>

### Light or dark, your call
<p align="center"><img src="docs/screenshot-light.png" width="860" alt="Mapache in light mode with folders, a mind map, notes, a flowchart and a chart"></p>

<details>
<summary><b>Everything that is inside</b></summary>

| | |
|---|---|
| **Mind maps** | As many as you want on one board (M). Horizontal or vertical layout, curved or angular lines, branch colors, icons, bullet, numbered and checklist nodes, paste an indented outline to create branches |
| **Notes and text** | Sticky notes that grow with their text, four text sizes, colors. Per-line headings, lists and checklists, plus text color, highlight, bold, italic and links on any selection |
| **Shapes** | Rectangle, pill, oval, diamond, parallelograms, trapezoid, triangle, hexagon, cylinder, cloud, star. Fill, border, dashed or transparent. They grow with their text |
| **Sections** | Named areas that carry their content when you move them |
| **Connectors** | Elbow, curved or straight; nine end caps; labels you can slide along the line; ends keep their side while the path re-routes around objects, and every segment can be dragged |
| **Freehand** | Pen, highlighter, eraser, lasso, and shape recognition (lines, rectangles, ellipses, diamonds) |
| **Tables** | Paste from spreadsheets, import and export CSV, sort, insert and move rows and columns |
| **Charts** | Column, bar, stacked and 100 %, line, area, pie, donut, scatter, bubble, radar, funnel, heatmap, waterfall and big-number tiles |
| **Media** | Images and videos (upload, drag or paste), YouTube, Vimeo and Loom links |
| **Selection** | Drag on the canvas to select what the box touches, Shift+click to add, then move, scale, align, distribute, duplicate, copy or delete together. Auto-arrange as a grid, a tree or a mind map. Lock objects so they stay put |
| **Guides** | Smart alignment guides snap edges and centers while you drag (hold Alt to skip) |
| **Right-click menu** | Copy and paste style, save as default style, arrange, align, lock, wrap in section, snap to grid and copy a link to that spot on the board |
| **Folders** | Nested folders and maps in the sidebar, drag to reorganize, a color and an icon for each |
| **Themes** | Dark, light or follow the system |
| **Export** | PNG image of the board, JSON backup of all maps, folders and videos |

</details>

> 🌍 The interface is in Spanish for now. **An English translation is next on the roadmap**, and help is welcome.

## ⌨️ Keyboard-first

| Key | Does |
|---|---|
| `Tab` · `Enter` | Child · sibling (while typing) |
| `M` · `N` · `T` · `R` | New mind map · sticky note · text · shape |
| `C` · `H` · `E` · `I` | Connector · freehand · table · image or video |
| `Drag on canvas` · `Ctrl A` | Select many · select all |
| `Shift L` · `Ctrl Alt C / V` | Lock · copy and paste style |
| `1` · `0` · `Space + drag` | Fit · 100 % · pan |
| `?` | Every shortcut |

## 🗺️ Roadmap

- [x] Mind maps, whiteboard objects, tables and charts
- [x] Connectors, freehand drawing, media, multi-selection and guides
- [ ] English interface
- [ ] Self-hosted server with Docker: accounts, projects and invite links
- [ ] Real-time collaboration (CRDT, keeps working offline)
- [ ] REST API and MCP server so AI agents can read and edit boards
- [ ] Comments and mentions

Have an idea? [Open an issue](https://github.com/Hackeatutiempo/mapache/issues).

## 🔐 Privacy

There is no account, no analytics and no server you do not run yourself. Boards live in your browser's
IndexedDB, videos too, and backups are plain JSON files you can read.

<details>
<summary><b>How it is built</b></summary>

Plain JavaScript, no framework and no build step: the browser runs exactly the code you are reading.

| File | What it does |
|---|---|
| `src/app.js` | State, in-place editing, context bar, menus, dragging, shortcuts |
| `src/layout.js` | Mind map layout and line geometry (pure, tested) |
| `src/connectors.js` | Connector routing |
| `src/arrange.js` | Arrange as grid, tree or mind map |
| `src/ink.js` | Freehand smoothing, eraser, lasso, shape recognition |
| `src/shapes.js` | Shape outlines |
| `src/tables.js` | CSV, TSV, Markdown and HTML table parsing |
| `src/charts.js` | SVG charts |
| `src/sidebar.js` | Folders and map list |
| `src/store.js` | IndexedDB storage |
| `src/sw.js` | Offline support |
| `server.js` | Tiny static server, no dependencies |

Design decisions and measurements are in [DESIGN.md](DESIGN.md). Run the tests with `npm test`.

</details>

## 🤝 Contributing

Issues and pull requests are welcome, from typo fixes to whole features. Keep it dependency-free where you
can, match the style of the surrounding code, and add a test in `test/` for geometry or parsing changes.
The English interface is a great first contribution.

## ⭐ Support the project

If Mapache saves you time, **a star helps other people find it.** The first time you run `npm start` in a
terminal it asks once whether you want to star the repo (only if you say yes, with your own GitHub CLI session).

<p align="center">
  <a href="https://github.com/Hackeatutiempo/mapache/stargazers"><img alt="Star history" src="https://api.star-history.com/svg?repos=Hackeatutiempo/mapache&type=Date" width="600"></a>
</p>

## 📄 License

[GNU AGPL-3.0](LICENSE). Use it, change it and host it for free. If you offer a modified version as a
service to other people, share your changes under the same license.

---

<p align="center">
  Made with 🦝 by <b>Cristian</b> · <a href="https://hackeatutiempo.com">Hackea Tu Tiempo</a> ·
  <a href="https://www.instagram.com/hackeatutiempo/">Instagram</a>
</p>
