# Exporting your staff session for the Playwright evidence pipeline

This lets headless Playwright (running in the sandboxed shell, which has
no display and can't show you a login window) reuse your **already-live**
staff session — never your password. You do this entirely yourself, in
your own real browser; nothing here passes through Claude at any point.

## Steps

1. In a real browser on this machine (not the Claude Browser pane —
   e.g. your regular Edge/Chrome), go to **http://localhost:3001** and
   make sure you're signed in as staff (you should see your email and
   role, e.g. "hello@askabd.com — super_admin", in the top-right nav).

2. Open DevTools (**F12**), go to the **Console** tab, paste the
   snippet below, and press Enter. It will download a small JSON file
   (`staff-state.json`) — your browser will prompt you to save it or
   drop it straight in your Downloads folder.

   ```js
   (function() {
     const state = {
       origin: window.location.origin,
       cookies: document.cookie.split(';').map(c => c.trim()).filter(Boolean).map(c => {
         const i = c.indexOf('=');
         return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
       }),
       sessionStorage: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])),
       localStorage: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])),
     };
     const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = 'staff-state.json';
     document.body.appendChild(a);
     a.click();
     a.remove();
   })();
   ```

3. Move (or save) that downloaded file to exactly this path in the repo:

   ```
   D:\.kiro\askabd-comparison\scripts\playwright-evidence\.auth\staff-state.json
   ```

   (create the `.auth` folder if it doesn't exist yet — it's gitignored,
   so this file is never committed).

4. Let me know once it's there — I'll verify it works against the real
   running app and then reuse it for the Playwright evidence runs. It
   naturally goes stale when your session expires (short-lived access
   token + rotating refresh token, same as the rest of this app); just
   redo these steps if a later run reports the import as invalid.

## What this does and doesn't expose

- The file contains your real session's access token, refresh token, and
  the small mirrored auth cookie — genuinely sensitive, so keep it local
  and don't share it. It is **not** your password (which never appears
  anywhere in this flow) and it's short-lived/revocable like the rest of
  this app's session model.
- I read this file programmatically to authenticate a Playwright
  browser context; I don't print, log, or otherwise surface its contents.
