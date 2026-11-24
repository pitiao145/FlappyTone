/*
 * Brief 54's automatic layout checks. Plain JS, injected into the page by
 * src/dev/shots/shots.ts (`page.addScriptTag`), so it runs on the real DOM
 * with no build step. Dev only: nothing imports it.
 *
 *   window.__shotsCheck({ noNav, insets: { top, bottom }, ignore: [selector] })
 *     → [{ check, detail }]
 *
 * Checks, all on what is actually visible (clipped by scroll containers and
 * the viewport, and not covered by something on top):
 *   overflow   page scrolls sideways, or an element pokes out of the viewport
 *   wrap       a one-line button/pill label wraps to 2+ lines
 *   clipped    text cut off by its box (ellipsis or overflow: hidden)
 *   overlap    two visible text/interactive elements intersect
 *   floating   a fixed element (Feedback tab) sits on a card or text
 *   nav        content drawn under the bottom nav
 *   safe-area  content under the notch or the home bar
 *   tap        a tap target smaller than 44×44 px (touch sizes; inline links in a sentence exempt)
 *   nav-shown  the bottom nav is visible where it must not be
 */
(() => {
  const INTERACTIVE =
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="slider"], summary';
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META", "LINK", "BR"]);

  function describe(el) {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const text = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 32);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ""}`;
  }

  function isClipping(style) {
    return ["overflowX", "overflowY"].some((k) => style[k] !== "visible");
  }

  /** The element's rect, cut by the viewport and every clipping ancestor. Null when nothing is left. */
  function clipRect(el) {
    const r = el.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    x1 = Math.max(x1, 0); y1 = Math.max(y1, 0);
    x2 = Math.min(x2, innerWidth); y2 = Math.min(y2, innerHeight);
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.position === "fixed") break;
      if (!isClipping(s)) continue;
      const ar = a.getBoundingClientRect();
      if (s.overflowX !== "visible") { x1 = Math.max(x1, ar.left); x2 = Math.min(x2, ar.right); }
      if (s.overflowY !== "visible") { y1 = Math.max(y1, ar.top); y2 = Math.min(y2, ar.bottom); }
    }
    if (x2 - x1 < 1 || y2 - y1 < 1) return null;
    return { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 };
  }

  function styleVisible(el) {
    let op = 1;
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === "none" || s.visibility === "hidden" || s.contentVisibility === "hidden") return false;
      op *= Number(s.opacity);
    }
    return op > 0.05;
  }

  /** Visible = some sample point of its clipped rect hit-tests to it (or inside it). */
  function visibleRect(el) {
    if (!styleVisible(el)) return null;
    const c = clipRect(el);
    if (!c) return null;
    const pts = [
      [0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8], [0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1],
    ];
    for (const [fx, fy] of pts) {
      const x = c.left + c.width * fx, y = c.top + c.height * fy;
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top) || (el.tagName === "svg" && top.closest("svg") === el))) return c;
    }
    return null;
  }

  function ownText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  }

  /** Lines of text in `el` (text nodes only: an icon stacked above a label is not a wrap). */
  function lineCount(el) {
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        if (!tops.some((t) => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
      }
    }
    return tops.length;
  }

  /** Union of the line boxes of `el`'s own text nodes; null when it has none. */
  function inkRect(el) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top); x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
      }
    }
    return x2 > x1 ? { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 } : null;
  }

  function clipTo(a, c) {
    const left = Math.max(a.left, c.left), top = Math.max(a.top, c.top);
    const right = Math.min(a.right, c.right), bottom = Math.min(a.bottom, c.bottom);
    return right - left >= 1 && bottom - top >= 1 ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
  }

  /** A link or button inside a line of text (a sentence): it wraps with the text, and its line is the target. */
  function inSentence(el) {
    return ownText(el.parentElement) && (getComputedStyle(el).display === "inline" || el.getBoundingClientRect().height < 32);
  }

  function intersect(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 3 && h > 3 ? { w, h } : null;
  }

  function hasHorizontalScroller(el) {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if ((s.overflowX === "auto" || s.overflowX === "scroll") && a.scrollWidth > a.clientWidth + 1) return true;
    }
    return false;
  }

  window.__shotsCheck = ({ noNav = false, touch = true, insets = { top: 0, bottom: 0 }, ignore = [] } = {}) => {
    const out = [];
    const fail = (check, detail) => out.push({ check, detail });
    // Hit-testing must see through `pointer-events: none` HUD layers.
    const pe = document.createElement("style");
    pe.textContent = "*, *::before, *::after { pointer-events: auto !important; }";
    document.head.appendChild(pe);
    try {
      const ignored = (el) => ignore.some((sel) => el.closest(sel));
      const all = [...document.body.querySelectorAll("*")].filter((el) => !SKIP_TAGS.has(el.tagName));

      // ---- overflow
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) fail("overflow", `page is ${de.scrollWidth}px wide in a ${de.clientWidth}px viewport`);

      // ---- leaves: interactive elements (atomic) and text/graphic leaves outside them
      const leaves = [];
      const seen = new Set();
      for (const el of all) {
        if (ignored(el)) continue;
        if (el.matches(INTERACTIVE)) {
          if (!el.parentElement.closest(INTERACTIVE)) leaves.push(el);
          continue;
        }
        if (el.closest(INTERACTIVE)) continue;
        if (el.tagName === "CANVAS") continue;
        if (el.closest("svg") && el.tagName !== "svg") continue;
        if (el.tagName === "svg" || el.tagName === "IMG" || ownText(el)) leaves.push(el);
      }
      const vis = [];
      for (const el of leaves) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = visibleRect(el);
        if (!r) continue;
        // A text leaf is judged by its ink (its own text's line boxes), not
        // its block: a centred word in a full-width <p> does not reach the edges.
        const ink = el.matches(INTERACTIVE) || el.tagName === "svg" || el.tagName === "IMG" ? null : inkRect(el);
        const box = ink ? clipTo(ink, r) : r;
        if (box) vis.push({ el, r: box, full: ink || el.getBoundingClientRect() });
      }

      // ---- off-screen pieces
      for (const v of vis) {
        const f = v.full;
        if ((f.right > innerWidth + 1 || f.left < -1) && !hasHorizontalScroller(v.el)) {
          fail("overflow", `${describe(v.el)} runs off-screen (${Math.round(f.left)}–${Math.round(f.right)} of ${innerWidth})`);
        }
      }

      // ---- wrap (one-line labels) and clipped text
      for (const v of vis) {
        const el = v.el;
        if (!el.matches(INTERACTIVE) || inSentence(el)) continue;
        const label = (el.innerText || "").trim();
        if (!label || label.includes("\n")) continue;
        const lines = lineCount(el);
        if (lines > 1) fail("wrap", `${describe(el)} wraps to ${lines} lines`);
      }
      for (const el of all) {
        if (ignored(el) || !ownText(el)) continue;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        const v = visibleRect(el.closest(INTERACTIVE) || el);
        if (!v) continue;
        if (s.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) fail("clipped", `${describe(el)} is cut with an ellipsis`);
        else if (s.overflowX !== "visible" && s.display !== "inline" && el.scrollWidth > el.clientWidth + 1) fail("clipped", `${describe(el)} text is cut off`);
        // A label wider than what is visible of it (an ancestor clips it).
        const full = el.getBoundingClientRect();
        const c = clipRect(el);
        if (c && full.width > 4 && c.width < full.width - 2 && !hasHorizontalScroller(el)) {
          fail("clipped", `${describe(el)} shows ${Math.round(c.width)} of ${Math.round(full.width)}px`);
        }
      }

      // ---- cut: a button or text hidden (partly or wholly) by a box that
      // cannot scroll to it, e.g. a title screen taller than the phone.
      for (const el of leaves) {
        if (!styleVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.position === "fixed") break;
          if (!isClipping(s)) continue;
          const scrollY = (s.overflowY === "auto" || s.overflowY === "scroll") && a.scrollHeight > a.clientHeight + 1;
          const scrollX = (s.overflowX === "auto" || s.overflowX === "scroll") && a.scrollWidth > a.clientWidth + 1;
          if (scrollY || scrollX) break; // the player can scroll to it
          const ar = a.getBoundingClientRect();
          const out = Math.max(ar.top - r.top, r.bottom - ar.bottom, ar.left - r.left, r.right - ar.right);
          if (out > 2) {
            fail("cut", `${describe(el)} is cut off by ${describe(a).slice(0, 40)} (${Math.round(out)}px hidden)`);
            break;
          }
        }
      }

      // ---- overlap between visible leaves
      for (let i = 0; i < vis.length; i++) {
        for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i], b = vis[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const hit = intersect(a.r, b.r);
          if (hit) fail("overlap", `${describe(a.el)} × ${describe(b.el)} (${Math.round(hit.w)}×${Math.round(hit.h)}px)`);
        }
      }

      // ---- floating elements (position: fixed, not the nav, not a full overlay) on cards or text
      const nav = document.querySelector(".game-nav");
      const fixed = all.filter((el) => {
        if (ignored(el) || (nav && nav.contains(el))) return false;
        const s = getComputedStyle(el);
        if (s.position !== "fixed") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.width < innerWidth * 0.5 && styleVisible(el);
      });
      for (const f of fixed) {
        const fr = f.getBoundingClientRect();
        for (const el of all) {
          if (f.contains(el) || el.contains(f) || ignored(el)) continue;
          const s = getComputedStyle(el);
          const boxed = s.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0;
          if (!boxed && !ownText(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width >= innerWidth - 1) continue; // page-wide backgrounds
          const c = clipRect(el);
          if (c && styleVisible(el) && intersect(fr, c)) {
            fail("floating", `${describe(f)} sits on ${describe(el)}`);
            break;
          }
        }
      }

      // ---- the bottom nav and the safe areas
      const navVisible = nav && styleVisible(nav) && nav.getBoundingClientRect().height > 0;
      if (noNav && navVisible) fail("nav-shown", "the bottom nav is visible on this screen");
      const nr = navVisible ? nav.getBoundingClientRect() : null;
      for (const v of vis) {
        const inNav = nav && nav.contains(v.el);
        // Under the nav = the nav is what shows there (a sheet drawn over the nav is fine).
        const hit = nr && !inNav ? clipTo(v.r, nr) : null;
        if (hit) {
          const top = document.elementFromPoint((hit.left + hit.right) / 2, (hit.top + hit.bottom) / 2);
          if (top && nav.contains(top)) fail("nav", `${describe(v.el)} is under the bottom nav`);
        }
        if (insets.top > 0 && v.r.top < insets.top - 0.5) fail("safe-area", `${describe(v.el)} is under the notch (top ${Math.round(v.r.top)} < ${insets.top})`);
        if (insets.bottom > 0 && v.r.bottom > innerHeight - insets.bottom + 0.5) {
          fail("safe-area", `${describe(v.el)} is under the home bar (bottom ${Math.round(v.r.bottom)} > ${innerHeight - insets.bottom})`);
        }
      }

      // ---- tap targets (touch sizes only). A link inside a sentence is
      // exempt, as in WCAG 2.5.8: its line is the target.
      for (const v of vis) {
        if (!touch) break;
        if (!v.el.matches(INTERACTIVE) || v.el.matches("input[type=range]")) continue;
        if (inSentence(v.el)) continue;
        // A control inside a <label> is tapped through the whole label (a switch row).
        const r = (v.el.closest("label") || v.el).getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) fail("tap", `${describe(v.el)} is ${Math.round(r.width)}×${Math.round(r.height)}px`);
      }
    } finally {
      pe.remove();
    }
    // One line per distinct problem.
    const uniq = new Map();
    for (const f of out) uniq.set(`${f.check}|${f.detail}`, f);
    return [...uniq.values()];
  };
})();
