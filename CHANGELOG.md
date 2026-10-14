# Changelog

## 0.5.2 — 2026-10-14

### Fixed
- Team mode on your own computer: you can work from `localhost` while others use your network address, and invitation
  links use that network address instead of `localhost`. `mapache start --team [--data <dir>]` starts team mode in one step
  and prints the address for your network.

## 0.5.1 — 2026-10-14

### Fixed
- Opening Mapache while a version older than 0.4 was still running: `Abrir Mapache.cmd` and `start.sh` now offer to
  stop the old one and open the new one, and `mapache stop` stops it too. The "install Node.js" hint only appears when
  Node.js is really missing, and the message comes in your language.

## 0.5.0 — 2026-10-14

**Mapache for teams.**

### Added
- **Team server** (`MAPACHE_MODE=team`, Docker image and `docker-compose.yml` with optional automatic HTTPS):
  accounts with email and password, invitation links, roles (admin, can edit, can view), a one-time setup code for
  the first admin, profile and password changes, and `mapache team …` commands for the server's terminal.
- **Real-time collaboration**: avatars of who is on the board, live cursors with names, and everyone's changes on
  screen as they happen (merged when simultaneous).
- **Agents per person**: personal tokens and HTTP MCP (`/mcp` with `Authorization: Bearer`), with the person's role.
- **Comments and mentions** (also without a team): pins on the board or on any object, threads with replies,
  resolve and reopen, `@mentions` with a bell for unread ones, a comments panel, links to a thread, and four MCP tools
  (`list_comments`, `add_comment`, `reply_comment`, `resolve_comment`) plus `mapache comment` and `mapache comments`.
  Agents sign as their client (for example "Claude Code (Ana)").

### Fixed
- Two tabs of the same browser could keep re-saving each other after a simultaneous edit.
- Deleting a multi-selection could throw while redrawing the selection bar.
- [TEAM.md](TEAM.md): install, HTTPS, people, agents, backups, updates and security notes.

## 0.4.1 — 2026-10-14

**Share a board with anyone.**

### Added
- **Export menu** (top right): a **single web page** anyone can open in a browser (zoom and pan, text and links stay
  real, nothing to install), **PDF**, **PNG** and **SVG**.
- **Your agent can export too:** the `export_board` MCP tool and `mapache export <board> --format html|pdf|png|svg`
  save the file in Downloads (or where you say). The app draws it, so it opens the board in the browser if needed.
- Tested with the Claude Code MCP client (connects) and with Codex (creates and reads boards end to end).

## 0.4.0 — 2026-10-14

**Your AI agent can now work on your boards, and the app speaks English.**

### Added
- **MCP server** (`node bin/mapache.js mcp`, or Streamable HTTP on `http://localhost:4321/mcp`) with 17 tools: list,
  read and search boards; create, rename, move and delete boards and folders; grow and edit mind maps from indented
  outlines; add and edit sticky notes, text, shapes, sections, stickers, tables, charts and video embeds; draw
  connectors; open a board in the browser. Tested with Codex; works with any MCP client (Claude Code, Claude
  Desktop, Cursor, VS Code, Gemini CLI…).
- **Command line** (`bin/mapache.js`): the same tools from a terminal (`mapache tool <name> <json>`) plus `list`,
  `show`, `search`, `new`, `add`, `note`, `connect`, `trash`, `restore`, `start`, `stop`, `status`, `open`,
  `shortcut`, `autostart` and `mcp-config` (prints the exact setup for each agent).
- **Connect your AI agent** panel in the app: a ready prompt for your agent and the exact command for each one.
- **English interface**, chosen from the browser language, with a language button next to the theme button.
- **Boards as files** in `~/.mapache` (or `MAPACHE_DATA`), with revisions and a trash. The browser keeps an offline
  copy and syncs in the background; boards from older versions are uploaded automatically the first time.
- **Live sync**: changes from your agent, another tab or another browser appear immediately in the open board and
  can be undone with Ctrl+Z. Simultaneous edits are merged per node, item and field.
- Desktop shortcut with the Mapache icon, start at login, and launchers that run Mapache in the background.
- `CHANGELOG.md`, agent demo GIFs, and AGENTS.md sections on connecting and using Mapache as an agent.

### Upgrading from 0.3
- Close the old server first (on Windows, the minimized "Mapache (servidor)" window), then open Mapache again.
  `mapache start` tells you if the old one is still running.
- Open the app once in the browser you used before: your boards are copied from the browser to `~/.mapache`
  automatically and stay in the browser too.

### Changed
- `Abrir Mapache.cmd` and `start.sh` start Mapache in the background without leaving a window open.
- The local API only answers requests for `localhost` coming from the app itself.

## 0.3.0 — 2026-10-14

First public release: mind maps (several per board), sticky notes, text, 12 shapes, sections, connectors with
automatic routing, freehand drawing with shape recognition, tables and 17 chart types, images and videos,
multi-selection with alignment, arrange and lock, alignment guides, right-click menu, folders with colors and icons,
light and dark themes, PNG export and JSON backups.
