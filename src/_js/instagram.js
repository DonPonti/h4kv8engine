/*
 * HFK Instagram embeds.
 *
 * Why not Instagram's embed.js? It swaps a <blockquote> for an iframe and then resizes it,
 * which fights the theme's global iframe CSS (aspect-ratio / height:auto) and is blocked by
 * many privacy tools. Here we create the iframe ourselves, lazily, and size it from the
 * { type: "MEASURE", details: { height } } message Instagram's embed page posts to the parent.
 */
(function () {
  'use strict';
  var ORIGIN = 'https://www.instagram.com';
  var START_HEIGHT = 640;   // used until Instagram reports the real height
  var MIN_HEIGHT = 200, MAX_HEIGHT = 2600;
  var SLOW_MS = 9000;       // show the "open on Instagram" hint if nothing arrives by then

  function frameSrc(kind, code, width) {
    var q = '?cr=1&v=14&wp=' + Math.round(width || 540) +
      '&rd=' + encodeURIComponent(location.origin) +
      '&rp=' + encodeURIComponent(location.pathname);
    return ORIGIN + '/' + kind + '/' + code + '/embed/captioned/' + q;
  }

  function mount(el) {
    if (!el || el.getAttribute('data-ig-mounted')) return;
    var kind = el.getAttribute('data-ig-kind'), code = el.getAttribute('data-ig-code');
    if (!/^(p|reel|tv)$/.test(kind || '') || !/^[A-Za-z0-9_-]+$/.test(code || '')) return;
    el.setAttribute('data-ig-mounted', '1');
    el.classList.add('ig-loading');

    var f = document.createElement('iframe');
    f.className = 'ig-frame';
    f.title = 'Instagram post';
    f.setAttribute('allowtransparency', 'true');
    f.setAttribute('allow', 'encrypted-media');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.style.height = START_HEIGHT + 'px';
    f.src = frameSrc(kind, code, el.clientWidth);
    var stage = el.querySelector('.ig-stage');
    el.insertBefore(f, stage ? stage.nextSibling : el.firstChild);

    setTimeout(function () {
      if (!el.classList.contains('ig-live')) el.classList.add('ig-slow');
    }, SLOW_MS);
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN) return;
    var data = e.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (err) { return; } }
    if (!data || data.type !== 'MEASURE' || !data.details) return;
    var h = Number(data.details.height);
    if (!(h > 0)) return;
    var frames = document.querySelectorAll('iframe.ig-frame');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        frames[i].style.height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(h))) + 'px';
        frames[i].setAttribute('scrolling', 'no');
        var host = frames[i].parentNode;
        host.classList.remove('ig-loading', 'ig-slow');
        host.classList.add('ig-live');
        break;
      }
    }
  });

  var observer = null;
  function scan(root) {
    var list = (root || document).querySelectorAll('.ig-embed:not([data-ig-mounted])');
    for (var i = 0; i < list.length; i++) {
      if (observer) observer.observe(list[i]); else mount(list[i]);
    }
  }

  function init() {
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { observer.unobserve(en.target); mount(en.target); }
        });
      }, { rootMargin: '700px 0px' });
    }
    scan(document);
  }

  window.HFKInstagram = { mount: mount, scan: scan };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
