// Cuentas del modo equipo: personas (email y contraseña), sesiones, invitaciones por enlace y tokens para agentes.
// Sin dependencias: contraseñas con scrypt (node:crypto) y todo guardado en la carpeta de datos.
// - users.json: { users: [{ id, email, name, role, color, pass, createdAt }], invites: [...], tokens: [...] }
// - sessions.json: { sessions: [{ hash, userId, createdAt, expiresAt }] }
// Los tokens (de sesión, de invitación y de API) nunca se guardan tal cual: solo su hash SHA-256.
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeAtomic } = require('./store');

const ROLES = ['admin', 'editor', 'viewer'];
const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#22d3ee', '#f87171', '#a3e635', '#c084fc'];
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const key = crypto.scryptSync(String(pw), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [kind, N, r, p, salt, key] = String(stored || '').split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(want, got);
}
function checkNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) fail('The password needs at least 8 characters');
  if (pw.length > 200) fail('The password is too long');
}
// Contraseña fácil de dictar para crear o recuperar una cuenta desde la línea de comandos.
const generatePassword = () => token(12).replace(/[-_]/g, 'x');

function open(dir) {
  const usersFile = path.join(dir, 'users.json');
  const sessionsFile = path.join(dir, 'sessions.json');
  const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
  const load = () => {
    const d = read(usersFile, {});
    return { users: d.users || [], invites: d.invites || [], tokens: d.tokens || [] };
  };
  const save = (d) => writeAtomic(usersFile, JSON.stringify(d, null, 1));
  const change = (fn) => { const d = load(); const out = fn(d); save(d); return out; };

  // Datos públicos de una persona (nunca la contraseña).
  const pub = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, color: u.color, createdAt: u.createdAt };
  const users = () => load().users.map(pub);
  const userById = (id) => pub(load().users.find((u) => u.id === id));
  const needsSetup = () => load().users.length === 0;

  function createUser({ email, name, password, role = 'editor' }) {
    email = normEmail(email);
    if (!validEmail(email)) fail('That email does not look right');
    if (!ROLES.includes(role)) fail('Unknown role');
    checkNewPassword(password);
    return change((d) => {
      if (d.users.some((u) => u.email === email)) fail('There is already an account with that email', 409);
      const u = { id: crypto.randomUUID(), email, name: String(name || email.split('@')[0]).trim().slice(0, 60) || email,
        role, color: COLORS[d.users.length % COLORS.length], pass: hashPassword(password), createdAt: Date.now() };
      d.users.push(u);
      return pub(u);
    });
  }

  function verify(email, password) {
    const u = load().users.find((x) => x.email === normEmail(email));
    // Se calcula el hash aunque no exista la cuenta, para no delatar por el tiempo qué emails existen.
    const ok = checkPassword(password, u ? u.pass : 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64'));
    return ok && u ? pub(u) : null;
  }

  function updateUser(id, patch) {
    return change((d) => {
      const u = d.users.find((x) => x.id === id);
      if (!u) fail('Not found', 404);
      if (patch.name != null) u.name = String(patch.name).trim().slice(0, 60) || u.name;
      if (patch.color != null && /^#[0-9a-f]{6}$/i.test(patch.color)) u.color = patch.color;
      if (patch.role != null) {
        if (!ROLES.includes(patch.role)) fail('Unknown role');
        if (u.role === 'admin' && patch.role !== 'admin' && d.users.filter((x) => x.role === 'admin').length === 1) fail('The team needs at least one admin');
        u.role = patch.role;
      }
      if (patch.password != null) { checkNewPassword(patch.password); u.pass = hashPassword(patch.password); }
      return pub(u);
    });
  }

  function removeUser(id) {
    change((d) => {
      const u = d.users.find((x) => x.id === id);
      if (!u) fail('Not found', 404);
      if (u.role === 'admin' && d.users.filter((x) => x.role === 'admin').length === 1) fail('The team needs at least one admin');
      d.users = d.users.filter((x) => x.id !== id);
      d.tokens = d.tokens.filter((t) => t.userId !== id);
    });
    dropSessions(id);
  }

  // ---------- Sesiones ----------
  let sessions = read(sessionsFile, {}).sessions || [];
  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; writeAtomic(sessionsFile, JSON.stringify({ sessions })); try { sessionsMtime = fs.statSync(sessionsFile).mtimeMs; } catch { /* nada */ } }, 50);
  };
  // La línea de comandos se cierra enseguida: guarda ya.
  const persistNow = () => { clearTimeout(saveTimer); saveTimer = null; writeAtomic(sessionsFile, JSON.stringify({ sessions })); };
  const now = () => Date.now();
  function createSession(userId) {
    const t = token();
    sessions = sessions.filter((s) => s.expiresAt > now());
    sessions.push({ hash: sha(t), userId, createdAt: now(), expiresAt: now() + SESSION_DAYS * 86400000 });
    persist();
    return t;
  }
  let sessionsMtime = 0;
  function freshSessions() {
    try {
      const m = fs.statSync(sessionsFile).mtimeMs;
      if (m !== sessionsMtime && !saveTimer) { sessionsMtime = m; sessions = read(sessionsFile, {}).sessions || []; }
    } catch { /* aún no hay archivo */ }
  }
  function sessionUser(t) {
    if (!t) return null;
    freshSessions();
    const h = sha(t);
    const s = sessions.find((x) => x.hash === h && x.expiresAt > now());
    return s ? userById(s.userId) : null;
  }
  function endSession(t) { const h = sha(t); sessions = sessions.filter((s) => s.hash !== h); persist(); }
  function dropSessions(userId) { freshSessions(); sessions = sessions.filter((s) => s.userId !== userId); persistNow(); }

  // ---------- Invitaciones ----------
  function createInvite({ role = 'editor', createdBy, email = null }) {
    if (!ROLES.includes(role)) fail('Unknown role');
    const t = token(24);
    change((d) => {
      d.invites = d.invites.filter((i) => i.expiresAt > now() && !i.usedAt);
      d.invites.push({ id: crypto.randomUUID(), hash: sha(t), role, email: email ? normEmail(email) : null, createdBy, createdAt: now(), expiresAt: now() + INVITE_DAYS * 86400000 });
    });
    return t;
  }
  const findInvite = (t) => load().invites.find((i) => i.hash === sha(t) && i.expiresAt > now() && !i.usedAt) || null;
  const invites = () => load().invites.filter((i) => i.expiresAt > now() && !i.usedAt).map(({ hash, ...i }) => i);
  function revokeInvite(id) { change((d) => { d.invites = d.invites.filter((i) => i.id !== id); }); }
  function acceptInvite(t, { email, name, password }) {
    const inv = findInvite(t);
    if (!inv) fail('This invitation link is not valid any more. Ask for a new one', 410);
    if (inv.email && normEmail(email) !== inv.email) fail('This invitation is for another email address', 403);
    const u = createUser({ email, name, password, role: inv.role });
    change((d) => { const i = d.invites.find((x) => x.id === inv.id); if (i) { i.usedAt = now(); i.usedBy = u.id; } });
    return u;
  }

  // ---------- Tokens para agentes (MCP y API) ----------
  function createToken(userId, name) {
    const t = `mpk_${token(32)}`;
    change((d) => { d.tokens.push({ id: crypto.randomUUID(), userId, name: String(name || 'Agent').slice(0, 60), hash: sha(t), createdAt: now() }); });
    return t;
  }
  const tokensOf = (userId) => load().tokens.filter((t) => t.userId === userId).map(({ hash, ...t }) => t);
  function revokeToken(userId, id) { change((d) => { d.tokens = d.tokens.filter((t) => !(t.id === id && t.userId === userId)); }); }
  function tokenUser(t) {
    if (!t || !String(t).startsWith('mpk_')) return null;
    const rec = load().tokens.find((x) => x.hash === sha(t));
    return rec ? userById(rec.userId) : null;
  }

  return { users, userById, needsSetup, createUser, verify, updateUser, removeUser, createSession, sessionUser, endSession, dropSessions,
    createInvite, findInvite, invites, revokeInvite, acceptInvite, createToken, tokensOf, revokeToken, tokenUser };
}

// Límite de intentos (por ejemplo, de acceso): n intentos por ventana de tiempo y clave.
function limiter(n, ms) {
  const hits = new Map();
  return (key) => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < t) { hits.set(key, { count: 1, reset: t + ms }); return true; }
    h.count += 1;
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
    return h.count <= n;
  };
}

module.exports = { open, ROLES, hashPassword, checkPassword, generatePassword, limiter, sha, token };
