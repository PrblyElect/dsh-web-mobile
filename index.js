// Mobile UX hardening for the DeepSeek Harness web GUI — zoom prevention only.
//
// The web GUI is desktop-oriented. On a phone it pinches/zooms and — worse —
// Safari auto-zooms into the input field when tapped. This plugin injects the
// missing head markup through DSH's own index-render seam (`ctx.webServer.tapIndex`),
// so nothing in the installed frontend in node_modules is edited and upstream
// changes still land. Removable: unregistering the plugin restores the stock page.
// Deliberately no scroll/frame overrides — those were tried and proved
// unnecessary (the app's own follow-the-tail scrolling is left alone).
// QoL: on phones, focusing the chat text field closes the open sessions sidebar.

export const name = "web-mobile";
export const inject = ["webServer"];

// Lock the viewport: no pinch zoom, no input-focus auto-zoom, and cover safe
// areas (notch / Dynamic Island) so content is not tucked under the sensor.
const VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />';

// Zoom prevention. 16px inputs stop Safari auto-zooming into the field;
// touch-action removes double-tap-zoom. Deliberately no scroll/height overrides
// — the app keeps its own layout, and the keyboard's push-up behaviour is left
// as-is (the overlay attempts proved unreliable on iOS).
const STYLE = `<style>
  @media (max-width: 600px) {
    input, textarea, select { font-size: 16px; }
  }
  button, a, input, textarea, select, [role="button"] { touch-action: manipulation; }
  * { -webkit-tap-highlight-color: transparent; }
</style>`;

// QoL: on phones, focusing the chat text field closes the open sessions sidebar
// (a drawer) so the chat gets full width for typing. Mobile-only; desktop is
// left alone. We simply click the app's own sidebar toggle when the composer
// gains focus — no state to maintain, nothing to break.
const GUARD = `<script>
(function () {
  function sidebarOpen() {
    var f = document.querySelector(".pI_x6G_frame");
    // data-sidebar-collapsed present => collapsed/closed; absent => open.
    return !!f && !f.hasAttribute("data-sidebar-collapsed");
  }
  function closeSidebar() {
    var btn = document.querySelector(".hHd-Xa_toggle")
      || document.querySelector('[aria-label*="sidebar" i]')
      || document.querySelector('[title*="sidebar" i]');
    if (btn) { btn.click(); }
  }
  function isChatEditable(el) {
    if (!el) { return false; }
    // Never react to controls inside the sidebar itself (e.g. search box).
    if (el.closest(".hHd-Xa_root, .pI_x6G_sidebarCol")) { return false; }
    return el.tagName === "TEXTAREA"
      || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|hidden)$/.test(el.type || ""))
      || el.isContentEditable;
  }
  document.addEventListener("focusin", function (e) {
    if (!window.matchMedia("(max-width: 600px)").matches) { return; }
    if (sidebarOpen() && isChatEditable(e.target)) { closeSidebar(); }
  }, true);
})();
</script>`;

// The stock page is not assumed to have a viewport meta, and when it has one
// its attribute order is not assumed either: a meta that puts name= second
// is still a viewport meta. The hardened directive is therefore injected
// when no stock meta was replaced, and the stock one is matched whatever
// order its attributes are in.
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
    // Inject the mobile style block and the sidebar QoL guard after the head.
    return injectIntoHead(hardened, headExtras + STYLE + GUARD);
  });
  ctx.effect(() => dispose);
}
