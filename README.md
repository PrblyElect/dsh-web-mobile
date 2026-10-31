# dsh-web-mobile

Mobile UX hardening for the **DeepSeek Harness (DSH) web GUI**.

The web GUI is desktop-oriented. On a phone browser it pinches/zooms freely,
and Safari auto-zooms into the chat input whenever it is tapped. This plugin
injects the missing head markup through DSH's own index-render seam
(`webServer.tapIndex`), so:

- no edits to the installed frontend in `node_modules`;
- upstream Harness/frontend changes still land;
- unregistering the plugin restores the stock page.

The repository is `dsh-web-mobile`; the package's own name is
**`dsh-web-mobile-hardening`**, because the shorter name is already taken by
an unrelated package on the npm registry and installing that name resolves
to someone else's code.

**This package is not published to the npm registry.** Install it from a
local checkout or from a tarball (`npm pack`) — both routes are covered
below. Nothing here needs the registry to resolve this plugin by name.

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

This package declares a bundle patch (`dsh.bundle.patch` in `package.json`),
so the plugin manager registers it as a profile layer on its own: there is
no profile patch entry to write by hand. Restart `dsh web` afterwards.

**By hand** — add the package to the web profile's `package.json`
dependencies (a `file:` path works), then register the plugin in the profile
patch (`$DSH_HOME/profiles/web/cordis.patch.yml`, create the insert entry in
the patch list):

```yaml
- insert:
    - id: web-mobile
      name: 'dsh-web-mobile-hardening'
```

The `name:` here is the package specifier the loader resolves, and it
resolves against the package you just installed locally — the `file:`
dependency gives `node_modules` a package called `dsh-web-mobile-hardening`
under that name. It is not a registry lookup, and it does not work without
the dependency step above.

Then restart `dsh web`. To remove it, delete the insert entry (and the
dependency) and restart — the stock page comes back.

### Which install route enforces what

**Two package managers are in play, and they disagree.** `dsh plugin`
installs with **pnpm**; the npm rows below are what happens when you
install the tarball yourself with npm.

With **npm**:

| route | peer range checked | version pinned |
|---|---|---|
| `file:` directory path | no | no |
| `file:` tarball from `npm pack` | yes — an out-of-range peer fails with `ERESOLVE` | by the lockfile |

There is no "npm registry, by name" row: this package is not published to
the registry, so that route does not exist for it. Every install path below
resolves the plugin locally.

A directory dependency is linked rather than resolved, so npm never checks
the declared peer range against it: a wrong range stays invisible on the
route most readers take, and the mismatch only shows up later, at runtime.

With **pnpm** — which is what `dsh plugin` runs — the picture is
different: pnpm reports an out-of-range peer as a **warning** and
completes the install anyway, on every route, including the tarball one.
DSH's own profile does not turn on pnpm's `strict-peer-dependencies`, so
by default the range is *reported* and not *enforced*. If you want it
enforced, install with `--strict-peer-dependencies`, or check the
lockfile afterwards. `pnpm peers check` reports the mismatch on demand.

## Compatibility

**DSH line.** The `0.2.x` release line of the DeepSeek Harness — the
`next` channel — plus the earlier `0.1.x` prereleases the peer range
admits. Note that the two channels are not the same thing: the harness
package's `latest` and `next` both point at `0.2.1-rc.5`, but the peer's
`latest` tag is still `0.0.1-rc.1`, which this plugin does not support —
install the peer at `next`, or at an explicit version. The `tapIndex`
seam, the served `<head>` markup, and the frontend class hooks below are
all present in `0.2.0-rc.2` and `0.2.1-rc.5`, the two versions this
plugin was verified against.

**Peer.** `@deepseek-ai/dsh-host-webserver` — the package that owns the
`webServer` service and its `tapIndex` transform, the one API this plugin
calls. Nothing else from the Harness is imported at runtime.

**Runtime.** Node `>=24.0.0`, package manager `pnpm@11.7.0`. These are
this plugin's own requirements, chosen to match the reference plugin's
runtime (node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`) on its stricter
side — note that the official `@deepseek-ai/*` packages declare **no**
`engines` and **no** `packageManager` field of their own, so there is
nothing in them to match against.

### The peer range, and why it is written that way

The declared range is ten comparators joined with `||` — one per
prerelease tuple the peer has published:

| prerelease tuple | comparator |
|---|---|
| `0.1.0` | `^0.1.0-rc.6` |
| `0.1.1` | `>=0.1.1-rc.0 <0.2.0` |
| `0.1.2` | `>=0.1.2-a <0.2.0` |
| `0.1.3` | `>=0.1.3-a <0.2.0` |
| `0.1.5` | `>=0.1.5-a <0.2.0` |
| `0.1.6` | `>=0.1.6-a <0.2.0` |
| `0.1.7` | `>=0.1.7-a <0.2.0` |
| `0.2.0` | `>=0.2.0-rc.1 <0.3.0-0` |
| `0.2.1` | `>=0.2.1-a <0.3.0-0` |
| `0.2.2` | `>=0.2.2-a <0.3.0-0` |

npm's semver applies one rule that dominates any range over a prerelease
line: **a prerelease version satisfies a range only if the range itself
names a prerelease of the same `major.minor.patch` tuple.** The obvious
`>=0.1.0-rc.6 <0.3.0` names a prerelease for `0.1.0` only, so it admits
`0.1.0-rc.6` … `0.1.0-rc.8` and rejects every later prerelease line —
including `0.2.0-rc.2` and `0.2.1-rc.5`, the versions this plugin was
verified against. No single pair of comparators can express "every
prerelease from `0.1.0` up to `0.3.0`"; it takes one comparator per
prerelease tuple.

The ten comparators above admit 35 of the 41 versions published on the
public registry — a count that moves as the line ships — including
`0.2.0-rc.2`, `0.2.1-rc.5` and the current `next` release, while still
rejecting `0.3.0-rc.1` and everything older than `0.1.0-rc.6` (six
versions: `0.0.1-rc.1`, `0.0.1-rc.2`, `0.0.1-rc.3`, `0.0.1-rc.5`,
`0.1.0-rc.2` and `0.1.0-rc.3` — `0.0.1-rc.4` was never published, and
`0.3.0-rc.1` is not published either, but the range rejects it too).
**Do not collapse this into a single `>=`/`<` pair**: that silently drops
the plugin's own verified versions out of the range, and it also drops
the seven `0.1.x` tuples that a reader on an older line would be on.

Every version the range admits carries the one API the plugin needs —
`ctx.webServer.tapIndex` — which was checked by unpacking the published
tarballs, not by reading the changelog.

The sidebar-close guard targets the frontend's build-time class names
(`pI_x6G_frame`, `hHd-Xa_toggle`), which are upstream implementation details
and may change between releases. The guard is written to no-op safely when
the selectors are absent — and the viewport/style hardening, which is the
main point, is selector-independent.

## Files

- `index.js` — the DSH plugin (`name`, `inject: ["webServer"]`, `apply`).
- `cordis.patch.yml` — the bundle patch that inserts the plugin row.
- `package.json` — ESM package metadata; declaration-only (no runtime imports).

This plugin is **host-only**: it carries a `dsh.bundle.patch` and nothing
else. There is no `dsh.client` block, because there is no client half —
the hardening is a `<script>` injected into the served page, not a bundle
that runs inside a DSH client. A plugin that also declares a client half
will look different; that difference is deliberate.

## License

MIT — see `LICENSE`.
