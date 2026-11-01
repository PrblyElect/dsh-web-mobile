# dsh-web-mobile

Mobile UX hardening for the **DeepSeek Harness (DSH) web GUI**.

The web GUI is desktop-oriented. On a phone browser it pinches/zooms freely,
and Safari auto-zooms into the chat input whenever it is tapped. This plugin
transforms the served index page through DSH's own index-render seam
(`webServer.tapIndex`), so:

- no edits to the installed frontend in `node_modules`;
- upstream Harness/frontend changes still land;
- unregistering the plugin restores the stock page.

The repository is `dsh-web-mobile`; the package's own name is
**`dsh-web-mobile-hardening`**, because the shorter name is already taken by
an unrelated package on the npm registry and installing that name resolves
to someone else's code.

**This package is not published to the npm registry.** Install it from a
local checkout, from a tarball (`npm pack`), or through the plugin manager's
git route — all three are covered below. Nothing here needs the registry to
resolve this plugin by name.

## What it injects

The stock page **already ships a viewport meta**. This plugin does not add
a missing **viewport meta**: it **replaces** the stock directive with a
stricter one, so exactly one viewport meta remains in the served page.

- **Viewport zoom lock** — `maximum-scale=1` and `user-scalable=no` are added
  to the stock `width=device-width, initial-scale=1`. What that does, and what
  it does not:
  - it suppresses the pinch/double-tap zoom **in browsers that honour
    `user-scalable=no`**;
  - it suppresses the iOS focus auto-zoom in WebViews that honour it;
  - it does **not** stop pinch zoom in browsers that ignore
    `user-scalable=no` for accessibility reasons (iOS 10+ and Chrome 55+ do
    ignore it), so the page stays zoomable there — which is most of the
    browsers this plugin targets, and the reason the zoom lock is a
    best-effort hint rather than a guarantee.
- **16px form-field floor, on coarse pointers** — `input`, `textarea` and
  `select` get `font-size: 16px !important` inside
  `@media (pointer: coarse)`. The `!important` is load-bearing: the frontend
  styles its fields with a CSS-module class rule that sets the `font`
  shorthand, and that shorthand resets `font-size` outright. The class rule
  also outranks an earlier element selector on specificity, and it comes
  later in the cascade. An ordinary declaration cannot win either way, so
  the floor has to be marked important. The query keys on pointer capability
  rather than width, so a narrow desktop window is not affected. What the
  floor buys, per frontend build:
  - on the frontend's `next` line (`0.2.1-rc.5`, the build the `latest`
    harness ships) the upstream field rule is 13px at every width, so the
    floor is both needed and effective;
  - on the alpha line (`0.2.2-alpha.2`) the field rule is **the same** — the
    same class rule, still the `font` shorthand, still at the top level of
    the stylesheet and still **not** inside a media query. The alpha's own
    stylesheet has no touch-scoped `font-size` rule for the field (its only
    16px declarations are on the wordmark and the title), so the floor is
    needed there too.

  The floor is a floor, not an override of the app's design: it only applies
  where a coarse pointer is detected, and only raises a field that is
  smaller than 16px.
- **`touch-action: manipulation`** on buttons, links, fields and
  `[role="button"]`, which removes the double-tap-zoom delay.
- **Transparent tap highlight** — `-webkit-tap-highlight-color: transparent`
  on every element.

### Not delivered

- **No sidebar behaviour.** The plugin does not collapse, hide or otherwise
  touch any sidebar. The published frontend builds expose no stable hook for
  it: the hashed build-artifact class names a sidebar guard would have to
  target are absent from those builds, and no `aria-label`, `title` or
  `data-*` attribute names the sidebar either. A guard written against those
  selectors could never fire, so the plugin injects no JavaScript at all.
- **No safe-area handling.** `viewport-fit=cover` is not set, because neither
  this plugin nor the frontend consumes `env(safe-area-inset-*)`: the insets
  would apply to nothing. The page therefore keeps the browser's default
  safe-area behaviour instead of claiming a notch-aware layout.

## Scope notes — deliberately no scroll or frame overrides

This plugin injects **no scroll or frame overrides**. The chat's vertical
scrolling and its auto-follow-the-tail behavior are left entirely to the app.
Attempts to freeze the frame (`100dvh`, absorbing `overflow:hidden`, body
padding), to fight the app's follow-the-tail auto scroll with a JS guard, and
to make the soft keyboard overlay the content (raising the composer via
`visualViewport`) were tried and abandoned: they did not help, and the global
frame freeze broke the desktop layout. If you fork this and want to retry,
keep any such override scoped to a coarse-pointer query
(`@media (pointer: coarse)`) rather than to a bare width, so a narrow desktop
window is never affected.

## Install

### Local checkout

```sh
dsh plugin --profile web add /path/to/dsh-web-mobile
```

This package declares a bundle patch (`dsh.bundle.patch` in `package.json`),
so the plugin manager registers it as a profile layer on its own: there is
no profile patch entry to write by hand. Restart `dsh web` afterwards.

### Tarball from a local checkout

```sh
npm pack
```

The produced `.tgz` is a plain npm package: add it to the web profile's
dependencies as a `file:` entry and register the plugin row as described
below. Nothing is fetched from the registry to resolve it.

### Git route

```sh
dsh plugin add "github:PrblyElect/dsh-web-mobile#<commit>"
```

Replace `<commit>` with a real published commit of that repository — the
placeholder cannot be resolved as-is. Add the `--profile web` flag if that
is how the web profile is selected.

A git install may need `allowBuilds` approval **for a package that
declares install scripts**: pnpm 11 blocks those by default, and the
manager lists them under `pendingBuilds` until they are approved. This
package declares no install script — only a `test` script — so there is
nothing to approve here, and the key only has to live in the profile's
`pnpm-workspace.yaml` if it is ever needed.

A plugin index entry points at the same thing, and has the same requirement:

```json
{
  "type": "git",
  "commit": "<sha>",
  "path": "..."
}
```

The `commit` field has to be a real published commit. The ecosystem's own
published index entries carry `type` and `commit`; this package's
`package.json` sits at the repository root, so a `path` field — if the
schema in use has one — would be `"."`.

### By hand

Add the package to the web profile's `package.json` dependencies (a `file:`
path or a `file:` tarball works), then register the plugin in the profile
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
the registry, so that route does not exist for it. Every install path above
resolves the plugin locally.

A directory dependency is linked rather than resolved, so npm never checks
the declared peer range against it: on npm's route a wrong range stays
invisible. The harness's own gate, below, is what catches it.

With **pnpm** — which is what `dsh plugin` runs — the picture is
different: pnpm reports an out-of-range peer as a **warning** and
completes the install anyway, on every route, including the tarball one.
DSH's own profile does not turn on pnpm's `strict-peer-dependencies`, so
by default the peer range is *reported* and not *enforced*. If you want
it enforced, install with `--strict-peer-dependencies`, or check the
lockfile afterwards. `pnpm peers check` reports the mismatch on demand.

**The harness has its own gate, above pnpm.** pnpm's leniency is about
*peer* ranges only. The DSH requirement — `engines.dsh` — is enforced by
the plugin manager, and it is enforced **before pnpm runs**: a local
path or a registry spec is checked against the `engines` and
`peerDependencies` the package declares, and an unmet DSH requirement
**rejects the operation**, so nothing is downloaded and no build script
runs. A git or tarball spec has to be fetched before it can be judged, so
it is judged **after** installation instead. Either way the refusal
names the unmet requirement and prints the `allow-version` command that
grants an exemption.

## Compatibility

### The compatibility gate

`package.json` declares:

```json
{
  "engines": {
    "node": ">=24.9.0",
    "dsh": ">=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-a <0.3.0-0 || >=0.2.2-a <0.3.0-0"
  }
}
```

Since the `0.2.1-rc.1` harness release, third-party plugin compatibility
prioritises `engines.dsh` when a plugin declares it, so the `dsh` range is
what decides whether the plugin is accepted by the harness; the
`peerDependencies` range below is the dependency-resolution range and is
deliberately broader.

**Why the `dsh` range is spelled the way it is.** The harness evaluates
this range with prereleases **included** — it compares the runtime
version against the range with `includePrerelease` on — so a single
`>=0.2.0-rc.1 <0.3.0-0` would already admit `0.2.1-rc.5` and
`0.2.2-alpha.2`, the two prerelease builds the plugin was checked
against.

The declared range spells one comparator per published
`major.minor.patch` tuple anyway, and the reason is npm's own semver,
which a reader may well apply to the same string: npm treats a
prerelease as satisfying a range only when the range names a prerelease
of the **same** tuple, so under that stricter reading the
single-comparator form would reject the very versions this plugin
supports. The per-tuple spelling is therefore defensive rather than
required by the harness — it admits the intended set under **both**
readings, and it will need a new comparator only if the harness
publishes a `0.2.3` prerelease **and** a reader is using npm's
stricter semantics.

**DSH line.** The `0.2.x` release line of the DeepSeek Harness — the `next`
channel — which is what the `engines.dsh` gate admits. Note that the two
channels are not the same thing: the harness package's `latest` and `next`
both point at `0.2.1-rc.5`, but the peer's `latest` tag is still
`0.0.1-rc.1`, which this plugin does not support — install the peer at
`next`, or at an explicit version. The `tapIndex` seam and the served
`<head>` markup are present across the `0.2.x` line; the viewport
replacement was checked against the frontend's `next` (`0.2.1-rc.5`) and
alpha (`0.2.2-alpha.2`) builds. The transform itself matches no upstream
class name, id or attribute, so a frontend rebuild cannot break it.

**Peer.** `@deepseek-ai/dsh-host-webserver` — the package that owns the
`webServer` service and its `tapIndex` transform, the one API this plugin
calls. Nothing else from the Harness is imported at runtime.

**Runtime.** Node `>=24.9.0`, package manager `pnpm@11.7.0`. The Node floor
matches the harness's own alpha line, which raised its minimum to Node 24.9.
The official `@deepseek-ai/*` packages declare **no** `engines` and **no**
`packageManager` field of their own, so there is nothing in them to match
against.

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

The ten comparators above cover every published prerelease tuple from
`0.1.0` up to `0.2.2`, while still rejecting `0.3.0-rc.1` and everything
older than `0.1.0-rc.6` (the `0.0.1-rc.1`, `0.0.1-rc.2`, `0.0.1-rc.3`,
`0.0.1-rc.5`, `0.1.0-rc.2` and `0.1.0-rc.3` builds). **Do not collapse this
into a single `>=`/`<` pair**: that silently drops the plugin's own verified
versions out of the range, and it also drops the `0.1.x` tuples that a
reader on an older line would be on.

Every version the range admits carries the one API the plugin needs —
`ctx.webServer.tapIndex` — which was checked by unpacking the published
tarballs, not by reading the changelog.

## Files

- `index.js` — the DSH plugin (`name`, `inject: ["webServer"]`, `apply`).
- `cordis.patch.yml` — the bundle patch that inserts the plugin row.
- `package.json` — ESM package metadata; declaration-only (no runtime
  imports).
- `test/index.test.mjs` — zero-dependency tests for the index transform.

This plugin is **host-only**: it carries a `dsh.bundle.patch` and nothing
else. There is no `dsh.client` block, because there is no client half —
the hardening is markup injected into the served page, not a bundle that
runs inside a DSH client. A plugin that also declares a client half will
look different; that difference is deliberate.

## Verification

The plugin ships a zero-dependency test that runs on Node's built-in test
runner:

```sh
node --test "test/**/*.test.mjs"
```

or, from the package directory:

```sh
npm test
```

The test files are named explicitly because a bare directory argument is not
one: on current Node releases `node --test test/` resolves the argument as a
module path instead of scanning the directory, and fails before any test
runs. A plain `node --test` from the package directory also works.

The test drives the real transform through a fake `ctx.webServer.tapIndex`
and asserts the injection behaviour: the stock viewport meta is replaced
rather than duplicated, exactly one viewport meta remains, a stock meta
whose `name=` attribute is not first is still matched, a page with no stock
meta gets one injected, and several stock metas collapse to exactly one. It
also asserts that the style block is injected **before the app's
stylesheet** — the ordering is part of the contract, because upstream's
field rule is a class rule that sets the `font` shorthand and comes later
in the cascade — that the 16px rule is present and scoped to a
coarse-pointer query, and that the plugin injects no JavaScript and no
safe-area directive.

The suite also checks the **behaviour** of the `engines.dsh` range: it
must admit the versions the plugin was checked against and reject the
lines either side of them, under the harness's comparison (prereleases
included) and under npm's stricter one. That check needs a semver
evaluator, so the package ships a small one in `test/semver-lite.mjs`
rather than taking a dependency; its behaviour was cross-checked against
node-semver over the ranges and versions this package uses.

## License

MIT — see `LICENSE`.
