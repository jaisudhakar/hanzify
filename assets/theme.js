/* Hanzify — storefront interactions
   Cart (AJAX API + Section Rendering), drawers, predictive search, collection filtering,
   product form / variant picker, try-on stage, zip reveal, sliders and scroll effects. */
(function () {
  'use strict';

  var T = window.theme || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  var parse = function (html) { return new DOMParser().parseFromString(html, 'text/html'); };
  var announce = function (msg) { var r = $('[data-live-region]'); if (r) { r.textContent = ''; setTimeout(function () { r.textContent = msg; }, 50); } };
  var sectionIdOf = function (el) { var s = el && el.closest('.shopify-section'); return s ? s.id.replace(/^shopify-section-/, '') : null; };

  function formatMoney(cents) {
    var cur = (window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD';
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency: cur, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
    } catch (e) { return (cents / 100).toFixed(2) + ' ' + cur; }
  }

  /* ------------------------------------------------------------------
     Drawers / overlay / focus management
     ------------------------------------------------------------------ */
  var overlay = $('[data-overlay]');
  var openPanel = null;
  var lastFocus = null;
  function focusables(el) {
    return $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', el)
      .filter(function (x) { return x.offsetParent !== null; });
  }
  function open(id) {
    var panel = document.getElementById(id);
    if (!panel) return false;
    if (openPanel && openPanel !== panel) close(true);
    lastFocus = document.activeElement;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    overlay && overlay.classList.add('is-open');
    document.body.classList.add('is-locked');
    openPanel = panel;
    setTimeout(function () {
      var f = panel.querySelector('[data-search-input]') || focusables(panel)[0];
      f && f.focus({ preventScroll: true });
    }, 80);
    return true;
  }
  function close(silent) {
    if (!openPanel) return;
    openPanel.classList.remove('is-open');
    openPanel.setAttribute('aria-hidden', 'true');
    overlay && overlay.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    openPanel = null;
    if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (o) {
      if (o.getAttribute('data-open') === 'cart-drawer' && T.cartType === 'page') return;
      if (open(o.getAttribute('data-open'))) e.preventDefault();
      return;
    }
    if (e.target.closest('[data-close]') && openPanel) { if (e.target.type !== 'submit') e.preventDefault(); close(); return; }
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); closeModal(); }
    if (e.key === 'Tab' && openPanel) {
      var f = focusables(openPanel);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* modal + lightbox */
  function closeModal() { $$('.modal.is-open, .lightbox.is-open').forEach(function (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); }); }
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-modal]');
    if (m) {
      var el = document.getElementById(m.getAttribute('data-modal'));
      if (el) { el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); var c = $('[data-modal-close]', el); c && c.focus(); }
      return;
    }
    if (e.target.closest('[data-modal-close]') || e.target.classList.contains('modal') || e.target.closest('.lightbox')) closeModal();
    var z = e.target.closest('[data-zoom]');
    if (z && !e.target.closest('video, model-viewer, iframe, button')) {
      var lb = $('[data-lightbox]');
      if (!lb) return;
      $('img', lb).src = z.getAttribute('data-zoom');
      $('img', lb).alt = ($('img', z) || {}).alt || '';
      lb.classList.add('is-open');
      lb.setAttribute('aria-hidden', 'false');
    }
  });

  /* toast */
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 8.5l4 4 8-9"/></svg><span>' + esc(msg) + '</span>';
    toastEl.classList.add('is-visible');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2600);
  }

  /* ------------------------------------------------------------------
     Cart
     ------------------------------------------------------------------ */
  var Cart = {
    sections: function () {
      var ids = ['cart-drawer'];
      var page = $('[data-cart-page]');
      var pid = sectionIdOf(page);
      if (pid) ids.push(pid);
      return ids;
    },
    apply: function (sections) {
      if (!sections) return;
      var drawerHTML = sections['cart-drawer'];
      if (drawerHTML) {
        var doc = parse(drawerHTML);
        var fresh = $('#cart-drawer', doc);
        var cur = $('#cart-drawer');
        if (fresh && cur) {
          cur.innerHTML = fresh.innerHTML;
          var count = parseInt(($('[data-cart-count-value]', doc) || fresh).getAttribute('data-cart-count-value'), 10);
          if (!isNaN(count)) Cart.setCount(count);
        }
      }
      var page = $('[data-cart-page]');
      var pid = sectionIdOf(page);
      if (pid && sections[pid]) {
        var pdoc = parse(sections[pid]);
        var wrap = page.closest('.shopify-section');
        var inner = $('#shopify-section-' + pid, pdoc) || pdoc.body;
        wrap.innerHTML = inner.innerHTML;
      }
      Cart.meter();
    },
    setCount: function (n) {
      $$('[data-cart-count]').forEach(function (el) { el.textContent = n; });
      $$('[data-cart-badge]').forEach(function (el) { el.hidden = !n; });
    },
    meter: function () {
      $$('[data-ship-meter]').forEach(function (m) {
        var rate = (window.Shopify && Shopify.currency && parseFloat(Shopify.currency.rate)) || 1;
        var threshold = Math.round((T.freeShipping || 0) * rate);
        if (!threshold) { m.hidden = true; return; }
        var total = parseInt(m.getAttribute('data-total'), 10) || 0;
        var left = Math.max(0, threshold - total);
        var text = $('[data-ship-text]', m);
        if (text) text.innerHTML = left > 0 ? (T.strings.shippingAway || '').replace('[amount]', '<strong>' + esc(formatMoney(left)) + '</strong>') : T.strings.shippingFree;
        var bar = $('[data-ship-bar]', m);
        if (bar) bar.style.width = Math.min(100, (total / threshold) * 100) + '%';
      });
    },
    add: function (body, trigger) {
      if (trigger) trigger.setAttribute('aria-busy', 'true');
      body.append('sections', Cart.sections().join(','));
      body.append('sections_url', window.location.pathname);
      return fetch(T.routes.cartAdd, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/javascript' }, body: body })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.status) throw new Error(res.description || res.message || T.strings.cartError);
          if (T.cartType === 'page') { window.location.href = T.routes.cart; return res; }
          Cart.apply(res.sections);
          open('cart-drawer');
          announce(T.strings.added);
          return res;
        })
        .finally(function () { if (trigger) trigger.removeAttribute('aria-busy'); });
    },
    addVariant: function (id, qty, trigger) {
      var fd = new FormData();
      fd.append('id', id);
      fd.append('quantity', qty || 1);
      return Cart.add(fd, trigger).catch(function (err) { toast(err.message); });
    },
    change: function (key, qty, line) {
      var drawer = $('#cart-drawer');
      drawer && drawer.classList.add('is-loading');
      return fetch(T.routes.cartChange, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: key, quantity: qty, sections: Cart.sections(), sections_url: window.location.pathname })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, json: j }; }); })
        .then(function (res) {
          if (!res.ok || res.json.errors) {
            var msg = res.json.errors || res.json.description || T.strings.cartError;
            var err = line && $('[data-line-error]', line);
            if (err) { err.textContent = msg; err.hidden = false; } else toast(msg);
            return;
          }
          Cart.apply(res.json.sections);
          Cart.setCount(res.json.item_count);
        })
        .catch(function () { toast(T.strings.cartError); })
        .finally(function () { var d = $('#cart-drawer'); d && d.classList.remove('is-loading'); });
    }
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qty-change]');
    var rm = e.target.closest('[data-remove]');
    var line = (b || rm) && (b || rm).closest('[data-line-item]');
    if (!line) return;
    e.preventDefault();
    if (rm) return Cart.change(line.getAttribute('data-key'), 0, line);
    var input = $('[data-qty-input]', line);
    var step = parseInt(input.step, 10) || 1;
    var q = Math.max(0, (parseInt(input.value, 10) || 0) + step * parseInt(b.getAttribute('data-qty-change'), 10));
    input.value = q;
    Cart.change(line.getAttribute('data-key'), q, line);
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-line-item] [data-qty-input]')) {
      var line = e.target.closest('[data-line-item]');
      Cart.change(line.getAttribute('data-key'), Math.max(0, parseInt(e.target.value, 10) || 0), line);
    }
    if (e.target.matches('[data-autosubmit]')) e.target.form.submit();
  });
  document.addEventListener('input', debounce(function (e) {
    if (!e.target.matches('[data-cart-note]')) return;
    fetch(T.routes.cartUpdate, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: e.target.value }) });
  }, 400));

  /* ------------------------------------------------------------------
     Product cards: quick add
     ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var tg = e.target.closest('[data-quick-toggle]');
    if (tg) {
      var c = tg.closest('.card');
      var on = !c.classList.contains('is-quick');
      $$('.card.is-quick').forEach(function (x) { x.classList.remove('is-quick'); $$('.card__size', x).forEach(function (s) { s.tabIndex = -1; }); });
      c.classList.toggle('is-quick', on);
      tg.setAttribute('aria-expanded', on);
      var q = $('.card__quick', c);
      q && q.setAttribute('aria-hidden', !on);
      $$('.card__size', c).forEach(function (s) { s.tabIndex = on ? 0 : -1; });
      if (on) { var first = $('.card__size:not([disabled])', c); first && first.focus(); }
      return;
    }
    if (!e.target.closest('.card__quick')) $$('.card.is-quick').forEach(function (x) { x.classList.remove('is-quick'); });
    var b = e.target.closest('[data-quick-add]');
    if (!b) return;
    e.preventDefault();
    b.classList.add('is-added');
    Cart.addVariant(b.getAttribute('data-quick-add'), 1, b).then(function () {
      setTimeout(function () { b.classList.remove('is-added'); var c2 = b.closest('.card'); c2 && c2.classList.remove('is-quick'); }, 500);
    });
  });

  /* ------------------------------------------------------------------
     Sliders
     ------------------------------------------------------------------ */
  function initSlider(root) {
    var track = $('[data-slider-track]', root);
    if (!track || track._slider) return;
    track._slider = true;
    var prev = $('[data-slider-prev]', root);
    var next = $('[data-slider-next]', root);
    function step() { var c = track.children[0]; return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : 300; }
    function update() {
      var max = track.scrollWidth - track.clientWidth;
      var rtl = getComputedStyle(track).direction === 'rtl';
      var pos = Math.abs(track.scrollLeft);
      if (prev) prev.disabled = pos < 4;
      if (next) next.disabled = pos > max - 4;
      if (rtl) { var t = prev; prev = next; next = t; }
    }
    prev && prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }); });
    next && next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }); });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
  function observeReveal(scope) {
    $$('[data-reveal]:not(.is-in)', scope).forEach(function (el) {
      if (io && !(window.Shopify && Shopify.designMode)) io.observe(el); else el.classList.add('is-in');
    });
  }

  /* ------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------ */
  function initNav() {
    var nav = $('[data-nav]');
    if (!nav || nav._init) return;
    nav._init = true;
    var ticking = false;
    function update() {
      ticking = false;
      var y = nav.offsetHeight / 2;
      var dark = $$('[data-nav-dark]').some(function (el) { var r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
      nav.classList.toggle('is-dark', dark);
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();

    var toggle = $('[data-dropdown-toggle]', nav);
    var menu = $('[data-dropdown]', nav);
    if (toggle && menu) {
      var set = function (on) { menu.classList.toggle('is-open', on); toggle.setAttribute('aria-expanded', on); };
      toggle.addEventListener('click', function (e) { e.stopPropagation(); set(!menu.classList.contains('is-open')); if (menu.classList.contains('is-open')) { var a = $('a', menu); a && a.focus(); } });
      document.addEventListener('click', function (e) { if (!menu.contains(e.target)) set(false); });
      menu.addEventListener('click', function (e) { if (e.target.closest('[data-open]')) set(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('is-open')) { set(false); toggle.focus(); } });
    }
  }

  /* ------------------------------------------------------------------
     Try-on stage: garments slide onto the model as you scroll or drag
     ------------------------------------------------------------------ */
  function initTryon(root) {
    if (root._tryon) return;
    root._tryon = true;
    var sticky = $('.tryon__sticky', root);
    var layers = $$('.tryon__garment', root);
    var n = layers.length;
    if (!n) return;
    var data = [];
    try { data = JSON.parse($('[data-tryon-json]', root).textContent); } catch (e) {}
    var labelEl = $('[data-tryon-label]', root);
    var titleEl = $('[data-tryon-title]', root);
    var priceEl = $('[data-tryon-price]', root);
    var linkEl = $('[data-tryon-link]', root);
    var hint = $('[data-tryon-hint]', root);
    var current = -1;
    var ticking = false;
    root.style.height = (n * 100) + 'vh';

    function roll(el, html) {
      if (!el) return;
      var old = $('.tryon__roll', el);
      if (old && !reduceMotion) {
        old.classList.add('is-out');
        setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 600);
      } else if (old) { el.innerHTML = ''; }
      var span = document.createElement('span');
      span.className = 'tryon__roll' + (reduceMotion ? '' : ' is-in');
      span.innerHTML = html;
      if (old && !reduceMotion) { span.style.position = 'absolute'; span.style.left = 0; span.style.right = 0; span.style.top = 0; }
      el.style.position = 'relative';
      el.appendChild(span);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        span.classList.remove('is-in');
        setTimeout(function () { span.style.position = ''; }, 620);
      }); });
    }
    function setText(i) {
      if (i === current) return;
      current = i;
      var d = data[i] || {};
      roll(labelEl, esc(d.label || ''));
      roll(titleEl, esc(d.title || ''));
      roll(priceEl, esc(d.price || ''));
      if (linkEl && d.url) linkEl.href = d.url;
      if (hint) hint.classList.toggle('is-hidden', i >= n - 1);
    }
    function render(v) {
      var vw = window.innerWidth;
      var X = vw < 750 ? vw * 0.62 : vw * 0.39;
      if (getComputedStyle(root).direction === 'rtl') X = -X;
      layers.forEach(function (el, k) {
        var d = k - v;
        var x = 0, sc = 1, op = 0, gray = 0;
        if (d <= -1 || d > 2) { op = 0; }
        else if (d <= 0) { op = Math.max(0, 1 + d * 2.6); }
        else if (d <= 1) { x = d * X; sc = 1 - d * 0.08; op = 1 - d * 0.55; gray = d * 0.5; }
        else { x = d * X; sc = 0.92; op = Math.max(0, 0.45 * (2 - d) * 1.6 - 0.27); gray = 0.5; }
        el.style.opacity = op.toFixed(3);
        el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0) scale(' + sc.toFixed(4) + ')';
        el.style.filter = gray ? 'grayscale(' + gray.toFixed(2) + ')' : '';
        el.style.zIndex = d <= 0 ? 3 : 2;
      });
      setText(Math.min(n - 1, Math.max(0, Math.round(v))));
    }
    function progress() {
      var r = root.getBoundingClientRect();
      var vh = window.innerHeight;
      var raw = Math.min(n - 1, Math.max(0, -r.top / vh));
      var s = Math.floor(raw);
      var f = raw - s;
      var e = Math.min(1, Math.max(0, (f - 0.15) / 0.7));
      e = e * e * (3 - 2 * e);
      return s + e;
    }
    function update() { ticking = false; if (document.contains(root)) render(progress()); }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();

    /* drag horizontally to explore (mouse, pen and touch) */
    var start = null;
    function perItem() { return Math.max(220, window.innerWidth * 0.32); }
    function itemScroll(k) { return root.getBoundingClientRect().top + window.scrollY + k * window.innerHeight; }
    sticky.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('a, button')) return;
      start = { x: e.clientX, scroll: window.scrollY, raw: (window.scrollY - itemScroll(0)) / window.innerHeight, dx: 0, moved: false, id: e.pointerId };
    });
    window.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x;
      start.dx = dx;
      if (!start.moved && Math.abs(dx) < 6) return;
      if (!start.moved) { start.moved = true; sticky.classList.add('is-dragging'); try { sticky.setPointerCapture(e.pointerId); } catch (err) {} }
      var target = start.scroll - (dx / perItem()) * window.innerHeight;
      var min = itemScroll(0), max = itemScroll(n - 1);
      window.scrollTo({ top: Math.min(max, Math.max(min, target)), behavior: 'instant' });
    });
    function end(e) {
      if (!start || (e && e.pointerId !== start.id)) return;
      var st = start;
      start = null;
      sticky.classList.remove('is-dragging');
      if (!st.moved) return;
      var k = Math.round(st.raw - st.dx / perItem() + (st.dx < 0 ? 0.35 : -0.35));
      k = Math.min(n - 1, Math.max(0, k));
      window.scrollTo({ top: itemScroll(k), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    sticky.addEventListener('dragstart', function (e) { e.preventDefault(); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var k = Math.min(n - 1, Math.max(0, current + (e.key === 'ArrowRight' ? 1 : -1)));
      window.scrollTo({ top: itemScroll(k), behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* floating "buy bar" — hides over the footer and when the sticky ATC shows */
  function initBuybar() {
    var bar = $('[data-buybar]');
    if (!bar || bar._init) return;
    bar._init = true;
    var foot = $('.site-footer');
    if (foot && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { bar.classList.toggle('is-hidden', en[0].isIntersecting); }).observe(foot);
    }
  }

  /* ------------------------------------------------------------------
     Zip reveal (sticky scroll)
     ------------------------------------------------------------------ */
  function initReveal(root) {
    if (root._reveal) return;
    root._reveal = true;
    var sticky = $('.reveal__sticky', root);
    var video = $('video', root);
    if (reduceMotion) { sticky.style.setProperty('--p', 1); sticky.style.setProperty('--q', 1); sticky.style.setProperty('--t', 1); return; }
    var ticking = false;
    function update() {
      ticking = false;
      if (!document.contains(root)) return;
      var r = root.getBoundingClientRect();
      var total = root.offsetHeight - window.innerHeight;
      var raw = Math.min(1, Math.max(0, -r.top / total));
      var p = Math.min(1, raw / 0.55);
      var eased = p * p * (3 - 2 * p);
      var q = Math.min(1, Math.max(0, (raw - 0.5) / 0.15));
      var t = Math.min(1, Math.max(0, (raw - 0.62) / 0.18));
      sticky.style.setProperty('--p', eased.toFixed(4));
      sticky.style.setProperty('--q', q.toFixed(4));
      sticky.style.setProperty('--t', t.toFixed(4));
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
    if (video && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { en[0].isIntersecting ? video.play().catch(function () {}) : video.pause(); }).observe(root);
    }
  }

  /* parallax banners */
  var parallaxBound = false;
  function initParallax() {
    if (reduceMotion || parallaxBound) return;
    parallaxBound = true;
    function update() {
      $$('[data-parallax]').forEach(function (el) {
        var r = el.getBoundingClientRect();
        var p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight));
        el.style.setProperty('--parallax', (p * -60).toFixed(1) + 'px');
      });
    }
    window.addEventListener('scroll', function () { requestAnimationFrame(update); }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------
     Predictive search
     ------------------------------------------------------------------ */
  function initSearch() {
    var input = $('[data-search-input]');
    var out = $('[data-search-results]');
    if (!input || !out) return;
    var hint = out.innerHTML;
    var ctrl;
    var run = debounce(function () {
      var q = input.value.trim();
      if (!q) { out.innerHTML = hint; return; }
      if (!input.hasAttribute('data-predictive')) return;
      if (ctrl) ctrl.abort();
      ctrl = 'AbortController' in window ? new AbortController() : null;
      var url = T.routes.predictiveSearch + '?q=' + encodeURIComponent(q) +
        '&section_id=predictive-search&resources[type]=product,collection,page,query&resources[limit]=6&resources[options][unavailable_products]=last';
      fetch(url, ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
        .then(function (html) {
          var doc = parse(html);
          var res = $('[data-predictive-results]', doc);
          out.innerHTML = res ? res.outerHTML : hint;
          $$('[data-reveal]', out).forEach(function (el) { el.classList.add('is-in'); });
        })
        .catch(function () {});
    }, 220);
    input.addEventListener('input', run);
    out.addEventListener('click', function (e) {
      var s = e.target.closest('[data-suggest]');
      if (s && input.hasAttribute('data-predictive')) { e.preventDefault(); input.value = s.getAttribute('data-suggest'); run(); input.focus(); }
    });
  }

  /* ------------------------------------------------------------------
     Collection / search: AJAX filtering, sorting, pagination
     ------------------------------------------------------------------ */
  var gridCols = null;
  function initCollection(root) {
    if (!root || root._init) return;
    root._init = true;
    var sectionId = root.getAttribute('data-section-id') || sectionIdOf(root);

    function load(url, push) {
      root.classList.add('is-loading');
      var u = new URL(url, window.location.origin);
      u.searchParams.set('section_id', sectionId);
      return fetch(u.toString())
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = parse(html);
          var fresh = $('[data-collection-root]', doc);
          if (!fresh) { window.location.href = url; return; }
          var wasOpen = openPanel && openPanel.id === 'facets-drawer';
          if (wasOpen) { openPanel = null; overlay && overlay.classList.remove('is-open'); document.body.classList.remove('is-locked'); }
          root.innerHTML = fresh.innerHTML;
          if (wasOpen) {
            var d = $('#facets-drawer', root);
            if (d) { d.classList.add('is-open', 'no-transition'); d.setAttribute('aria-hidden', 'false'); openPanel = d; overlay && overlay.classList.add('is-open'); document.body.classList.add('is-locked'); requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.remove('no-transition'); }); }); }
          }
          if (push) history.pushState({ collection: true }, '', url);
          bindGrid();
          observeReveal(root);
          var count = $('[data-col-count]', root);
          count && announce(count.textContent);
        })
        .catch(function () { window.location.href = url; })
        .finally(function () { root.classList.remove('is-loading'); });
    }
    function formURL(form) {
      var params = new URLSearchParams(new FormData(form));
      ['filter.v.price.gte', 'filter.v.price.lte'].forEach(function (k) { if (params.get(k) === '') params.delete(k); });
      return window.location.pathname + '?' + params.toString();
    }
    function bindGrid() {
      var grid = $('[data-col-grid]', root);
      if (grid && gridCols) {
        grid.style.setProperty('--cols', gridCols);
        $$('[data-grid-cols]', root).forEach(function (x) { x.classList.toggle('is-active', x.getAttribute('data-grid-cols') === gridCols); });
      }
    }
    root.addEventListener('change', function (e) {
      var form = e.target.closest('[data-facets-form]');
      if (form) {
        if (e.target.type === 'number') return;
        load(formURL(form), true);
        return;
      }
      if (e.target.matches('[data-sort-select]')) {
        var params = new URLSearchParams(window.location.search);
        params.set('sort_by', e.target.value);
        params.delete('page');
        load(window.location.pathname + '?' + params.toString(), true);
      }
    });
    root.addEventListener('input', debounce(function (e) {
      var form = e.target.closest('[data-facets-form]');
      if (form && e.target.type === 'number') load(formURL(form), true);
    }, 700));
    root.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-facets-form]');
      if (!form) return;
      e.preventDefault();
      load(formURL(form), true);
    });
    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-facet-link], [data-facets-clear]');
      if (a && a.href) {
        e.preventDefault();
        var isPage = a.closest('.pagination');
        load(a.href, true).then(function () { if (isPage) root.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); });
        return;
      }
      var g = e.target.closest('[data-grid-cols]');
      if (g) {
        gridCols = g.getAttribute('data-grid-cols');
        bindGrid();
      }
    });
    window.addEventListener('popstate', function () { if (document.contains(root)) load(window.location.href, false); });
  }

  /* ------------------------------------------------------------------
     Product page
     ------------------------------------------------------------------ */
  function initProduct(root) {
    if (!root || root._init) return;
    root._init = true;
    var data;
    try { data = JSON.parse($('[data-product-json]', root).textContent); } catch (e) { return; }
    var sectionId = root.getAttribute('data-section-id');
    var form = $('[data-product-form]', root);
    var idInput = $('[data-variant-id]', root);
    var atc = $('[data-atc]', root);
    var stickyBtn = $('[data-atc-sticky]', root);
    var sticky = $('[data-sticky-atc]', root);
    var errorEl = $('[data-form-error]', root);
    var picker = $('[data-variant-picker]', root);
    var updateUrl = root.getAttribute('data-update-url') === 'true';
    var fetchCtrl;

    function selectedOptions() {
      return $$('fieldset[data-option-index]', picker).map(function (fs) {
        var c = $('input:checked', fs);
        return c ? c.value : null;
      });
    }
    function findVariant(opts) {
      return data.variants.filter(function (v) { return v.options.every(function (o, i) { return o === opts[i]; }); })[0];
    }
    function markAvailability(opts) {
      $$('fieldset[data-option-index]', picker).forEach(function (fs) {
        var idx = parseInt(fs.getAttribute('data-option-index'), 10);
        $$('input[data-option-input]', fs).forEach(function (input) {
          var test = opts.slice(); test[idx] = input.value;
          var match = data.variants.filter(function (v) {
            return v.options.every(function (o, i) { return i === idx ? o === input.value : (i < idx ? o === test[i] : true); });
          });
          var available = match.some(function (v) { return v.available; });
          var label = input.nextElementSibling;
          if (label) label.classList.toggle('is-soldout', !available);
        });
      });
    }
    function setButtons(variant) {
      var label = !variant ? T.strings.unavailable : (variant.available ? T.strings.addToCart : T.strings.soldOut);
      [atc, stickyBtn].forEach(function (b) { if (!b) return; b.textContent = label; b.disabled = !variant || !variant.available; });
    }
    function moveMedia(variant) {
      if (!variant || !variant.featured_media) return;
      var gallery = $('[data-gallery]', root);
      var fig = gallery && $('[data-media-id="' + variant.featured_media.id + '"]', gallery);
      if (!fig) return;
      if (gallery.firstElementChild !== fig) gallery.insertBefore(fig, gallery.firstElementChild);
      if (window.matchMedia('(max-width: 989px)').matches) gallery.scrollTo({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    function refresh(variant) {
      if (fetchCtrl) fetchCtrl.abort();
      fetchCtrl = 'AbortController' in window ? new AbortController() : null;
      fetch(data.url + '?variant=' + variant.id + '&section_id=' + sectionId, fetchCtrl ? { signal: fetchCtrl.signal } : {})
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = parse(html);
          ['[data-price-wrap]', '[data-inventory]', '[data-pickup]', '[data-sticky-price]'].forEach(function (sel) {
            var a = $(sel, root), b = $(sel, doc);
            if (a && b) a.innerHTML = b.innerHTML;
          });
        })
        .catch(function () {});
    }
    function onChange() {
      var opts = selectedOptions();
      $$('fieldset[data-option-index]', picker).forEach(function (fs, i) {
        var l = $('[data-option-label]', fs);
        if (l) l.textContent = opts[i] || '';
      });
      markAvailability(opts);
      var variant = findVariant(opts);
      setButtons(variant);
      if (errorEl) errorEl.hidden = true;
      if (!variant) return;
      idInput.value = variant.id;
      idInput.dispatchEvent(new Event('change', { bubbles: true }));
      moveMedia(variant);
      if (updateUrl) history.replaceState({}, '', data.url + '?variant=' + variant.id);
      refresh(variant);
    }
    if (picker) {
      picker.addEventListener('change', function (e) { if (e.target.matches('[data-option-input]')) onChange(); });
      markAvailability(selectedOptions());
    }

    /* quantity */
    root.addEventListener('click', function (e) {
      var q = e.target.closest('[data-pqty]');
      if (q) {
        var input = $('[data-pqty-input]', root);
        var step = parseInt(input.step, 10) || 1;
        var min = parseInt(input.min, 10) || 1;
        var max = parseInt(input.max, 10) || Infinity;
        input.value = Math.min(max, Math.max(min, (parseInt(input.value, 10) || min) + step * parseInt(q.getAttribute('data-pqty'), 10)));
      }
      if (e.target.closest('[data-atc-sticky]') && form) {
        if (form.requestSubmit) form.requestSubmit(atc); else atc.click();
      }
      var share = e.target.closest('[data-share]');
      if (share) {
        var url = window.location.href;
        if (navigator.share) navigator.share({ title: share.getAttribute('data-title'), url: url }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { var m = $('[data-share-msg]', root); if (m) { m.hidden = false; setTimeout(function () { m.hidden = true; }, 2000); } });
      }
    });

    /* gift card recipient */
    var giftToggle = $('[data-gift-toggle]', root);
    if (giftToggle) {
      giftToggle.addEventListener('change', function () {
        var fields = $('[data-gift-fields]', root);
        fields.hidden = !giftToggle.checked;
        $$('input, textarea', fields).forEach(function (x) { x.disabled = !giftToggle.checked; });
        var off = $('[data-gift-offset]', root);
        if (off) off.value = new Date().getTimezoneOffset().toString();
      });
    }

    /* add to cart */
    if (form) {
      form.addEventListener('submit', function (e) {
        if (T.cartType === 'page' && !window.fetch) return;
        e.preventDefault();
        if (atc && atc.disabled) return;
        if (errorEl) errorEl.hidden = true;
        Cart.add(new FormData(form), atc).catch(function (err) {
          if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; } else toast(err.message);
        });
      });
    }

    /* sticky add to cart bar */
    if (sticky && atc && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        var show = !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', show);
        var bb = $('[data-buybar]');
        bb && bb.classList.toggle('is-hidden', show);
      }).observe(atc);
    }
  }

  /* product recommendations */
  function initRecommendations(el) {
    if (el._init || !el.getAttribute('data-url')) return;
    el._init = true;
    if (el.children.length) { initSlider(el); observeReveal(el); return; }
    fetch(el.getAttribute('data-url'))
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var fresh = $('[data-recommendations]', parse(html));
        if (fresh && fresh.innerHTML.trim()) {
          el.innerHTML = fresh.innerHTML;
          initSlider(el);
          observeReveal(el);
        }
      })
      .catch(function () {});
  }

  /* address forms: preselect country */
  function initAddressForms(scope) {
    $$('select[data-default]', scope).forEach(function (s) { if (s.getAttribute('data-default')) s.value = s.getAttribute('data-default'); });
  }

  /* ------------------------------------------------------------------
     Boot (also re-run inside sections loaded by the theme editor)
     ------------------------------------------------------------------ */
  function init(scope) {
    scope = scope || document;
    $$('[data-slider-root]', scope).forEach(function (r) { if (!r.hasAttribute('data-recommendations')) initSlider(r); });
    $$('[data-tryon]', scope).forEach(initTryon);
    $$('[data-zip-reveal]', scope).forEach(initReveal);
    $$('[data-collection-root]', scope).forEach(initCollection);
    $$('[data-product-section]', scope).forEach(initProduct);
    $$('[data-recommendations]', scope).forEach(initRecommendations);
    initAddressForms(scope);
    observeReveal(scope);
  }

  initNav();
  initBuybar();
  initParallax();
  initSearch();
  init(document);
  Cart.meter();

  document.addEventListener('shopify:section:load', function (e) {
    init(e.target);
    if (e.target.querySelector('[data-nav]')) initNav();
    if (e.target.querySelector('[data-buybar]')) initBuybar();
    window.dispatchEvent(new Event('scroll'));
  });
  document.addEventListener('shopify:block:select', function (e) {
    var tryon = e.target.closest('[data-tryon]');
    if (tryon) {
      var k = $$('.tryon__garment', tryon).indexOf(e.target);
      if (k > -1) window.scrollTo({ top: tryon.getBoundingClientRect().top + window.scrollY + k * window.innerHeight, behavior: 'auto' });
    }
  });

  window.Hanzify = { Cart: Cart, open: open, close: close, init: init };
})();
