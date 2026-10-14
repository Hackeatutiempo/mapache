#!/usr/bin/env node
// Línea de comandos de Mapache: arrancar la app, abrir tableros, y leer o cambiar tableros desde la terminal
// (pensada también para agentes de IA). `mapache help` lo explica todo.
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const fs = require('fs');
const path = require('path');
const Store = require('../lib/store');
const Tools = require('../lib/tools');
const Launch = require('../lib/launch');
const { version } = require('../package.json');

const ROOT = path.join(__dirname, '..');
const ME = path.join(__dirname, 'mapache.js');

// Argumentos: posicionales y --opciones (--clave valor, --clave=valor, --bandera).
function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) { pos.push(a); continue; }
    const key = m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
    if (m[2] !== undefined) opt[key] = m[2];
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opt[key] = argv[++i];
    else opt[key] = true;
  }
  return { pos, opt };
}

const readStdin = () => new Promise((resolve) => {
  if (process.stdin.isTTY) return resolve('');
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => resolve(s));
});
// "-" o una opción sin valor = leer de la entrada estándar; @archivo = leer de un archivo.
async function textOf(v) {
  if (v === '-' || v === true) return readStdin();
  if (typeof v === 'string' && v.startsWith('@') && fs.existsSync(v.slice(1))) return fs.readFileSync(v.slice(1), 'utf8');
  return v;
}

const ctx = (extra = {}) => ({ open: (id, launch) => openViaApp(id, launch), exportBoard: (id, format) => exportViaApp(id, format), ...extra });
// Lo que se escribe desde la terminal (comentarios) va firmado como «Command line».
const run = async (name, args) => console.log(await Tools.call(name, args, ctx({ client: { name: 'Command line' } })));

// Exportar lo hace la app (la pestaña abierta). Si no hay ninguna, se abre el navegador en ese tablero y se espera.
async function exportViaApp(id, format) {
  const info = await Launch.start();
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, format }) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const err = (await res.json().catch(() => ({}))).error;
    if (res.status !== 409) throw new Error(err || `Export failed (${res.status})`);
    if (i === 0) await Launch.openURL(`http://localhost:${info.port}/#m=${encodeURIComponent(id)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Mapache needs to be open in a browser to export. Open it and try again');
}

// Si ya hay una pestaña de Mapache abierta, cambia a ese tablero; si no, abre el navegador.
async function openViaApp(id, launch = true) {
  const info = await Launch.start();
  const url = `http://localhost:${info.port}/${id ? `#m=${encodeURIComponent(id)}` : ''}`;
  if (!launch) return url;
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const out = await res.json();
    if (out.clients > 0) return url;
  } catch { /* se abre el navegador */ }
  await Launch.openURL(url);
  return url;
}

const HELP = `Mapache ${version} · mind maps and whiteboard on your computer

Usage: mapache <command> [arguments]

App
  open [board]                 Open Mapache (or a board) in the browser, starting it if needed
  start [--team] [--data <dir>] Start Mapache in the background (--team: accounts and invitations, see TEAM.md)
  stop                         Stop it
  status                       Is it running? Where are the boards?
  where                        Print the folder where the boards are saved
  shortcut                     Put a Mapache shortcut on the desktop
  autostart on|off             Start Mapache when you log in to this computer

Boards (for you or your AI agent)
  list                         All boards and folders
  show <board> [--json]        A whole board as an outline with ids
  search <text>                Search every board
  new <title> [--outline <text|-|@file>] [--folder <name>]
                               New board; the outline fills its mind map
  add <board> <parent> <text...>  Add branches under a node (or --outline <text|-|@file>)
  note <board> <text> [--color <c>]  Add a sticky note
  connect <board> <from> <to> [--label <text>]  Draw an arrow
  comments <board> [--all]     Comment threads on a board (--all: also the resolved ones)
  comment <board> <text> [--on <node or item>]
                               Leave a comment, pinned to a node or item if you like
  export <board> [--format html|pdf|png|svg] [--out <folder or file>]
                               Save a board to share (default: a web page in Downloads)
  rename <board> <title>       Rename a board
  trash                        Boards in the trash
  restore <id>                 Bring a board back from the trash

  <board> is an id, a title, or "open" (the board open in the app).
  <parent> / <from> / <to> are node or item ids, or their text.

Every tool (the same ones the MCP server offers)
  tools                        List them with their parameters
  tool <name> [json|-]         Run one with JSON arguments, e.g.
                               mapache tool add_items '{"board":"open","items":[{"type":"note","text":"Hi"}]}'

Team server (run these on the server, e.g. docker exec -it mapache node bin/mapache.js team …)
  serve --team                 Run the team server in the foreground (accounts, invites, live cursors)
  team                         People and pending invitations
  team admin <email> [--name <n>]   Create an admin account (or make it admin) and print its password
  team add <email> [--role editor|viewer|admin] [--name <n>]   Create an account and print its password
  team invite [--role editor|viewer|admin] [--email <e>] [--url <public address>]   Print an invitation link
  team reset-password <email>  Print a new password for that account
  team role <email> <role>     Change someone's role
  team remove <email>          Remove an account

AI agents
  mcp                          Run the MCP server over stdio (this is what you put in your agent's config)
  mcp-config [client]          Show the config for Claude, ChatGPT, Codex, Cursor, VS Code…

Your boards are plain JSON files in ${Store.dataDir()} (set MAPACHE_DATA to use another folder).`;

function mcpConfig(client) {
  const node = process.execPath;
  const json = { mcpServers: { mapache: { command: node, args: [ME, 'mcp'] } } };
  const snippets = {
    'claude-code': `claude mcp add --scope user mapache -- "${node}" "${ME}" mcp`,
    'claude-desktop': `Add to claude_desktop_config.json (Settings > Developer > Edit config):\n${JSON.stringify(json, null, 2)}`,
    codex: `Add to ~/.codex/config.toml:\n[mcp_servers.mapache]\ncommand = ${JSON.stringify(node)}\nargs = [${JSON.stringify(ME)}, "mcp"]\n\nor run: codex mcp add mapache -- "${node}" "${ME}" mcp`,
    cursor: `Add to ~/.cursor/mcp.json:\n${JSON.stringify(json, null, 2)}`,
    vscode: `Add to your VS Code mcp.json (Command palette > MCP: Open User Configuration):\n${JSON.stringify({ servers: { mapache: { type: 'stdio', command: node, args: [ME, 'mcp'] } } }, null, 2)}`,
    gemini: `gemini mcp add mapache "${node}" "${ME}" mcp`,
    chatgpt: `ChatGPT on the web or phone cannot reach your computer by itself. Two ways:
1. Codex (OpenAI's agent, included with ChatGPT plans) runs on your computer and supports MCP: see "codex" above.
2. Desktop Commander (https://desktopcommander.app) connects chatgpt.com to your computer. Then ask ChatGPT to use the Mapache command line:\n   "${node}" "${ME}" help`,
    http: `With Mapache running (mapache start), clients that speak Streamable HTTP can use:\nhttp://localhost:${(Tools.serverInfo(Store.open()) || {}).port || Launch.defaultPort()}/mcp`,
    json: JSON.stringify(json, null, 2),
  };
  if (client && snippets[client]) return snippets[client];
  if (client) return `Unknown client "${client}". Use one of: ${Object.keys(snippets).join(', ')}`;
  return Object.entries(snippets).filter(([k]) => k !== 'json').map(([k, v]) => `## ${k}\n${v}`).join('\n\n');
}

const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
function powershell(script) {
  return new Promise((resolve, reject) => require('child_process').execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (e) => (e ? reject(e) : resolve())));
}
function desktopDir() {
  const home = require('os').homedir();
  if (process.platform === 'win32') {
    // El Escritorio puede estar en OneDrive: se pregunta a Windows dónde está.
    try { return require('child_process').execFileSync('powershell', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("Desktop")'], { encoding: 'utf8', windowsHide: true }).trim() || path.join(home, 'Desktop'); } catch { return path.join(home, 'Desktop'); }
  }
  return path.join(home, 'Desktop');
}

// Cuentas del modo equipo desde la terminal (no hace falta que el servidor esté parado).
function teamCommand(pos, opt) {
  const Auth = require('../lib/auth');
  const auth = Auth.open(Store.open().dir);
  const [sub, email, extra] = pos;
  const find = (e) => {
    const u = auth.users().find((x) => x.email === String(e || '').toLowerCase());
    if (!u) throw new Error(`No account with the email ${e}`);
    return u;
  };
  const show = (u, pw) => `${u.name} <${u.email}> · ${u.role}${pw ? `\nPassword: ${pw}\n(They can change it in Mapache: their name, top right > Profile)` : ''}`;
  switch (sub) {
    case undefined: case 'status': case 'list': {
      const us = auth.users();
      const inv = auth.invites();
      return `${us.length} account(s)${us.length ? `:\n${us.map((u) => `- ${show(u)}`).join('\n')}` : '. Create the first admin with: mapache team admin you@example.com'}\n` +
        `${inv.length} pending invitation(s)${inv.map((i) => `\n- ${i.role}${i.email ? ` for ${i.email}` : ''}, expires ${new Date(i.expiresAt).toISOString().slice(0, 10)}`).join('')}`;
    }
    case 'admin': case 'add': {
      if (!email) throw new Error(`Use: mapache team ${sub} <email>`);
      const role = sub === 'admin' ? 'admin' : opt.role || 'editor';
      const pw = typeof opt.password === 'string' ? opt.password : Auth.generatePassword();
      const exists = auth.users().find((x) => x.email === email.toLowerCase());
      if (exists) return show(auth.updateUser(exists.id, { role, password: pw }), pw);
      return show(auth.createUser({ email, name: opt.name, password: pw, role }), pw);
    }
    case 'invite': {
      const t = auth.createInvite({ role: opt.role || 'editor', email: opt.email || null, createdBy: 'cli' });
      const lan = Store.lanAddress();
      const url = String(opt.url || process.env.PUBLIC_URL || `http://${lan || 'localhost'}:${Number(process.env.PORT) || 4321}`).replace(/\/+$/, '');
      return `Invitation (${opt.role || 'editor'}, valid 7 days, one person):\n${url}/#invite=${encodeURIComponent(t)}`;
    }
    case 'reset-password': {
      const u = find(email);
      const pw = Auth.generatePassword();
      auth.updateUser(u.id, { password: pw });
      auth.dropSessions(u.id);
      return show(u, pw);
    }
    case 'role': return show(auth.updateUser(find(email).id, { role: extra }));
    case 'remove': { const u = find(email); auth.removeUser(u.id); return `Removed ${u.email}`; }
    default: throw new Error(`Unknown team command "${sub}". Run: mapache help`);
  }
}

// Acceso directo en el escritorio para abrir Mapache con doble clic.
async function shortcut() {
  const node = process.execPath;
  const dir = desktopDir();
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    const lnk = path.join(dir, 'Mapache.lnk');
    await powershell(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${psq(lnk)});$s.TargetPath=${psq(path.join(ROOT, 'Abrir Mapache.cmd'))};` +
      `$s.WorkingDirectory=${psq(ROOT)};$s.IconLocation=${psq(path.join(ROOT, 'src', 'icon.ico'))};$s.WindowStyle=7;$s.Description='Mapache';$s.Save()`);
    return `Created ${lnk}`;
  }
  if (process.platform === 'darwin') {
    const file = path.join(dir, 'Mapache.command');
    fs.writeFileSync(file, `#!/bin/sh\nexec "${node}" "${ME}" open\n`, { mode: 0o755 });
    return `Created ${file}`;
  }
  const file = path.join(dir, 'mapache.desktop');
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Mapache\nComment=Mind maps and whiteboard\nExec="${node}" "${ME}" open\nIcon=${path.join(ROOT, 'src', 'icon.svg')}\nTerminal=false\nCategories=Office;\n`, { mode: 0o755 });
  return `Created ${file}`;
}

// Arranque al iniciar sesión, sin ventana.
async function autostart(on) {
  const home = require('os').homedir();
  const node = process.execPath;
  if (process.platform === 'win32') {
    const dir = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const lnk = path.join(dir, 'Mapache.lnk');
    if (!on) { try { fs.unlinkSync(lnk); } catch { /* no estaba */ } return 'Mapache will no longer start when you log in.'; }
    await powershell(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${psq(lnk)});$s.TargetPath=${psq(node)};$s.Arguments=${psq(`"${ME}" start`)};` +
      `$s.WorkingDirectory=${psq(ROOT)};$s.IconLocation=${psq(path.join(ROOT, 'src', 'icon.ico'))};$s.WindowStyle=7;$s.Description='Mapache';$s.Save()`);
    return `Mapache will start by itself when you log in (${lnk}).`;
  }
  if (process.platform === 'darwin') {
    const plist = path.join(home, 'Library', 'LaunchAgents', 'com.hackeatutiempo.mapache.plist');
    if (!on) { try { fs.unlinkSync(plist); } catch { /* no estaba */ } return 'Mapache will no longer start when you log in.'; }
    fs.mkdirSync(path.dirname(plist), { recursive: true });
    const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>com.hackeatutiempo.mapache</string>\n<key>ProgramArguments</key><array><string>${x(node)}</string><string>${x(path.join(ROOT, 'server.js'))}</string><string>--no-star</string></array>\n<key>WorkingDirectory</key><string>${x(ROOT)}</string>\n<key>RunAtLoad</key><true/>\n</dict></plist>\n`);
    return `Mapache will start by itself when you log in (${plist}).`;
  }
  const desktop = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'autostart', 'mapache.desktop');
  if (!on) { try { fs.unlinkSync(desktop); } catch { /* no estaba */ } return 'Mapache will no longer start when you log in.'; }
  fs.mkdirSync(path.dirname(desktop), { recursive: true });
  fs.writeFileSync(desktop, `[Desktop Entry]\nType=Application\nName=Mapache\nExec="${node}" "${ME}" start\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n`);
  return `Mapache will start by itself when you log in (${desktop}).`;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parse(rest);
  switch (cmd) {
    case undefined: case 'help': case '-h': case '--help':
      return console.log(HELP);
    case 'version': case '-v': case '--version':
      return console.log(version);
    case 'mcp':
      return require('../lib/mcp').serveStdio(ctx());
    case 'mcp-config':
      return console.log(mcpConfig(pos[0]));
    case 'serve':
      if (opt.team) process.env.MAPACHE_MODE = 'team';
      return require('../server.js');
    case 'team':
      return console.log(teamCommand(pos, opt));
    case 'start': {
      // --team: modo equipo (cuentas e invitaciones). --data: otra carpeta de tableros (para no mezclar los tuyos).
      if (opt.team) process.env.MAPACHE_MODE = 'team';
      if (typeof opt.data === 'string') process.env.MAPACHE_DATA = require('path').resolve(opt.data.replace(/^~(?=$|[\\/])/, require('os').homedir()));
      const info = await Launch.start({ store: Store.open() });
      const lan = info.mode === 'team' && Store.lanAddress();
      return console.log(`${info.started ? 'Started' : 'Already running'}${info.mode === 'team' ? ' (team mode)' : ''}: http://localhost:${info.port}` +
        `${lan ? `\nOn your network: http://${lan}:${info.port}` : ''}\nBoards: ${info.dataDir || Store.dataDir()}` +
        `${info.mode === 'team' && info.started ? '\nCreate the first admin with: mapache team admin you@example.com' : ''}`);
    }
    case 'stop':
      return console.log((await Launch.stop()) ? 'Mapache stopped.' : 'Mapache was not running.');
    case 'status': {
      const info = await Launch.running();
      return console.log(info ? `Running at http://localhost:${info.port} (version ${info.version}, pid ${info.pid})\nBoards: ${info.dataDir}` : `Not running (start it with: mapache start)\nBoards: ${Store.dataDir()}`);
    }
    case 'where':
      return console.log(Store.open().dir);
    case 'shortcut':
      return console.log(await shortcut());
    case 'autostart':
      if (!['on', 'off'].includes(pos[0])) throw new Error('Use: mapache autostart on|off');
      return console.log(await autostart(pos[0] === 'on'));
    case 'open': {
      let id = null;
      if (pos[0]) id = Tools.resolveBoard(Store.open(), pos.join(' '));
      return console.log(`Opened ${await openViaApp(id, true)}`);
    }
    case 'list': case 'ls':
      return run('list_boards', { folder: opt.folder });
    case 'show': case 'read': case 'cat':
      return run('read_board', { board: pos.join(' ') || 'open', format: opt.json ? 'json' : 'markdown' });
    case 'search': case 'find':
      return run('search_boards', { query: pos.join(' ') });
    case 'new': case 'create':
      return run('create_board', { title: pos.join(' '), outline: await textOf(opt.outline), folder: opt.folder, layout: opt.layout });
    case 'add': {
      const [board, parent, ...texts] = pos;
      if (!board || !parent) throw new Error('Use: mapache add <board> <parent> <text...>  (or --outline <text|-|@file>)');
      const outline = await textOf(opt.outline);
      return run('add_nodes', outline ? { board, parent, outline } : { board, parent, texts });
    }
    case 'note': {
      const [board, ...text] = pos;
      return run('add_items', { board, items: [{ type: 'note', text: (await textOf(opt.text)) || text.join(' '), color: opt.color }] });
    }
    case 'connect': {
      const [board, from, to] = pos;
      return run('connect', { board, connections: [{ from, to, label: opt.label }] });
    }
    case 'comments':
      return run('list_comments', { board: pos.join(' ') || 'open', include_resolved: !!opt.all });
    case 'comment': {
      const [board, ...text] = pos;
      const body = (await textOf(opt.text)) || text.join(' ');
      if (!board || !body) throw new Error('Use: mapache comment <board> <text> [--on <node or item>]');
      return run('add_comment', { board, text: body, on: typeof opt.on === 'string' ? opt.on : undefined });
    }
    case 'export':
      return run('export_board', { board: pos.join(' ') || 'open', format: opt.format, path: opt.out });
    case 'rename': {
      const [board, ...title] = pos;
      return run('update_board', { board, title: title.join(' ') });
    }
    case 'rm': case 'delete':
      return run('delete_board', { board: pos.join(' ') });
    case 'trash': {
      const list = Store.open().listTrash();
      return console.log(list.length ? list.map((b) => `- "${b.title || '(untitled)'}" id:${b.id} deleted ${new Date(b.deletedAt).toISOString().slice(0, 16).replace('T', ' ')}`).join('\n') : 'The trash is empty.');
    }
    case 'restore': {
      const b = Store.open().restoreBoard(pos[0]);
      return console.log(b ? `Restored "${Tools.titleOf(b)}" (${b.id}).` : `No board ${pos[0]} in the trash.`);
    }
    case 'tools':
      return console.log(Tools.tools.map((t) => `${t.name} — ${t.description}\n  ${Object.entries(t.inputSchema.properties || {}).map(([k, v]) => `${k}${(t.inputSchema.required || []).includes(k) ? '*' : ''}: ${v.type || 'any'}${v.enum ? ` (${v.enum.join('|')})` : ''}`).join(', ')}`).join('\n\n'));
    case 'tool': {
      const [name, json] = pos;
      const raw = json === '-' || (!json && !process.stdin.isTTY) ? await readStdin() : json || '{}';
      let args;
      try { args = JSON.parse(raw || '{}'); } catch { throw new Error('The arguments must be JSON, e.g. \'{"board":"open"}\''); }
      return run(name, args);
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run: mapache help`);
  }
}

// Código 2: hay una versión antigua abierta (los lanzadores lo usan para ofrecer cerrarla).
main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(e.code === 'OLD_MAPACHE' ? 2 : 1); });
