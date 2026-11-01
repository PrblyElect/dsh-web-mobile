// Zero-dependency tests for the plugin's index transform.
//
// Run with: node --test "test/**/*.test.mjs"    (or: npm test)
//
// `node --test test/` does NOT work: Node resolves `test/` as a MODULE
// path rather than a directory and exits 1 with MODULE_NOT_FOUND before a
// single test runs.
import assert from "node:assert/strict";
import test from "node:test";

import { apply, inject, name } from "../index.js";
import { satisfies } from "./semver-lite.mjs";

const STOCK_VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1" />';

// The stock page as the published frontend serves it: exactly one viewport
// meta, before the app's stylesheet.
function stockPage(extra = "") {
  return `<!doctype html><html><head><meta charset="utf-8" />${extra}${STOCK_VIEWPORT}<title>DSH</title><link rel="stylesheet" href="/assets/index.css" /></head><body><div id="app"></div></body></html>`;
}

// A fake DSH host: `tapIndex` hands the transform over, `effect` runs the
// cleanup registration.
function harness() {
  const state = { transform: null, dispose: null };
  const ctx = {
    webServer: {
      tapIndex(fn) {
        state.transform = fn;
        return () => { state.transform = null; };
      },
    },
    effect(fn) {
      state.dispose = fn();
    },
  };
  apply(ctx);
  return state;
}

function render(html) {
  const { transform } = harness();
  assert.equal(typeof transform, "function", "apply() must register an index transform");
  return transform(html);
}

// Every <meta> tag in the page that names the viewport, whatever the order
// of its attributes.
function viewportMetas(html) {
  return (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((tag) => /\bname\s*=\s*["']viewport["']/i.test(tag));
}

function styleBlock(html) {
  return html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? "";
}

test("exports the plugin shape the harness expects", () => {
  assert.equal(name, "web-mobile");
  assert.deepEqual(inject, ["webServer"]);
  assert.equal(typeof apply, "function");
});

test("registers a disposer for the index transform", () => {
  const { dispose } = harness();
  assert.equal(typeof dispose, "function", "apply() must register cleanup through ctx.effect");
});

test("replaces the stock viewport meta instead of adding a second one", () => {
  const out = render(stockPage());
  const metas = viewportMetas(out);
  assert.equal(metas.length, 1, "exactly one viewport meta must remain");
  assert.ok(!out.includes(STOCK_VIEWPORT), "the stock viewport meta must be gone");
  assert.match(metas[0], /maximum-scale=1/);
  assert.match(metas[0], /user-scalable=no/);
});

test("leaves exactly one viewport meta for every page shape", () => {
  const shapes = [
    stockPage(),
    stockPage('<meta name="viewport" content="width=device-width" />'),
    "<html><head></head><body></body></html>",
    "<html><body><p>no head at all</p></body></html>",
    "<p>not even html</p>",
  ];
  for (const shape of shapes) {
    const out = render(shape);
    assert.equal(viewportMetas(out).length, 1, `page shape: ${shape}`);
  }
});

test("matches a stock viewport meta whose name attribute is not first", () => {
  const out = render('<html><head><meta content="width=device-width, initial-scale=1" name="viewport" /></head></html>');
  const metas = viewportMetas(out);
  assert.equal(metas.length, 1);
  assert.match(metas[0], /maximum-scale=1/, "the reordered stock meta must be hardened");
  assert.ok(!out.includes('content="width=device-width, initial-scale=1" name="viewport"'));
});

test("injects a viewport meta when the page has none", () => {
  const out = render("<html><head><title>DSH</title></head><body></body></html>");
  const metas = viewportMetas(out);
  assert.equal(metas.length, 1);
  assert.match(metas[0], /maximum-scale=1/);
  assert.match(metas[0], /user-scalable=no/);
});

test("collapses several stock viewport metas to exactly one", () => {
  const out = render(
    '<html><head><meta name="viewport" content="a" /><meta name="viewport" content="b" />'
    + '<meta name="viewport" content="c" /></head></html>',
  );
  assert.equal(viewportMetas(out).length, 1);
});

test("injects the style block and no JavaScript", () => {
  const out = render(stockPage());
  assert.match(out, /<style>/, "the style block must be injected");
  assert.ok(
    !/<script\b/i.test(out),
    "the plugin injects no script: the published frontend exposes no hook a sidebar guard could use",
  );
  assert.ok(
    !/pI_x6G_frame|hHd-Xa_toggle|data-sidebar-collapsed/.test(out),
    "no upstream build-artifact class name may be referenced",
  );
});

test("the 16px floor is present and scoped to a coarse-pointer query", () => {
  const style = styleBlock(render(stockPage()));
  assert.match(style, /@media\s*\(pointer:\s*coarse\)/, "the floor must key on pointer capability");
  const coarse = style.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\}/i)?.[1] ?? "";
  assert.match(coarse, /font-size:\s*16px\s*!important/, "the floor must beat the frontend's class rule");
  assert.ok(
    !/@media[^{]*max-width/i.test(style),
    "the floor must not be scoped to a width query",
  );
});

test("keeps touch-action and the tap-highlight reset", () => {
  const style = styleBlock(render(stockPage()));
  assert.match(style, /touch-action:\s*manipulation/);
  assert.match(style, /-webkit-tap-highlight-color:\s*transparent/);
});

test("sets no safe-area directive and consumes no safe-area insets", () => {
  const out = render(stockPage());
  assert.ok(!out.includes("viewport-fit=cover"), "no viewport-fit is set without inset handling");
  assert.ok(!/safe-area-inset/i.test(out), "no env(safe-area-inset-*) is consumed");
});

test("keeps the rest of the served page intact", () => {
  const out = render(stockPage());
  assert.ok(out.includes("<title>DSH</title>"));
  assert.ok(out.includes('<div id="app"></div>'));
});

// The compatibility gate the harness reads.
//
// The harness compares the runtime version against this range WITH
// prereleases included, so the range only has to admit the versions the
// plugin was checked against. npm's own semver is stricter about
// prereleases, so the range is also checked under npm's reading. The
// assertion is on BEHAVIOUR — which versions the range admits — not on the
// shape of the range, because the shape is a choice and the behaviour is
// the contract.
test("the engines.dsh range admits the checked versions and rejects the rest", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const manifest = JSON.parse(
    await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
  );
  const range = manifest.engines?.dsh;
  assert.ok(range, "package.json must declare engines.dsh");

  // The harness's own evaluation: prereleases included.
  const admitted = ["0.2.0-rc.1", "0.2.0-rc.2", "0.2.0", "0.2.1-rc.5", "0.2.1", "0.2.2-alpha.2"];
  for (const version of admitted) {
    assert.ok(
      satisfies(version, range, { includePrerelease: true }),
      `engines.dsh must admit ${version} under the harness's comparison`
    );
  }

  // The next line, and the line before, must stay out under BOTH readings.
  const rejected = ["0.1.0-rc.6", "0.1.5", "0.3.0-rc.1", "0.3.0"];
  for (const version of rejected) {
    for (const includePrerelease of [false, true]) {
      assert.ok(
        !satisfies(version, range, { includePrerelease }),
        `engines.dsh must not admit ${version} (includePrerelease=${includePrerelease})`
      );
    }
  }

  // And the range must hold under npm's stricter reading too, so that a
  // reader who applies npm's semver to the same string sees the same set.
  for (const version of admitted) {
    assert.ok(
      satisfies(version, range),
      `engines.dsh must admit ${version} under npm's stricter comparison too`
    );
  }
});

// The !important on the floor is only necessary because the plugin's style
// block lands BEFORE the app's stylesheet: upstream's field rule is a class
// rule that sets the `font` shorthand, and it comes later in the cascade.
// If the plugin's block ever moved after it, the floor would need a
// different mechanism, so the ordering is part of the contract.
test("the injected style precedes the app's stylesheet", async () => {
  const out = render(stockPage());
  const styleAt = out.indexOf("<style>");
  const linkAt = out.indexOf('<link rel="stylesheet"');
  assert.ok(styleAt !== -1, "the plugin injects a style block");
  assert.ok(linkAt !== -1, "the stock page carries the app's stylesheet");
  assert.ok(styleAt < linkAt, "the plugin's style block must precede the app's stylesheet");
});
