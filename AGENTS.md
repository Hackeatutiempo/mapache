# Installing Mapache — guide for AI agents

You are an AI agent helping someone install and use **Mapache**, an open-source mind map and whiteboard app
that runs locally in the browser. The person is probably **not technical**. Your job is to get Mapache running
on their computer, make it easy to open again, and explain the result in plain words, in their language.

## Ground rules

- Explain each step in one short sentence before you do it. Avoid jargon.
- **Ask before installing system software** (Node.js, Git). Never ask for passwords, tokens or payment details,
  and never run commands with administrator rights unless the person agrees.
- Mapache needs no account and sends no data anywhere. Boards are stored in the person's browser.
- If something fails, read the error, try the fix listed under *Troubleshooting*, and only then ask the person.

## 1. Check Node.js (version 18 or newer)

```bash
node --version
```

If it is missing or older than 18, ask the person, then install the LTS version:

| System | Command |
|---|---|
| Windows | `winget install OpenJS.NodeJS.LTS` (then open a new terminal so `node` is found) |
| macOS | `brew install node` (if Homebrew is missing, use the installer from <https://nodejs.org>) |
| Linux | the distribution's package manager, or the installer from <https://nodejs.org> |

## 2. Get the code

Install it in the person's home folder, in a folder called `Mapache`.

```bash
git clone https://github.com/Hackeatutiempo/mapache.git ~/Mapache
```

On Windows use `%USERPROFILE%\Mapache`. If Git is not installed and the person prefers not to install it,
download and unzip <https://github.com/Hackeatutiempo/mapache/archive/refs/heads/main.zip> instead
(the folder inside the zip is `mapache-main`; rename it to `Mapache`).

There is **nothing to install with npm**: Mapache has zero dependencies.

## 3. Start it

From the `Mapache` folder:

```bash
npm start
```

Keep that process running (in the background if your environment allows it). Mapache is then at
**<http://localhost:4321>**. Check that it answers before telling the person it is ready:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/
```

`200` means it works. If port 4321 is busy, start it on another port with `PORT=4400 npm start`
(PowerShell: `$env:PORT=4400; npm start`) and use that port in the address.

## 4. Open it and make it easy to come back

1. Open <http://localhost:4321> in the person's browser.
2. Recommend **installing it as an app**: in Chrome or Edge, the *Install* icon in the address bar. It gets its own
   window and icon and keeps working even when the server is not running.
3. Create a way to start it later with one double-click:
   - **Windows:** a desktop shortcut to `Abrir Mapache.cmd` (it starts the server if needed and opens the browser).
     ```powershell
     $s = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:USERPROFILE\Desktop\Mapache.lnk")
     $s.TargetPath = "$env:USERPROFILE\Mapache\Abrir Mapache.cmd"
     $s.WorkingDirectory = "$env:USERPROFILE\Mapache"
     $s.IconLocation = "$env:SystemRoot\System32\shell32.dll,43"
     $s.Save()
     ```
   - **macOS / Linux:** `start.sh` does the same. Offer to add it to the login items (macOS) or to autostart
     (Linux) so Mapache is always ready.

## 5. Tell the person

Summarize in two or three sentences: where Mapache is, how to open it (the shortcut or the installed app),
and that their boards live in that browser, so they should use **Export backup** (bottom left) from time to time.
Press **?** inside the app to see every keyboard shortcut. The interface is in Spanish for now.

## Updating

```bash
cd ~/Mapache && git pull
```

(or download the zip again and replace the folder). Boards are not affected: they live in the browser.
After updating, the app shows *"Hay una versión nueva"* with a reload button.

## Troubleshooting

| Problem | Fix |
|---|---|
| `node` not found right after installing | Open a new terminal (the PATH is refreshed there) |
| Port 4321 already in use | Mapache may already be running: open the address. Otherwise use another `PORT` |
| The page looks outdated | Reload with Ctrl+F5 (Cmd+Shift+R on macOS) |
| Boards seem gone | Boards belong to one browser and one address (`localhost:4321`). Use the same browser, or import the backup |

## Uninstalling

Delete the `Mapache` folder and the shortcut. To remove the boards too, clear the site data for
`localhost:4321` in the browser settings (export a backup first if they want to keep them).

## Coming soon: a server for teams

A self-hosted mode with accounts and real-time collaboration is on the roadmap. It will start with the same
`npm start` plus an option, with an optional one-command Docker setup for hosting it on a server.
