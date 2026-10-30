# dsh-web-mobile

Mobile UX hardening for the **DeepSeek Harness (DSH) web GUI**.

The web GUI is desktop-oriented. On a phone browser it pinches/zooms freely,
and Safari auto-zooms into the chat input whenever it is tapped. This plugin
injects the missing head markup through DSH's own index-render seam
(`webServer.tapIndex`), so:

- no edits to the installed frontend in `node_modules`;
- upstream Harness/frontend changes still land;
- unregistering the plugin restores the stock page.

## What it injects (mobile only)

- viewport locked: `user-scalable=no`, `maximum-scale=1` (no pinch zoom, no
  input-focus auto-zoom), `viewport-fit=cover` (safe-area / notch aware);
- `input`/`textarea`/`select` at `font-size: 16px` on narrow screens (this is
  what stops iOS focusing the field from zooming the page);
- `touch-action: manipulation` on interactive elements (removes the
  double-tap-zoom delay);
- transparent tap highlight;
- on phones, focusing the chat text field closes the open sessions sidebar
  (a small JS guard that clicks the app's own sidebar toggle — no state, no
  risk).

## Scope notes — deliberately no scroll or frame overrides

This plugin injects **no scroll or frame overrides**. The chat's vertical
scrolling and its auto-follow-the-tail behavior are left entirely to the app.
Attempts to freeze the frame (`100dvh`, absorbing `overflow:hidden`, body
padding), to fight the app's follow-the-tail auto scroll with a JS guard, and
to make the soft keyboard overlay the content (raising the composer via
`visualViewport`) were tried and abandoned: they did not help, and the global
frame freeze broke the desktop layout. If you fork this and want to retry,
keep any such override scoped to `@media (max-width: 600px)` so the desktop
layout is never affected.

## Install

The profile mechanism is the supported route; either of these works.

**Via the plugin command** (from this repository checked out locally):

```sh
dsh plugin --profile web add /path/to/dsh-web-mobile
```

**By hand** — add the package to the web profile's `package.json`
dependencies (a `file:` path works), then register the plugin in the profile
patch (`$DSH_HOME/profiles/web/cordis.patch.yml`, create the insert entry in
the patch list):

```yaml
- insert:
    - id: web-mobile
      name: 'dsh-web-mobile'
```

Then restart `dsh web`. To remove it, delete the insert entry (and the
dependency) and restart — the stock page comes back.

## Compatibility

- Peer range: `@deepseek-ai/dsh-web >=0.1.0-rc.6 <0.3.0`.
- Verified against DSH `0.2.0-rc.2` and `0.2.1-rc.5` (the `tapIndex` seam,
  the served `<head>` markup, and the frontend class hooks below all present
  in both).

The sidebar-close guard targets the frontend's build-time class names
(`pI_x6G_frame`, `hHd-Xa_toggle`), which are upstream implementation details
and may change between releases. The guard is written to no-op safely when
the selectors are absent — and the viewport/style hardening, which is the
main point, is selector-independent.

## Files

- `index.js` — the DSH plugin (`name`, `inject: ["webServer"]`, `apply`).
- `package.json` — ESM package metadata; declaration-only (no runtime imports).

## License

MIT — see `LICENSE`.
