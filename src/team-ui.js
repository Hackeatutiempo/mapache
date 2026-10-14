// Modo equipo en el navegador: pantalla de acceso (entrar, crear la cuenta de admin, aceptar una invitación), quién
// está en el tablero, cursores en directo, perfil, personas e invitaciones, y tokens para conectar agentes por HTTP.
// Solo se activa si el servidor arrancó con MAPACHE_MODE=team; en modo local no hace nada.
// SPDX-License-Identifier: AGPL-3.0-or-later
(function (root) {
  'use strict';
  const t = root.MMI18n.t;
  const Store = root.MMStore;
  const { UI } = root.MMIcons;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const avatar = (u, size = 26) => `<span class="tm-avatar" style="--c:${esc(u.color || '#a78bfa')};--s:${size}px" title="${esc(u.name)}">${esc(initials(u.name))}</span>`;
  const ROLE = () => ({ admin: t('Admin'), editor: t('Puede editar'), viewer: t('Solo ver') });
  const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#22d3ee', '#f87171', '#a3e635', '#c084fc'];
  const app = () => root.mapache;
  const toast = (m) => (app() ? app().toast(m) : null);
  // El servidor responde en inglés; en español se traducen los mensajes que puede ver una persona.
  const ERR_ES = {
    'Wrong email or password': 'Email o contraseña incorrectos',
    'Too many attempts. Wait a few minutes and try again': 'Demasiados intentos. Espera unos minutos y vuelve a probar',
    'The setup code is not right. It is printed in the server log': 'El código de configuración no es correcto. Aparece en el registro del servidor',
    'This Mapache already has an admin. Log in instead': 'Este Mapache ya tiene admin. Entra con tu cuenta',
    'This invitation link is not valid any more. Ask for a new one': 'Este enlace de invitación ya no vale. Pide uno nuevo',
    'This invitation is for another email address': 'Esta invitación es para otro email',
    'There is already an account with that email': 'Ya hay una cuenta con ese email',
    'That email does not look right': 'Ese email no parece correcto',
    'The password needs at least 8 characters': 'La contraseña necesita al menos 8 caracteres',
    'The password is too long': 'La contraseña es demasiado larga',
    'Your current password is not right': 'Tu contraseña actual no es correcta',
    'The team needs at least one admin': 'El equipo necesita al menos una persona admin',
    'You cannot remove yourself': 'No puedes quitarte a ti',
    'Only an admin can do that': 'Solo una persona admin puede hacer eso',
    'Your role can only view boards': 'Tu rol solo permite ver los tableros',
    'Log in first': 'Primero tienes que entrar',
  };
  const msg = (e) => (root.MMI18n.lang === 'es' && ERR_ES[e.message]) || e.message;

  // ---------- Pantalla de acceso ----------

  async function showAuth({ expired = false } = {}) {
    const box = $('#auth');
    if (!box) return;
    document.body.classList.add('auth-open');
    box.hidden = false;
    const st = Store.status();
    const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
    let inv = null;
    if (invite) {
      try { inv = await Store.api('GET', `api/auth/invite/${encodeURIComponent(invite)}`); } catch (e) { inv = { error: e.message }; }
    }
    const view = invite && inv && !inv.error ? 'accept' : st.needsSetup ? 'setup' : 'login';
    const field = (name, label, type = 'text', extra = '') => `<label class="au-field"><span>${esc(label)}</span><input name="${name}" type="${type}" ${extra} required></label>`;
    let body;
    if (view === 'setup') {
      body = `<h1>${esc(t('Crea la cuenta de admin'))}</h1><p class="au-sub">${esc(t('Es la primera vez que se abre este Mapache de equipo. Quien crea esta cuenta lo administra.'))}</p>` +
        field('code', t('Código de configuración'), 'text', 'inputmode="numeric" autocomplete="one-time-code"') +
        `<p class="au-hint">${esc(t('Aparece en el registro del servidor al arrancar (en Docker: docker logs mapache).'))}</p>` +
        field('name', t('Tu nombre'), 'text', 'autocomplete="name"') + field('email', t('Email'), 'email', 'autocomplete="email"') +
        field('password', t('Contraseña (8 caracteres o más)'), 'password', 'autocomplete="new-password" minlength="8"') +
        `<button class="primary au-go" type="submit">${esc(t('Crear cuenta y entrar'))}</button>`;
    } else if (view === 'accept') {
      body = `<h1>${esc(t('Te han invitado a Mapache'))}</h1><p class="au-sub">${esc(t('Crea tu cuenta para entrar en los tableros del equipo.'))} <span class="au-role">${esc(ROLE()[inv.role] || inv.role)}</span></p>` +
        field('name', t('Tu nombre'), 'text', 'autocomplete="name"') +
        field('email', t('Email'), 'email', `autocomplete="email"${inv.email ? ` value="${esc(inv.email)}" readonly` : ''}`) +
        field('password', t('Contraseña (8 caracteres o más)'), 'password', 'autocomplete="new-password" minlength="8"') +
        `<button class="primary au-go" type="submit">${esc(t('Crear cuenta y entrar'))}</button>` +
        `<p class="au-alt"><a href="#" data-au="login">${esc(t('Ya tengo cuenta'))}</a></p>`;
    } else {
      body = `<h1>${esc(t('Entra en Mapache'))}</h1><p class="au-sub">${esc(expired ? t('Tu sesión ha terminado. Vuelve a entrar.') : t('Los tableros de tu equipo, en vuestro propio servidor.'))}</p>` +
        (invite && inv && inv.error ? `<p class="au-error">${esc(t('Este enlace de invitación ya no vale. Pide uno nuevo a quien administra el equipo.'))}</p>` : '') +
        field('email', t('Email'), 'email', 'autocomplete="email"') + field('password', t('Contraseña'), 'password', 'autocomplete="current-password"') +
        `<button class="primary au-go" type="submit">${esc(t('Entrar'))}</button>` +
        `<p class="au-hint">${esc(t('¿Has olvidado la contraseña? Quien administra el equipo puede darte una nueva.'))}</p>`;
    }
    box.innerHTML = `<form class="au-card" novalidate><div class="au-brand"><img src="icon.svg" alt="" width="34" height="34"><b>Mapache</b></div>${body}<p class="au-error" hidden></p></form>`;
    const form = box.querySelector('form');
    const err = form.querySelector('.au-error[hidden]');
    form.querySelector('input:not([readonly])').focus();
    box.querySelector('[data-au="login"]')?.addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname); showAuth(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const go = form.querySelector('.au-go');
      go.disabled = true;
      err.hidden = true;
      try {
        if (view === 'setup') await Store.api('POST', 'api/auth/setup', data);
        else if (view === 'accept') await Store.api('POST', 'api/auth/accept', { ...data, token: invite });
        else await Store.api('POST', 'api/auth/login', data);
        history.replaceState(null, '', location.pathname);
        location.reload();
      } catch (ex) {
        err.textContent = msg(ex);
        err.hidden = false;
        go.disabled = false;
      }
    });
  }

  // ---------- Barra superior: quién está aquí y tu menú ----------

  let people = [];
  function renderPresence() {
    const el = $('#presence');
    if (!el) return;
    const me = Store.status().user;
    const here = new Map();
    for (const p of people) if (p.board && p.board === app().mapId && (!me || p.id !== me.id)) here.set(p.id, p);
    const list = [...here.values()];
    el.innerHTML = list.slice(0, 5).map((p) => avatar(p, 26)).join('') + (list.length > 5 ? `<span class="tm-more">+${list.length - 5}</span>` : '');
    el.title = list.length ? `${t('En este tablero')}: ${list.map((p) => p.name).join(', ')}` : '';
  }

  function renderUserButton() {
    const b = $('#user-btn');
    const u = Store.status().user;
    if (!b || !u) return;
    b.hidden = false;
    b.innerHTML = avatar(u, 28);
    b.title = `${u.name} · ${ROLE()[u.role] || u.role}`;
  }

  function closeMenu() { const m = $('#tm-menu'); if (m) m.remove(); }
  function openMenu(anchor) {
    closeMenu();
    const u = Store.status().user;
    const m = document.createElement('div');
    m.id = 'tm-menu';
    m.className = 'tm-menu';
    m.innerHTML = `<div class="tm-me">${avatar(u, 34)}<div><b>${esc(u.name)}</b><small>${esc(u.email || '')}</small><span class="tm-role">${esc(ROLE()[u.role] || u.role)}</span></div></div>` +
      `<button data-tm="profile">${UI.pencil} ${esc(t('Tu perfil'))}</button>` +
      `<button data-tm="team">${UI.users} ${esc(u.role === 'admin' ? t('Personas e invitaciones') : t('Personas del equipo'))}</button>` +
      `<button data-tm="agent">${UI.sparkles} ${esc(t('Conectar agente de IA'))}</button>` +
      `<div class="tm-sep"></div><button data-tm="logout">${UI.close} ${esc(t('Cerrar sesión'))}</button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = `${r.bottom + 6}px`;
    m.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tm]');
      if (!b) return;
      closeMenu();
      const k = b.dataset.tm;
      if (k === 'profile') openTeam('profile');
      else if (k === 'team') openTeam('team');
      else if (k === 'agent') document.querySelector('#agent-open').click();
      else if (k === 'logout') Store.logout();
    });
  }

  // ---------- Cursores en directo ----------

  const cursors = new Map(); // cid -> { el, x, y, board, at }
  function placeCursors() {
    const v = app() && app().view;
    if (!v) return;
    for (const c of cursors.values()) {
      const show = c.board === app().mapId && Date.now() - c.at < 20000;
      c.el.hidden = !show;
      if (show) c.el.style.transform = `translate(${c.x * v.k + v.x}px, ${c.y * v.k + v.y}px)`;
    }
  }
  function onCursor(e) {
    const layer = $('#cursors');
    if (!layer) return;
    let c = cursors.get(e.cid);
    if (!c) {
      const el = document.createElement('div');
      el.className = 'tm-cursor';
      el.innerHTML = `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1.5L16 8.6l-6.3 1.9L6.6 17z" fill="${esc(e.color)}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="background:${esc(e.color)}">${esc(e.name)}</span>`;
      layer.appendChild(el);
      c = { el };
      cursors.set(e.cid, c);
    }
    Object.assign(c, { x: e.x, y: e.y, board: e.board, at: Date.now() });
    placeCursors();
  }
  setInterval(() => {
    const alive = new Set(people.map((p) => p.cid));
    for (const [cid, c] of cursors) if (!alive.has(cid) || Date.now() - c.at > 60000) { c.el.remove(); cursors.delete(cid); }
    placeCursors();
  }, 2000);

  // ---------- Perfil, personas e invitaciones ----------

  async function openTeam(tab = 'team') {
    const box = $('#team-modal');
    box.hidden = false;
    const u = Store.status().user;
    const admin = u.role === 'admin';
    let data = { users: Store.members(), invites: [] };
    try { data = await Store.api('GET', 'api/team'); } catch { /* sin conexión: se muestra lo último conocido */ }
    const roleSelect = (cur, attrs = '') => `<select ${attrs}>${Object.entries(ROLE()).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    const tabs = `<div class="tm-tabs"><button data-tab="profile" aria-selected="${tab === 'profile'}">${esc(t('Tu perfil'))}</button><button data-tab="team" aria-selected="${tab === 'team'}">${esc(t('Personas'))}</button></div>`;
    let body;
    if (tab === 'profile') {
      body = `<label class="au-field"><span>${esc(t('Nombre'))}</span><input name="name" value="${esc(u.name)}" maxlength="60"></label>` +
        `<div class="au-field"><span>${esc(t('Color'))}</span><div class="tm-colors">${COLORS.map((c) => `<button class="tm-color${c === u.color ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>` +
        `<button class="primary" data-tm-save="profile">${esc(t('Guardar'))}</button>` +
        `<h3>${esc(t('Cambiar la contraseña'))}</h3>` +
        `<label class="au-field"><span>${esc(t('Contraseña actual'))}</span><input name="current" type="password" autocomplete="current-password"></label>` +
        `<label class="au-field"><span>${esc(t('Contraseña nueva (8 caracteres o más)'))}</span><input name="next" type="password" autocomplete="new-password" minlength="8"></label>` +
        `<button class="ghost" data-tm-save="password">${esc(t('Cambiar la contraseña'))}</button>`;
    } else {
      body = `<div class="tm-people">${data.users.map((p) => `<div class="tm-person" data-user="${esc(p.id)}">${avatar(p, 30)}<div class="tm-who"><b>${esc(p.name)}${p.id === u.id ? ` <small>(${esc(t('tú'))})</small>` : ''}</b><small>${esc(p.email || '')}</small></div>` +
        (admin && p.id !== u.id ? `${roleSelect(p.role, 'data-role')}<button class="icon-btn" data-reset title="${esc(t('Darle una contraseña nueva'))}">${UI.rotate}</button><button class="icon-btn" data-remove title="${esc(t('Quitar del equipo'))}">${UI.trash}</button>`
          : `<span class="tm-role">${esc(ROLE()[p.role] || p.role)}</span>`) + '</div>').join('')}</div>`;
      if (admin) {
        body += `<h3>${esc(t('Invitar a alguien'))}</h3><div class="tm-invite">${roleSelect('editor', 'name="invite-role"')}<input name="invite-email" type="email" placeholder="${esc(t('Email (opcional)'))}"><button class="primary" data-tm-save="invite">${esc(t('Crear enlace'))}</button></div>` +
          `<div class="tm-link" hidden><pre></pre><button class="ghost" data-copy-link>${esc(t('Copiar'))}</button><p class="au-hint">${esc(t('Envíaselo a esa persona. Vale 7 días y para una sola cuenta.'))}</p></div>` +
          (data.invites && data.invites.length ? `<h3>${esc(t('Invitaciones pendientes'))}</h3>${data.invites.map((i) => `<div class="tm-person" data-invite="${esc(i.id)}"><div class="tm-who"><b>${esc(ROLE()[i.role] || i.role)}</b><small>${esc(i.email || t('Cualquier email'))} · ${esc(t('caduca el {date}', { date: new Date(i.expiresAt).toLocaleDateString(root.MMI18n.locale) }))}</small></div><button class="icon-btn" data-revoke title="${esc(t('Anular'))}">${UI.trash}</button></div>`).join('')}` : '');
      }
    }
    box.innerHTML = `<div class="modal-card tm-card" role="dialog" aria-modal="true"><button class="icon-btn about-close" data-tm-close aria-label="${esc(t('Cerrar'))}">${UI.close}</button>` +
      `<h2>${esc(tab === 'profile' ? t('Tu perfil') : t('Personas del equipo'))}</h2>${tabs}<div class="tm-body">${body}</div><p class="au-error" hidden></p></div>`;
    const card = box.querySelector('.tm-card');
    const err = card.querySelector('.au-error');
    const fail = (e) => { err.textContent = msg(e); err.hidden = false; };
    let color = u.color;
    card.onclick = async (e) => {
      err.hidden = true;
      const tb = e.target.closest('[data-tab]');
      if (tb) return openTeam(tb.dataset.tab);
      if (e.target.closest('[data-tm-close]')) { box.hidden = true; return; }
      const c = e.target.closest('[data-color]');
      if (c) { color = c.dataset.color; card.querySelectorAll('.tm-color').forEach((x) => x.classList.toggle('on', x === c)); return; }
      const save = e.target.closest('[data-tm-save]');
      try {
        if (save && save.dataset.tmSave === 'profile') {
          await Store.api('PATCH', 'api/me', { name: card.querySelector('[name=name]').value, color });
          toast(t('Perfil guardado'));
          setTimeout(() => location.reload(), 600);
        } else if (save && save.dataset.tmSave === 'password') {
          await Store.api('PATCH', 'api/me', { currentPassword: card.querySelector('[name=current]').value, password: card.querySelector('[name=next]').value });
          toast(t('Contraseña cambiada'));
          card.querySelector('[name=current]').value = card.querySelector('[name=next]').value = '';
        } else if (save && save.dataset.tmSave === 'invite') {
          const r = await Store.api('POST', 'api/team/invites', { role: card.querySelector('[name=invite-role]').value, email: card.querySelector('[name=invite-email]').value || null });
          const l = card.querySelector('.tm-link');
          l.hidden = false;
          l.querySelector('pre').textContent = r.link;
        } else if (e.target.closest('[data-copy-link]')) {
          await navigator.clipboard.writeText(card.querySelector('.tm-link pre').textContent);
          toast(t('Enlace copiado'));
        } else if (e.target.closest('[data-revoke]')) {
          await Store.api('DELETE', `api/team/invites/${e.target.closest('[data-invite]').dataset.invite}`);
          openTeam('team');
        } else if (e.target.closest('[data-remove]')) {
          const row = e.target.closest('[data-user]');
          const name = row.querySelector('b').textContent;
          if (await app().uiConfirm(t('{name} dejará de tener acceso a los tableros del equipo.', { name }), { title: t('¿Quitar del equipo?'), ok: t('Quitar'), danger: true })) {
            await Store.api('DELETE', `api/team/users/${row.dataset.user}`);
            openTeam('team');
          }
        } else if (e.target.closest('[data-reset]')) {
          const row = e.target.closest('[data-user]');
          const r = await Store.api('PATCH', `api/team/users/${row.dataset.user}`, { resetPassword: true });
          const who = { name: row.querySelector('b').textContent, password: r.password };
          await app().uiAlert(`${t('Contraseña nueva para {name}: {password}', who)}\n${t('Dásela por un canal privado; podrá cambiarla en su perfil.')}`, { title: t('Contraseña nueva') });
        }
      } catch (ex) { fail(ex); }
    };
    card.onchange = async (e) => {
      const sel = e.target.closest('[data-role]');
      if (!sel) return;
      try { await Store.api('PATCH', `api/team/users/${e.target.closest('[data-user]').dataset.user}`, { role: sel.value }); toast(t('Rol cambiado')); } catch (ex) { fail(ex); openTeam('team'); }
    };
  }

  // ---------- Conectar un agente por HTTP (modo equipo) ----------

  let freshToken = null;
  async function fillAgent(box) {
    const st = Store.status();
    const url = `${st.url || location.origin}/mcp`;
    const tok = freshToken || t('TU_TOKEN');
    const auth = `Authorization: Bearer ${tok}`;
    const json = (o) => JSON.stringify(o, null, 2);
    const tabs = [
      ['claude-code', 'Claude Code', `claude mcp add --transport http mapache ${url} --header "${auth}"`, t('Ejecútalo en una terminal y abre una conversación nueva de Claude Code.')],
      ['codex', 'Codex', `# ~/.codex/config.toml\n[mcp_servers.mapache]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${tok}" }`, t('Añádelo al archivo de configuración de Codex y abre una sesión nueva.')],
      ['cursor', 'Cursor', json({ mcpServers: { mapache: { url, headers: { Authorization: `Bearer ${tok}` } } } }), t('Añádelo a ~/.cursor/mcp.json (o en Cursor: Ajustes > MCP).')],
      ['vscode', 'VS Code', json({ servers: { mapache: { type: 'http', url, headers: { Authorization: `Bearer ${tok}` } } } }), t('En VS Code: paleta de comandos > «MCP: Open User Configuration», y pega esto.')],
      ['gemini', 'Gemini CLI', `gemini mcp add --transport http mapache ${url} --header "${auth}"`, t('Ejecútalo en una terminal y abre una sesión nueva.')],
      ['claude-desktop', 'Claude Desktop', json({ mcpServers: { mapache: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', auth] } } }),
        t('Claude Desktop usa servidores locales: este puente (mcp-remote, necesita Node.js) conecta con el de tu equipo. Añádelo a claude_desktop_config.json y reinicia Claude.')],
    ];
    const cur = tabs.find((x) => x[0] === (box.dataset.tab || 'claude-code')) || tabs[0];
    box.querySelector('#agent-tabs').innerHTML = tabs.map(([k, name]) => `<button role="tab" data-team-tab="${k}" aria-selected="${k === cur[0]}">${esc(name)}</button>`).join('');
    box.querySelector('#agent-snippet').textContent = cur[2];
    box.querySelector('#agent-hint').textContent = cur[3];
    box.querySelector('#agent-prompt').textContent = t('Conecta Mapache contigo como servidor MCP por HTTP: la dirección es {url} y cada petición lleva la cabecera «Authorization: Bearer {token}». Si hace falta, sigue la sección «Connect Mapache to your AI agent» de https://github.com/Hackeatutiempo/mapache/blob/main/AGENTS.md. Cuando esté conectado, dime cómo usarlo.', { url, token: tok });
    let list = [];
    try { list = (await Store.api('GET', 'api/me/tokens')).tokens; } catch { /* sin conexión */ }
    const where = box.querySelector('#agent-where');
    where.classList.remove('warn');
    where.innerHTML = `<div class="tm-tokens"><b>${esc(t('Tus tokens para agentes'))}</b> <button class="ghost" data-new-token>${esc(t('Crear un token'))}</button>` +
      (freshToken ? `<p class="tm-fresh">${esc(t('Cópialo ahora: es la única vez que se muestra. Ya está puesto en el texto y en las órdenes de arriba.'))}</p>` : `<p class="au-hint">${esc(t('Cada agente actúa con tu cuenta y tu rol. Crea un token y aparecerá arriba, listo para copiar.'))}</p>`) +
      list.map((x) => `<div class="tm-person" data-token="${esc(x.id)}"><div class="tm-who"><b>${esc(x.name)}</b><small>${esc(t('creado el {date}', { date: new Date(x.createdAt).toLocaleDateString(root.MMI18n.locale) }))}</small></div><button class="icon-btn" data-revoke-token title="${esc(t('Anular'))}">${UI.trash}</button></div>`).join('') + '</div>';
    if (!box.dataset.teamBound) {
      box.dataset.teamBound = '1';
      box.addEventListener('click', async (e) => {
        const tb = e.target.closest('[data-team-tab]');
        if (tb) { e.stopPropagation(); box.dataset.tab = tb.dataset.teamTab; return fillAgent(box); }
        if (e.target.closest('[data-new-token]')) {
          e.stopPropagation();
          try { freshToken = (await Store.api('POST', 'api/me/tokens', { name: t('Agente de IA') })).token; } catch (ex) { toast(msg(ex)); }
          return fillAgent(box);
        }
        const rv = e.target.closest('[data-revoke-token]');
        if (rv) {
          e.stopPropagation();
          await Store.api('DELETE', `api/me/tokens/${rv.closest('[data-token]').dataset.token}`).catch(() => {});
          freshToken = null;
          return fillAgent(box);
        }
      }, true);
    }
  }

  // ---------- Arranque ----------

  let started = false;
  function init() {
    const st = Store.status();
    if (started || !st.team) return;
    started = true;
    document.body.classList.add('team');
    renderUserButton();
    $('#user-btn')?.addEventListener('click', (e) => { e.stopPropagation(); if ($('#tm-menu')) closeMenu(); else openMenu(e.currentTarget); });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#tm-menu, #user-btn')) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); const m = $('#team-modal'); if (m && !m.hidden) m.hidden = true; } });
    $('#team-modal')?.addEventListener('click', (e) => { if (e.target.id === 'team-modal') e.target.hidden = true; });
    people = Store.people();
    Store.on((e) => {
      if (e.type === 'presence') { people = e.people; renderPresence(); }
      else if (e.type === 'cursor') onCursor(e);
      else if (e.type === 'team') renderUserButton();
    });
    root.addEventListener('mapache:view', placeCursors);
    root.addEventListener('hashchange', () => setTimeout(renderPresence, 300));
    // Tu cursor, en coordenadas del tablero.
    $('#stage').addEventListener('pointermove', (e) => {
      const a = app();
      if (!a || !a.mapId) return;
      const p = a.toWorld(e.clientX, e.clientY);
      Store.cursor(a.mapId, p.x, p.y);
    });
    // Al cambiar de tablero se actualiza quién está.
    let lastMap = null;
    setInterval(() => { const id = app() && app().mapId; if (id !== lastMap) { lastMap = id; renderPresence(); placeCursors(); } }, 500);
    renderPresence();
  }

  root.MMTeamUI = { showAuth, init, fillAgent };
})(window);
