// Rutas del modo equipo: acceso, primera cuenta (admin), invitaciones, personas y roles, perfil y tokens para agentes.
// Las usa server.js cuando arranca con MAPACHE_MODE=team.
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const crypto = require('crypto');
const Auth = require('./auth');

const COOKIE = 'mapache_session';

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function makeTeam({ auth, send, readJSON, origin, secure, onTeamChange, onSignOut = () => {} }) {
  const loginLimit = Auth.limiter(10, 15 * 60 * 1000);
  const ipOf = (req) => String(req.socket.remoteAddress || '');
  // Código para crear la primera cuenta (admin): se imprime en el registro del servidor, así nadie de fuera puede
  // adelantarse si el servidor ya está expuesto a internet.
  let setupCode = auth.needsSetup() ? `${crypto.randomInt(100000, 999999)}` : null;

  const setSession = (req, res, userId) => {
    const t = auth.createSession(userId);
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(t)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${secure(req) ? '; Secure' : ''}`);
  };
  const clearSession = (req, res) => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure(req) ? '; Secure' : ''}`);

  // Quién hace la petición: sesión (cookie) o token de agente (Authorization: Bearer mpk_…).
  function who(req) {
    const h = String(req.headers.authorization || '');
    if (/^Bearer\s+/i.test(h)) {
      const u = auth.tokenUser(h.replace(/^Bearer\s+/i, '').trim());
      return u ? { ...u, via: 'token' } : null;
    }
    const u = auth.sessionUser(cookies(req)[COOKIE]);
    return u ? { ...u, via: 'cookie' } : null;
  }

  const inviteLink = (req, t) => `${origin(req)}/#invite=${encodeURIComponent(t)}`;

  // /api/auth/*: sin sesión. Devuelve true si atendió la petición.
  async function authRoutes(req, res, parts) {
    const [, action, arg] = parts; // ['auth', action, arg]
    const m = req.method;
    if (action === 'login' && m === 'POST') {
      const b = await readJSON(req);
      const email = String((b && b.email) || '').toLowerCase();
      if (!loginLimit(`${ipOf(req)}|${email}`) || !loginLimit(ipOf(req))) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again' }), true;
      const u = auth.verify(email, b && b.password);
      if (!u) return send(res, 401, { error: 'Wrong email or password' }), true;
      setSession(req, res, u.id);
      return send(res, 200, { user: u }), true;
    }
    if (action === 'logout' && m === 'POST') {
      const t = cookies(req)[COOKIE];
      const u = t && auth.sessionUser(t);
      if (t) auth.endSession(t);
      clearSession(req, res);
      if (u) onSignOut(u.id, t);
      return send(res, 200, { ok: true }), true;
    }
    if (action === 'setup' && m === 'POST') {
      const b = await readJSON(req);
      if (!auth.needsSetup() || !setupCode) return send(res, 409, { error: 'This Mapache already has an admin. Log in instead' }), true;
      if (!loginLimit(`setup|${ipOf(req)}`)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again' }), true;
      const given = Buffer.from(String((b && b.code) || '').trim());
      const want = Buffer.from(setupCode);
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(res, 403, { error: 'The setup code is not right. It is printed in the server log' }), true;
      const u = auth.createUser({ email: b.email, name: b.name, password: b.password, role: 'admin' });
      setupCode = null;
      setSession(req, res, u.id);
      onTeamChange();
      return send(res, 200, { user: u }), true;
    }
    if (action === 'invite' && arg && m === 'GET') {
      const inv = auth.findInvite(arg);
      return send(res, inv ? 200 : 410, inv ? { role: inv.role, email: inv.email } : { error: 'This invitation link is not valid any more. Ask for a new one' }), true;
    }
    if (action === 'accept' && m === 'POST') {
      const b = await readJSON(req);
      if (!loginLimit(`accept|${ipOf(req)}`)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again' }), true;
      const u = auth.acceptInvite(String((b && b.token) || ''), { email: b.email, name: b.name, password: b.password });
      setSession(req, res, u.id);
      onTeamChange();
      return send(res, 200, { user: u }), true;
    }
    return false;
  }

  // /api/team/* y /api/me/*: con sesión. Devuelve true si atendió la petición.
  async function teamRoutes(req, res, parts, user) {
    const [kind, sub, id] = parts;
    const m = req.method;
    const admin = user.role === 'admin';
    if (kind === 'team') {
      // Todos ven quién forma parte del equipo (para mencionar); solo admin ve emails, invitaciones y cambia roles.
      if (!sub && m === 'GET') {
        const users = auth.users().map((u) => (admin || u.id === user.id ? u : { id: u.id, name: u.name, color: u.color, role: u.role }));
        return send(res, 200, admin ? { users, invites: auth.invites() } : { users }), true;
      }
      if (!admin) return send(res, 403, { error: 'Only an admin can do that' }), true;
      if (sub === 'invites' && !id && m === 'POST') {
        const b = (await readJSON(req)) || {};
        const t = auth.createInvite({ role: b.role || 'editor', email: b.email || null, createdBy: user.id });
        return send(res, 200, { link: inviteLink(req, t), role: b.role || 'editor' }), true;
      }
      if (sub === 'invites' && id && m === 'DELETE') { auth.revokeInvite(id); return send(res, 200, { ok: true }), true; }
      if (sub === 'users' && id && m === 'PATCH') {
        const b = (await readJSON(req)) || {};
        if (b.resetPassword) {
          const password = Auth.generatePassword();
          auth.updateUser(id, { password });
          auth.dropSessions(id);
          onSignOut(id);
          return send(res, 200, { password }), true;
        }
        const u = auth.updateUser(id, { role: b.role });
        if (b.role) { auth.dropSessions(id); onSignOut(id); } // con el rol nuevo, que vuelva a entrar
        onTeamChange();
        return send(res, 200, { user: u }), true;
      }
      if (sub === 'users' && id && m === 'DELETE') {
        if (id === user.id) return send(res, 400, { error: 'You cannot remove yourself' }), true;
        auth.removeUser(id);
        onSignOut(id);
        onTeamChange();
        return send(res, 200, { ok: true }), true;
      }
    }
    if (kind === 'me') {
      if (!sub && m === 'GET') return send(res, 200, { user: auth.userById(user.id) }), true;
      if (!sub && m === 'PATCH') {
        const b = (await readJSON(req)) || {};
        if (b.password != null && !auth.verify(user.email, b.currentPassword)) return send(res, 403, { error: 'Your current password is not right' }), true;
        const u = auth.updateUser(user.id, { name: b.name, color: b.color, password: b.password });
        onTeamChange();
        return send(res, 200, { user: u }), true;
      }
      if (sub === 'tokens' && !id && m === 'GET') return send(res, 200, { tokens: auth.tokensOf(user.id) }), true;
      if (sub === 'tokens' && !id && m === 'POST') {
        const b = (await readJSON(req)) || {};
        return send(res, 200, { token: auth.createToken(user.id, b.name || 'AI agent') }), true;
      }
      if (sub === 'tokens' && id && m === 'DELETE') { auth.revokeToken(user.id, id); return send(res, 200, { ok: true }), true; }
    }
    return false;
  }

  return { who, authRoutes, teamRoutes, setupCode: () => setupCode };
}

module.exports = { makeTeam, COOKIE, cookies };
