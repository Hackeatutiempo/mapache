// Servidor MCP (Model Context Protocol) de Mapache, sin dependencias: JSON-RPC 2.0 sobre la entrada y salida
// estándar (stdio), que es como lo arrancan Claude, ChatGPT, Codex o Cursor, o sobre HTTP en /mcp (server.js).
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const Tools = require('./tools');
const { version } = require('../package.json');

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Mapache is the person's mind map and whiteboard app. Boards live as files on this computer; when Mapache is open in the browser, every change you make appears there live.
- Start with list_boards, then read_board to get ids. "open" as board means the board the person is looking at.
- Mind maps are trees of nodes: add_nodes takes an indented outline (one idea per line, indent to nest). Keep node texts short (a few words); put longer text in notes (add_items).
- Refer to nodes and items by the ids that read_board shows (texts also work when unique).
- Several things at once: pass lists (add_items, update_nodes, connect) instead of many calls.
- Do not delete anything unless the person asks. Deleted boards go to the trash.
- After a big change, offer to open the board with open_board.`;

function makeServer({ store, open, exportBoard } = {}) {
  const ctx = { store, open, exportBoard };
  const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
  const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  async function handle(msg) {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(handle))).filter(Boolean);
      return out.length ? out : null;
    }
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return msg && msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) ? null : err(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid request');
    }
    const { id, method, params = {} } = msg;
    const isNote = id === undefined;
    try {
      switch (method) {
        case 'initialize': {
          const asked = params.protocolVersion;
          return ok(id, {
            protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'mapache', title: 'Mapache', version },
            instructions: INSTRUCTIONS,
          });
        }
        case 'ping': return isNote ? null : ok(id, {});
        case 'tools/list':
          return ok(id, { tools: Tools.tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.annotations } })) });
        case 'tools/call': {
          try {
            const text = await Tools.call(params.name, params.arguments || {}, ctx);
            return ok(id, { content: [{ type: 'text', text: String(text) }] });
          } catch (e) {
            // Un fallo de la herramienta se devuelve como resultado para que el agente lo lea y lo corrija.
            if (!e.status && !(e instanceof SyntaxError)) console.error(e);
            return ok(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
          }
        }
        case 'resources/list': return ok(id, { resources: [] });
        case 'resources/templates/list': return ok(id, { resourceTemplates: [] });
        case 'prompts/list': return ok(id, { prompts: [] });
        case 'logging/setLevel': return ok(id, {});
        default:
          if (method.startsWith('notifications/')) return null;
          return isNote ? null : err(id, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      return isNote ? null : err(id, -32603, e.message);
    }
  }
  return { handle };
}

// Mensajes de una línea cada uno (así lo define MCP para stdio). Lo que no es respuesta va a stderr.
function serveStdio(opts) {
  const server = makeServer(opts);
  let buf = '';
  const send = (m) => { if (m) process.stdout.write(`${JSON.stringify(m)}\n`); };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      server.handle(msg).then(send, (e) => console.error(e));
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

module.exports = { makeServer, serveStdio, VERSIONS, INSTRUCTIONS };
