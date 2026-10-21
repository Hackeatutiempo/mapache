# Mapache — guide for AI agents

You are an AI agent helping someone with **Mapache**, an open-source mind map and whiteboard app that runs on
their own computer. The person is probably **not technical**. This guide covers three jobs:

1. [Install Mapache](#install-mapache) and make it easy to open again.
2. [Connect Mapache to your AI agent](#connect-mapache-to-your-ai-agent) (MCP), so you can read and build boards.
3. [Use Mapache well](#using-mapache-as-an-agent) once you are connected.

## Ground rules

- Explain each step in one short sentence before you do it, in the person's language. Avoid jargon.
- **Ask before installing system software** (Node.js, Git), before changing another app's settings (your MCP
  configuration) and before making Mapache start at login. Never ask for passwords, tokens or payment details, and
  never run commands with administrator rights unless the person agrees.
- Mapache needs no account and sends no data anywhere. Boards are JSON files in `~/.mapache` on this computer.
- If something fails, read the error, try the fix under *Troubleshooting*, and only then ask the person.

In the commands below, `MAPACHE` is the folder where Mapache is installed (`~/Mapache` on macOS and Linux,
`%USERPROFILE%\Mapache` on Windows). Always use full paths when you write them into a configuration file.

---

## Install Mapache

### 1. Check Node.js (version 18 or newer)

```bash
node --version
```

If it is missing or older than 18, ask the person, then install the LTS version:

| System | Command |
|---|---|
| Windows | `winget install OpenJS.NodeJS.LTS` (then open a new terminal so `node` is found) |
| macOS | `brew install node` (if Homebrew is missing, use the installer from <https://nodejs.org>) |
| Linux | the distribution's package manager, or the installer from <https://nodejs.org> |

### 2. Get the code

Install it in the person's home folder, in a folder called `Mapache`.

```bash
git clone https://github.com/Hackeatutiempo/mapache.git ~/Mapache
```

On Windows use `%USERPROFILE%\Mapache`. If Git is not installed and the person prefers not to install it,
download and unzip <https://github.com/Hackeatutiempo/mapache/archive/refs/heads/main.zip> instead
(the folder inside the zip is `mapache-main`; rename it to `Mapache`).

There is **nothing to install with npm**: Mapache has zero dependencies.

### 3. Start it

```bash
node MAPACHE/bin/mapache.js start
```

This starts Mapache in the background (no window stays open) and prints its address, normally
**<http://localhost:4321>**, and the folder where boards are saved. Check it:

```bash
node MAPACHE/bin/mapache.js status
```

If port 4321 is busy with something else, use another one: `PORT=4400 node MAPACHE/bin/mapache.js start`
(PowerShell: `$env:PORT=4400; node MAPACHE\bin\mapache.js start`).

### 4. Open it and make it easy to come back

1. Open it: `node MAPACHE/bin/mapache.js open` (starts it if needed and opens the browser).
2. Recommend **installing it as an app**: in Chrome or Edge, the *Install* icon in the address bar. It gets its own
   window and icon, and keeps working even when the server is not running.
3. Create a way to open it later with one double-click:
   ```bash
   node MAPACHE/bin/mapache.js shortcut
   ```
   This puts a **Mapache** shortcut with the Mapache icon on the desktop (Windows `.lnk`, macOS `.command`, Linux
   `.desktop`). It starts Mapache in the background if needed and opens the browser. `Abrir Mapache.cmd` (Windows)
   and `start.sh` (macOS, Linux) in the folder do the same.
4. Offer to start Mapache automatically when the person logs in, so it is always ready for them and for you. If they
   agree: `node MAPACHE/bin/mapache.js autostart on` (and `autostart off` to undo it).

### 5. Tell the person

Summarize in two or three sentences: how to open Mapache (the shortcut or the installed app), that their boards are
saved by themselves on this computer (`node MAPACHE/bin/mapache.js where` shows the folder), and that you can now
connect it to yourself if they want (next section). The interface follows the browser's language (English or
Spanish) and has a language button next to the theme button. Press **?** inside the app to see every shortcut.

---

## Connect Mapache to your AI agent

Mapache includes an MCP server that runs on this computer over stdio:

```text
command: <full path to node>      args: ["<full path to MAPACHE>/bin/mapache.js", "mcp"]
```

`node MAPACHE/bin/mapache.js mcp-config` prints the exact configuration for each agent with the real paths filled
in (`mcp-config claude-code`, `claude-desktop`, `codex`, `cursor`, `vscode`, `gemini`, `chatgpt`, `http`). Ask the
person before changing your configuration, then use the method for the agent you are:

| You are | Do this |
|---|---|
| **Claude Code** | `claude mcp add --scope user mapache -- "<node>" "<MAPACHE>/bin/mapache.js" mcp` |
| **Claude Desktop** | Merge `{"mcpServers":{"mapache":{"command":"<node>","args":["<MAPACHE>/bin/mapache.js","mcp"]}}}` into `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`), keeping any servers already there. The person must restart Claude Desktop |
| **Codex** | `codex mcp add mapache -- "<node>" "<MAPACHE>/bin/mapache.js" mcp` |
| **Gemini CLI** | `gemini mcp add mapache "<node>" "<MAPACHE>/bin/mapache.js" mcp` |
| **Cursor** | Merge the same `mcpServers` entry into `~/.cursor/mcp.json` |
| **Windsurf** | Merge it into `~/.codeium/windsurf/mcp_config.json` |
| **VS Code (Copilot)** | Add `"mapache": {"type":"stdio","command":"<node>","args":["<MAPACHE>/bin/mapache.js","mcp"]}` under `servers` in the user `mcp.json` |
| **Another MCP client** | Use the stdio command above. Clients that only speak Streamable HTTP can use `http://localhost:4321/mcp` while Mapache is running |
| **ChatGPT on the web or phone** | It cannot reach this computer by itself. Suggest Codex, or a bridge such as Desktop Commander; then use the command line below instead of MCP |

Rules when editing a JSON configuration file: read it first, keep everything that is already there, add only the
`mapache` entry, and make a backup copy next to it before saving.

**New tools usually appear only in a new session.** Tell the person to restart the app or open a new conversation,
then check that it works by calling `list_boards`.

### Without MCP: the command line

Every MCP tool is also available from a terminal, which is useful for agents that can run commands but cannot add
MCP servers (for example ChatGPT through Desktop Commander):

```bash
node MAPACHE/bin/mapache.js help             # all commands
node MAPACHE/bin/mapache.js tools            # all tools and their parameters
node MAPACHE/bin/mapache.js tool <name> '<json arguments>'
node MAPACHE/bin/mapache.js show open        # the board open in the app
```

---

## Using Mapache as an agent

- **Start with `list_boards`, then `read_board`.** Reading a board gives its mind maps as indented outlines and every
  note, shape, table and connector with an `id`. Use those ids to change things (unique texts also work, and paths
  like `"Central idea > Branch"`).
- **`"open"` is the board the person is looking at.** When they say "this board" or "the one I have open", pass
  `board: "open"`.
- **Mind maps:** `create_board` with an `outline`, `add_nodes` to grow a branch, `add_mindmap` for another map on the
  same board. Outlines are one idea per line, indented with two spaces or a tab to nest. Keep node texts short
  (a few words); put longer explanations in notes.
- **Everything else:** `add_items` for sticky notes, text, shapes, sections, stickers, tables, charts (from a table
  you added first) and video embeds; `connect` for arrows (with labels). Pass several items or connections in one
  call. New content is placed in free space automatically.
- **Text:** simple Markdown works: `# heading`, `- bullet`, `1. numbered`, `[ ] task`, `[x] done`, `**bold**`,
  `*italic*`, `` `code` ``, `[link](https://…)`.
- **If the app is open, the person sees your changes live** and can undo them with Ctrl+Z. After a big change, offer
  to show it with `open_board`.
- **Comments:** `add_comment` (on a node or item, or free), `reply_comment`, `resolve_comment` and `list_comments`.
  Use them to leave notes or questions for the person instead of changing their content; `@Name` mentions a
  team member and rings their bell.
- **Sharing:** `export_board` saves a board as a single web page (`html`, opens in any browser), `pdf`, `png` or `svg`,
  in Downloads by default (or `path`). The app does the drawing, so it opens the board in the browser if needed.
- **Do not delete anything unless asked.** `delete_board` moves the board to the trash
  (`node MAPACHE/bin/mapache.js trash` lists it, `restore <id>` brings it back).
- Prefer the tools over editing files in `~/.mapache` by hand: they keep the format valid, place things without
  overlapping, and never overwrite a change the person made at the same time.

---

## Set up Mapache for a team (Docker)

If the person wants one Mapache for several people, follow [TEAM.md](TEAM.md). In short, on a computer or server with
Docker (ask before installing Docker):

```bash
git clone https://github.com/Hackeatutiempo/mapache.git && cd mapache
docker compose up -d
docker logs mapache   # the setup code for the first (admin) account
```

Then open `http://<server>:4321` with the person, or create the admin account for them with
`docker exec -it mapache node bin/mapache.js team admin <their email>` (it prints a password: give it to them
privately). For a domain with HTTPS, write `DOMAIN`, `PUBLIC_URL` and `TRUST_PROXY=1` in `.env` and use
`docker compose --profile https up -d`. Invite people from the app (avatar > People and invitations) or with
`node bin/mapache.js team invite`.

**Connecting an agent to a team server** uses HTTP instead of stdio: the person creates a token in *Connect your AI
agent* and you add `https://<server>/mcp` with the header `Authorization: Bearer <token>` (Claude Code:
`claude mcp add --transport http mapache https://<server>/mcp --header "Authorization: Bearer <token>"`). You then act
with that person's role; with *Can view* you can only read.

## Updating

When the person asks you to update Mapache (the app tells them when a new version is out):

```bash
node "<MAPACHE>/bin/mapache.js" update
```

It runs `git pull` and restarts Mapache the way it was running (`--check` only says whether there is a new version).
Without git (installed from the zip) it explains how: download the zip again and replace the folder. Versions before
0.6 do not have `update` yet; there, run `cd "<MAPACHE>" && git pull`, then `node bin/mapache.js stop` and
`node bin/mapache.js start`. Updating from 0.3 or older: the old server has to be closed first
(see *Troubleshooting*); the first time the app opens afterwards, the boards that lived only in the browser are copied
to files by themselves. Boards are not affected: they live in `~/.mapache`, outside the
app folder. After updating, an open tab shows *"A new version of Mapache is available"* with a reload button.

## Troubleshooting

| Problem | Fix |
|---|---|
| `node` not found right after installing | Open a new terminal (the PATH is refreshed there) |
| Port 4321 already in use | `mapache status` tells whether it is Mapache. Otherwise use another `PORT` |
| `start` says an older version of Mapache is still running | Mapache 0.3 or older is still running. Ask the person, then run `node MAPACHE/bin/mapache.js stop` (it stops the old version too) and `start` again. `Abrir Mapache.cmd` and `start.sh` offer to do it |
| The page looks outdated | Reload with Ctrl+F5 (Cmd+Shift+R on macOS) |
| The app says it is not connected (orange "Saved") | Mapache is not running: `node MAPACHE/bin/mapache.js start`. Changes made meanwhile are kept in the browser and sync when it is back |
| The agent does not see the Mapache tools | Restart the agent app or open a new session; check the config with `mcp-config`; make sure the paths are absolute |
| Boards from an older version are missing | Open the app once in the same browser as before, with Mapache running: boards that only lived in the browser are copied to the files automatically |

## Uninstalling

Run `node MAPACHE/bin/mapache.js autostart off` and `stop`, remove the `mapache` entry from your MCP configuration,
and delete the `Mapache` folder and the shortcut. The boards stay in `~/.mapache`: delete that folder too only if the
person confirms they do not want them (offer to export a backup first).
