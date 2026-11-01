// Mobile UX hardening for the DeepSeek Harness web GUI.
//
// The web GUI is desktop-oriented. On a phone it pinches/zooms and — worse —
// Safari auto-zooms into the input field when tapped. This plugin transforms
// the served index page through DSH's own index-render seam
// (`ctx.webServer.tapIndex`), so nothing in the installed frontend in
// node_modules is edited and upstream changes still land. Removable:
// unregistering the plugin restores the stock page.
//
// What the transform does:
//   * REPLACES the stock viewport meta with a stricter one (the zoom lock).
//     The stock page already ships exactly one viewport meta — the plugin
//     swaps that directive, it does not add a second one.
//   * Raises form fields to a 16px floor on coarse-pointer devices, with
//     `!important` so the declaration beats the frontend's own CSS-module
//     class rule (a `font` shorthand in a class rule outranks an earlier
//     element selector).
//   * touch-action: manipulation on interactive elements, and a transparent
//     tap highlight.
//
// Deliberately no sidebar behaviour: the published frontend builds expose no
// stable hook for one (the hashed build-artifact class names are absent, and
// no aria-label / title / data-* attribute names the sidebar), so a guard
// could never fire. The plugin therefore injects no JavaScript at all.
//
// Deliberately no scroll/frame overrides — those were tried and proved
// unnecessary (the app's own follow-the-tail scrolling is left alone).

export const name = "web-mobile";
export const inject = ["webServer"];

// The stock page ships exactly one viewport meta
// (`width=device-width, initial-scale=1`); this plugin REPLACES it with a
// stricter directive so exactly one viewport meta remains.
//
// `viewport-fit=cover` is deliberately NOT set: neither this plugin nor the
// frontend consumes `env(safe-area-inset-*)`, so the insets would apply to
// nothing, and the page keeps the browser's default safe-area behaviour.
const VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />';

// 16px fields stop iOS focusing the field from zooming the page.
//
// `!important` is load-bearing: the frontend styles its fields with a
// CSS-module class rule that sets the `font` shorthand, and that shorthand
// resets `font-size` outright — and the class rule also outranks an earlier
// element selector (this block is injected at the top of <head>, before the
// app's stylesheet). A longhand marked important is what actually wins there.
//
// The query keys on POINTER CAPABILITY, not width: a narrow desktop window is
// not a touch device, so it is left alone. The floor is also a floor, not an
// override of the app's design: every published frontend build styles its
// fields with the same 13px class rule — the alpha included — so there is no
// build on which the floor is redundant.
//
// touch-action removes the double-tap-zoom delay. Deliberately no
// scroll/height overrides — the app keeps its own layout, and the keyboard's
// push-up behaviour is left as-is (the overlay attempts proved unreliable on
// iOS).
const STYLE = `<style>
  @media (pointer: coarse) {
    input, textarea, select { font-size: 16px !important; }
  }
  button, a, input, textarea, select, [role="button"] { touch-action: manipulation; }
  * { -webkit-tap-highlight-color: transparent; }
</style>`;

// The stock page's viewport meta is matched whatever the order of its
// attributes: a meta that puts name= second is still a viewport meta. The
// hardened directive replaces the first one found and any further stock
// viewport metas are removed rather than duplicated; a page with no stock
// meta at all gets the hardened directive injected.
const META_RE = /<meta\b[^>]*>/gi;
const VIEWPORT_NAME_RE = /\bname\s*=\s*["']viewport["']/i;
const HEAD_RE = /<head(?:\s[^>]*)?>/i;
const HTML_RE = /<html(?:\s[^>]*)?>/i;

// Put markup at the top of the document head. Falls back to the <html>
// opening tag, and to the very start of the document, so the markup is
// never silently dropped because the page has an unexpected shape.
function injectIntoHead(html, markup) {
  if (HEAD_RE.test(html)) {
    return html.replace(HEAD_RE, (open) => open + markup);
  }
  if (HTML_RE.test(html)) {
    return html.replace(HTML_RE, (open) => open + markup);
  }
  return markup + html;
}

export function apply(ctx) {
  const dispose = ctx.webServer.tapIndex((html) => {
    // Replace the stock viewport meta with the hardened one, so exactly one
    // viewport directive exists and the zoom lock is authoritative. Any
    // further stock viewport metas are removed rather than duplicated.
    let replaced = 0;
    let hardened = html.replace(META_RE, (tag) => {
      if (!VIEWPORT_NAME_RE.test(tag)) { return tag; }
      replaced += 1;
      return replaced === 1 ? VIEWPORT : "";
    });
    // No stock viewport meta at all: inject the hardened one. A plugin that
    // only hardens what it happens to find leaves the page unprotected.
    const headExtras = replaced === 0 ? VIEWPORT : "";
    // Inject the mobile style block after the head.
    return injectIntoHead(hardened, headExtras + STYLE);
  });
  ctx.effect(() => dispose);
}
