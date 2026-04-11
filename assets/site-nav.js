/* ============================================================================
 * site-nav.js — shared sticky header, theme toggle, cross-page nav.
 * Runs synchronously in <head> to avoid flash-of-unstyled dark mode.
 * Inlined into endo-guide.html by build.py; loaded as a normal <script>
 * by endo-debates.html and cochrane-endo.html.
 * ========================================================================= */
(function () {
  "use strict";

  var PAGES = [
    {
      href: "/endo-guide.html",
      label: "Guide",
      match: ["/endo-guide.html"],
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z"/><path d="M4 4.5v16.5"/></svg>',
    },
    {
      href: "/endo-debates.html",
      label: "Debates",
      match: ["/endo-debates.html"],
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    },
    {
      href: "/cochrane-endo.html",
      label: "Cochrane",
      match: ["/cochrane-endo.html"],
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>',
    },
  ];

  // ---------- Theme: apply as early as possible to avoid FOUC --------------
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("endo-guide.theme");
    if (saved !== "light" && saved !== "dark") {
      saved = window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark" : "light";
    }
    root.setAttribute("data-theme", saved);
  } catch (e) {
    root.setAttribute("data-theme", "light");
  }

  function setTheme(next) {
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("endo-guide.theme", next); } catch (e) {}
    // Let any JS-rendered components know (React trees, etc.)
    document.dispatchEvent(new CustomEvent("site-nav:theme-change",
      { detail: { theme: next } }));
  }

  function toggleTheme() {
    var cur = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(cur === "dark" ? "light" : "dark");
  }

  // ---------- Due-today badge (reads SRS.stats if present) ------------------
  function dueCount() {
    try {
      if (window.SRS && typeof window.SRS.stats === "function") {
        var s = window.SRS.stats(window.SRS.loadDeck());
        return s && typeof s.due === "number" ? s.due : 0;
      }
    } catch (e) {}
    return 0;
  }

  // ---------- Header DOM ---------------------------------------------------
  function currentPath() {
    var p = location.pathname;
    if (p === "") return "/";
    return p;
  }

  function isActive(page, path) {
    for (var i = 0; i < page.match.length; i++) {
      if (page.match[i] === path) return true;
    }
    // also match when path ends with a page filename
    for (var j = 0; j < page.match.length; j++) {
      var m = page.match[j];
      if (m !== "/" && path.indexOf(m) === path.length - m.length) return true;
    }
    return false;
  }

  function renderHeader() {
    if (document.querySelector(".site-header[data-site-nav]")) return;

    var path = currentPath();

    var header = document.createElement("header");
    header.className = "site-header";
    header.setAttribute("data-site-nav", "");

    var inner = document.createElement("div");
    inner.className = "site-header__inner";
    header.appendChild(inner);

    // Brand
    var brand = document.createElement("a");
    brand.className = "site-header__brand";
    brand.href = "/";
    brand.innerHTML =
      '<span class="site-header__brand-dot" aria-hidden="true"></span>' +
      '<span class="site-header__brand-text">Endo Rationale</span>';
    inner.appendChild(brand);

    // Nav links
    var nav = document.createElement("nav");
    nav.className = "site-header__nav";
    nav.setAttribute("aria-label", "Primary");

    var due = dueCount();

    for (var i = 0; i < PAGES.length; i++) {
      var page = PAGES[i];
      var a = document.createElement("a");
      a.className = "site-header__nav-link";
      a.href = page.href;
      var badgeHtml = "";
      if (page.label === "Guide" && due > 0) {
        badgeHtml = ' <span class="site-header__due-badge" title="' +
                    due + ' cards due">' + due + '</span>';
      }
      a.innerHTML =
        '<span class="site-header__nav-link-icon" aria-hidden="true">' +
          page.icon +
        '</span>' +
        '<span class="site-header__nav-link-label">' + page.label + '</span>' +
        badgeHtml;
      if (isActive(page, path)) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    }
    inner.appendChild(nav);

    // Actions: theme toggle + mobile menu button
    var actions = document.createElement("div");
    actions.className = "site-header__actions";

    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "site-header__theme-toggle";
    themeBtn.setAttribute("aria-label", "Toggle dark mode");
    themeBtn.setAttribute("title", "Toggle dark mode");
    themeBtn.innerHTML = themeIconHtml(root.getAttribute("data-theme"));
    themeBtn.addEventListener("click", function () {
      toggleTheme();
      themeBtn.innerHTML = themeIconHtml(root.getAttribute("data-theme"));
    });
    actions.appendChild(themeBtn);

    var menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "site-header__menu-btn";
    menuBtn.setAttribute("aria-label", "Toggle sidebar");
    menuBtn.setAttribute("title", "Sections");
    menuBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="3" y1="6" x2="21" y2="6"/>' +
      '<line x1="3" y1="12" x2="21" y2="12"/>' +
      '<line x1="3" y1="18" x2="21" y2="18"/>' +
      '</svg>';
    menuBtn.addEventListener("click", function () {
      document.dispatchEvent(new CustomEvent("site-nav:toggle-sidebar"));
    });
    actions.appendChild(menuBtn);

    inner.appendChild(actions);

    // Mount: prefer slot, else prepend to body
    var slot = document.querySelector("[data-site-header-slot]");
    if (slot) {
      slot.innerHTML = "";
      slot.appendChild(header);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }
  }

  function themeIconHtml(theme) {
    if (theme === "dark") {
      // sun icon (click to switch to light)
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
        ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4' +
        'M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' +
        '</svg>';
    }
    // moon icon (click to switch to dark)
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' +
      '</svg>';
  }

  // ---------- Boot ---------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHeader);
  } else {
    renderHeader();
  }

  // Refresh due-badge when SRS changes, or when another tab updates theme
  document.addEventListener("srs:change", function () {
    var link = document.querySelector(
      '.site-header__nav-link[href="/endo-guide.html"]');
    if (!link) return;
    var label = link.querySelector(".site-header__nav-link-label");
    var badge = link.querySelector(".site-header__due-badge");
    var due = dueCount();
    if (due > 0) {
      if (badge) {
        badge.textContent = String(due);
        badge.title = due + " cards due";
      } else if (label) {
        var span = document.createElement("span");
        span.className = "site-header__due-badge";
        span.textContent = String(due);
        span.title = due + " cards due";
        label.parentNode.insertBefore(span, label.nextSibling);
      }
    } else if (badge) {
      badge.parentNode.removeChild(badge);
    }
  });

  window.addEventListener("storage", function (e) {
    if (e.key === "endo-guide.theme" &&
        (e.newValue === "light" || e.newValue === "dark")) {
      root.setAttribute("data-theme", e.newValue);
      var btn = document.querySelector(".site-header__theme-toggle");
      if (btn) btn.innerHTML = themeIconHtml(e.newValue);
    }
    if (e.key === "endo-guide.srs.v2") {
      document.dispatchEvent(new CustomEvent("srs:change"));
    }
  });
})();
