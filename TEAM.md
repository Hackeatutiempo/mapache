# Mapache for teams

Run one Mapache for your whole team on your own server: accounts with email and password, invitation links,
roles, everyone's changes live on screen with names and cursors, comments, and AI agents that work with each
person's account. No cloud, no per-seat price: the boards live on a disk you control.

The personal, single-computer mode (the default) is unchanged and needs none of this.

## What you get

- **Accounts** with email and password (scrypt-hashed), sessions that last 30 days, and a limit on wrong attempts.
- **Invitation links** that work for one person and 7 days, optionally tied to an email.
- **Roles**: *Admin* (manages people), *Can edit*, *Can view* (read-only: they can look, follow along and export).
- **Live collaboration**: see who is on the board, their cursors with their names, and every change as it happens.
  Simultaneous edits are merged per node, item and field.
- **AI agents per person**: each person creates a token and connects Claude Code, Codex, Cursor, VS Code or Gemini
  over HTTP. The agent acts with that person's account and role.

## Start it with Docker (recommended)

You need a computer or server with [Docker](https://docs.docker.com/get-docker/).

```bash
git clone https://github.com/Hackeatutiempo/mapache.git
cd mapache
docker compose up -d
docker logs mapache        # shows the setup code for the first account
```

Open `http://<server address>:4321`, enter the **setup code** from the log and create the admin account. That's it.

> Prefer not to use the web for the first account? Set `MAPACHE_ADMIN_EMAIL` and `MAPACHE_ADMIN_PASSWORD` (in a
> `.env` file next to `docker-compose.yml`) before the first start, or run
> `docker exec -it mapache node bin/mapache.js team admin you@example.com`, which prints a password.

### With your own domain and HTTPS

Point a domain (for example `mapache.yourcompany.com`) to the server, then create a `.env` file:

```env
DOMAIN=mapache.yourcompany.com
PUBLIC_URL=https://mapache.yourcompany.com
TRUST_PROXY=1
```

and start it with the HTTPS profile, which adds [Caddy](https://caddyserver.com) and gets the certificate by itself:

```bash
docker compose --profile https up -d
```

Ports 80 and 443 must be open. Use HTTPS whenever people connect over the internet.

### Without Docker

```bash
MAPACHE_MODE=team PUBLIC_URL=https://mapache.yourcompany.com node server.js
```

(PowerShell: `$env:MAPACHE_MODE='team'; node server.js`.) It listens on all interfaces, port `PORT` (4321 by
default). Put it behind a reverse proxy with HTTPS and set `TRUST_PROXY=1`. Without team mode, Mapache refuses to
listen anywhere but `localhost`: boards are never exposed without accounts.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `MAPACHE_MODE` | `local` | `team` turns on accounts, invitations, roles and presence |
| `PUBLIC_URL` | from the request | The address people use, for invitation links and checking where requests come from |
| `PORT` | `4321` | Port to listen on |
| `HOST` | `0.0.0.0` in team mode | Interface to listen on |
| `TRUST_PROXY` | `0` | `1` behind a reverse proxy: trust `X-Forwarded-Proto` and `X-Forwarded-Host` |
| `MAPACHE_DATA` | `/data` in Docker, `~/.mapache` otherwise | Where boards, accounts and videos are saved |
| `MAPACHE_ADMIN_EMAIL`, `MAPACHE_ADMIN_PASSWORD`, `MAPACHE_ADMIN_NAME` | — | Create the admin account on the first start |

## People and invitations

In Mapache, click your avatar (top right) > **People and invitations**:

- **Invite someone**: choose the role, optionally their email, and **Create link**. Send them the link; they choose
  their name and password.
- Change roles, give someone a new password, or remove them. Changing a role or a password signs that person out
  everywhere so the change applies at once.

From the server's terminal (useful in Docker, prefix with `docker exec -it mapache`):

```bash
node bin/mapache.js team                         # people and pending invitations
node bin/mapache.js team invite --role editor    # print an invitation link
node bin/mapache.js team add ana@example.com --role viewer
node bin/mapache.js team reset-password ana@example.com
node bin/mapache.js team role ana@example.com admin
node bin/mapache.js team remove ana@example.com
```

## Connect an AI agent

Each person: open **Connect your AI agent** (bottom left), click **Create a token**, and copy the command for your
agent. For example, with Claude Code:

```bash
claude mcp add --transport http mapache https://mapache.yourcompany.com/mcp --header "Authorization: Bearer mpk_…"
```

The token is shown once; revoke it there at any time. A *Can view* token can read but never change boards.

## Backups and updates

Everything lives in the `mapache-data` volume (`/data`): `boards/`, `folders.json`, `media/`, `trash/`, `users.json`
(accounts, with hashed passwords) and `sessions.json`.

```bash
# Back up
docker run --rm -v mapache_mapache-data:/data -v "$PWD":/backup alpine tar czf /backup/mapache-backup.tgz -C /data .

# Update to the latest version
git pull && docker compose up -d --build
```

The volume name is `<folder>_mapache-data` (here `mapache_mapache-data`); `docker volume ls` shows it.

## Security notes

- Passwords are hashed with scrypt; session, invitation and agent tokens are stored only as SHA-256 hashes.
- Cookies are `HttpOnly` and `SameSite=Lax` (and `Secure` over HTTPS). Changes made with a cookie must come from the
  app's own address (protection against cross-site requests); agents use bearer tokens instead.
- Wrong passwords are rate-limited per address and email. The setup code for the first account is only printed in the
  server log, so nobody can claim the server before you.
- The image runs as the unprivileged `node` user. Keep the server updated and use HTTPS on the internet.
