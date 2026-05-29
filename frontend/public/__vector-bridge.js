(() => {
  if (window.__vectorElementSelector) return;

  var overlay = null;
  var tooltip = null;
  var lockedOverlay = null;
  var lockedElement = null;
  var isEnabled = false;
  var hoveredElement = null;

  function createUI() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = '__vector-sel-overlay';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;'
      + 'border:2px solid #3b82f6;background:rgba(59,130,246,0.08);border-radius:0;'
      + 'transition:all 80ms ease-out;display:none';
    tooltip = document.createElement('div');
    tooltip.id = '__vector-sel-tooltip';
    tooltip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
      + 'background:#292524;color:#e7e5e4;'
      + 'font:500 11px/1.4 system-ui,-apple-system,sans-serif;'
      + 'padding:4px 10px;border-radius:0;white-space:nowrap;max-width:400px;'
      + 'overflow:hidden;text-overflow:ellipsis;'
      + 'border:1px solid #44403c;box-shadow:0 4px 12px rgba(0,0,0,.25);'
      + 'display:none';
  }

  function destroyUI() {
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    if (tooltip?.parentNode) tooltip.parentNode.removeChild(tooltip);
    overlay = null;
    tooltip = null;
    unlockElement();
  }

  function lockElement(el) {
    unlockElement();
    if (!el) return;
    lockedElement = el;
    lockedOverlay = document.createElement('div');
    lockedOverlay.id = '__vector-sel-locked';
    lockedOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;'
      + 'border:2px dashed #3b82f6;background:rgba(59,130,246,0.06);border-radius:3px;';
    var r = el.getBoundingClientRect();
    lockedOverlay.style.top = r.top + 'px';
    lockedOverlay.style.left = r.left + 'px';
    lockedOverlay.style.width = r.width + 'px';
    lockedOverlay.style.height = r.height + 'px';
    document.body.appendChild(lockedOverlay);
    /* Update locked overlay position on scroll/resize */
    lockedOverlay._raf = function updateLocked() {
      if (!lockedElement || !lockedOverlay) return;
      var lr = lockedElement.getBoundingClientRect();
      lockedOverlay.style.top = lr.top + 'px';
      lockedOverlay.style.left = lr.left + 'px';
      lockedOverlay.style.width = lr.width + 'px';
      lockedOverlay.style.height = lr.height + 'px';
      requestAnimationFrame(updateLocked);
    };
    requestAnimationFrame(lockedOverlay._raf);
  }

  function unlockElement() {
    if (lockedOverlay?.parentNode) lockedOverlay.parentNode.removeChild(lockedOverlay);
    lockedOverlay = null;
    lockedElement = null;
  }

  /* Build a unique CSS selector path for an element */
  function getCssSelector(el) {
    if (el.id) return el.tagName.toLowerCase() + '#' + el.id;
    var parts = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(tag + '#' + cur.id); break; }
      var sib = cur, nth = 1;
      while (sib.previousElementSibling) {
        sib = sib.previousElementSibling;
        if (sib.tagName === cur.tagName) nth++;
      }
      var sel = tag;
      if (cur.className && typeof cur.className === 'string') {
        var cls = cur.className.trim().split(/\s+/).filter((c) => c && c.indexOf('__vector') !== 0);
        if (cls.length) sel += '.' + cls.slice(0, 2).join('.');
      }
      var hasSame = false;
      var kids = cur.parentElement ? cur.parentElement.children : [];
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] !== cur && kids[i].tagName === cur.tagName) { hasSame = true; break; }
      }
      if (hasSame) sel += ':nth-of-type(' + nth + ')';
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function getElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var text = (el.textContent || '').trim();
    if (text.length > 100) text = text.substring(0, 100) + '...';
    var html = el.outerHTML || '';
    if (html.length > 500) html = html.substring(0, 500) + '...';
    var classes = [];
    if (el.className && typeof el.className === 'string')
      classes = el.className.trim().split(/\s+/).filter(Boolean);
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classNames: classes,
      textContent: text,
      cssSelector: getCssSelector(el),
      outerHTML: html,
      boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  }

  function tooltipText(el) {
    return 'Click to select';
  }

  function isInternal(el) {
    return el === overlay || el === tooltip || el === lockedOverlay;
  }

  function onMouseMove(e) {
    if (!isEnabled) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isInternal(el) || el === document.body || el === document.documentElement) {
      overlay.style.display = 'none';
      tooltip.style.display = 'none';
      hoveredElement = null;
      return;
    }
    hoveredElement = el;
    var r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = r.top + 'px';
    overlay.style.left = r.left + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    tooltip.textContent = tooltipText(el);
    tooltip.style.display = 'block';
    var ty = r.top - 28;
    if (ty < 4) ty = r.bottom + 4;
    tooltip.style.top = ty + 'px';
    tooltip.style.left = Math.max(4, r.left) + 'px';
  }

  /* ── Element screenshot capture ─────────────────────────────────── */

  function inlineStyles(clone, original) {
    try {
      var cs = window.getComputedStyle(original);
      for (var i = 0; i < cs.length; i++) {
        var prop = cs[i];
        clone.style.setProperty(prop, cs.getPropertyValue(prop));
      }
    } catch(_e) { /* skip if getComputedStyle fails */ }
    var origKids = original.children;
    var cloneKids = clone.children;
    for (var j = 0; j < origKids.length && j < cloneKids.length; j++) {
      inlineStyles(cloneKids[j], origKids[j]);
    }
  }

  /**
   * Convert <img> elements in a clone to inline data URLs so they render
   * inside SVG foreignObject (which cannot load external resources).
   * Matches original images by index to read their naturalWidth/Height.
   */
  function inlineImages(clone, original) {
    var cloneImgs = clone.querySelectorAll('img');
    var origImgs = original.querySelectorAll('img');
    for (var i = 0; i < cloneImgs.length && i < origImgs.length; i++) {
      try {
        var origImg = origImgs[i];
        if (!origImg.naturalWidth || !origImg.naturalHeight) continue;
        if (origImg.src && origImg.src.indexOf('data:') === 0) continue;
        var c = document.createElement('canvas');
        c.width = origImg.naturalWidth;
        c.height = origImg.naturalHeight;
        var cx = c.getContext('2d');
        cx.drawImage(origImg, 0, 0);
        cloneImgs[i].src = c.toDataURL('image/png');
      } catch(_e) { /* skip tainted / cross-origin images */ }
    }
  }

  /**
   * Capture a canvas element (or element containing canvases) by reading
   * its actual pixel data, with padding around it for context.
   */
  function captureCanvasElement(sourceCanvas, rect, padding) {
    return new Promise((resolve) => {
      try {
        var pad = padding || 10;
        var maxW = 600, maxH = 400;

        /* Capture the visible region around the element using the page */
        var captureX = Math.max(0, rect.left - pad);
        var captureY = Math.max(0, rect.top - pad);
        var captureW = Math.min(rect.width + pad * 2, window.innerWidth - captureX);
        var captureH = Math.min(rect.height + pad * 2, window.innerHeight - captureY);

        var scale = Math.min(1, maxW / captureW, maxH / captureH);
        var w = Math.round(captureW * scale);
        var h = Math.round(captureH * scale);
        var dpr = 2;

        var outCanvas = document.createElement('canvas');
        outCanvas.width = w * dpr;
        outCanvas.height = h * dpr;
        var ctx = outCanvas.getContext('2d');
        ctx.scale(dpr * scale, dpr * scale);

        /* Draw the source canvas content, offset to account for padding */
        var offsetX = rect.left - captureX;
        var offsetY = rect.top - captureY;
        ctx.drawImage(sourceCanvas, offsetX, offsetY, rect.width, rect.height);

        var format = 'image/jpeg';
        var dataUrl = outCanvas.toDataURL(format, 0.8);
        if (dataUrl.length > 200000) {
          dataUrl = outCanvas.toDataURL('image/jpeg', 0.5);
        }
        resolve(dataUrl.length > 200000 ? null : dataUrl);
      } catch(e) {
        console.warn('[vector-bridge] canvas pixel capture failed:', e.message);
        resolve(null);
      }
    });
  }

  function captureElement(el) {
    return new Promise((resolve) => {
      try {
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) { resolve(null); return; }

        /* If the element IS a canvas, capture its pixels directly */
        if (el.tagName === 'CANVAS') {
          return captureCanvasElement(el, rect, 10).then(resolve);
        }

        /* If the element contains a canvas, capture the first canvas */
        var innerCanvas = el.querySelector('canvas');
        if (innerCanvas) {
          var innerRect = innerCanvas.getBoundingClientRect();
          return captureCanvasElement(innerCanvas, innerRect, 10).then(resolve);
        }

        /* Standard DOM capture via SVG foreignObject */
        var maxW = 600, maxH = 400;
        var scale = Math.min(1, maxW / rect.width, maxH / rect.height);
        var w = Math.round(rect.width * scale);
        var h = Math.round(rect.height * scale);
        var dpr = 2;

        var clone = el.cloneNode(true);
        inlineStyles(clone, el);
        inlineImages(clone, el);
        clone.style.margin = '0';
        clone.style.position = 'static';
        var selectorEls = clone.querySelectorAll('[id^="__vector-sel"]');
        for (var i = 0; i < selectorEls.length; i++) {
          selectorEls[i].parentNode.removeChild(selectorEls[i]);
        }

        var xhtml = new XMLSerializer().serializeToString(clone);
        /* Use data URI instead of Blob URL — more reliable across browsers */
        var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
          + '<foreignObject width="100%" height="100%">'
          + '<div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale(' + scale + ');transform-origin:top left;width:' + rect.width + 'px;height:' + rect.height + 'px;overflow:hidden;">'
          + xhtml
          + '</div>'
          + '</foreignObject></svg>';

        var img = new Image();
        var timeout = setTimeout(() => { console.warn('[vector-bridge] captureElement timed out'); resolve(null); }, 1500);

        img.onload = () => {
          clearTimeout(timeout);
          try {
            var canvas = document.createElement('canvas');
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            var ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.drawImage(img, 0, 0, w, h);
            var format = (w > 100) ? 'image/jpeg' : 'image/png';
            var quality = (format === 'image/jpeg') ? 0.8 : undefined;
            var dataUrl = canvas.toDataURL(format, quality);
            if (dataUrl.length > 200000) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            }
            resolve(dataUrl.length > 200000 ? null : dataUrl);
          } catch(e) {
            console.warn('[vector-bridge] canvas capture failed:', e.message);
            resolve(null);
          }
        };
        img.onerror = (e) => {
          clearTimeout(timeout);
          console.warn('[vector-bridge] SVG image load failed:', e);
          resolve(null);
        };

        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
      } catch(e) {
        console.warn('[vector-bridge] captureElement error:', e.message);
        resolve(null);
      }
    });
  }

  /* ── Click handler ────────────────────────────────────────────── */

  function onClick(e) {
    if (!isEnabled || !hoveredElement) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = hoveredElement;
    var info = getElementInfo(el);
    info.clickPosition = { x: e.clientX, y: e.clientY };
    lockElement(el);
    captureElement(el).then((screenshot) => {
      if (screenshot) info.screenshot = screenshot;
      window.parent.postMessage({ type: 'ELEMENT_SELECTED', data: info }, '*');
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isEnabled) {
      disable();
      window.parent.postMessage({ type: 'ELEMENT_SELECTOR_CANCELLED' }, '*');
    }
  }

  function enable() {
    if (isEnabled) return;
    isEnabled = true;
    createUI();
    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.body.style.cursor = 'crosshair';
    window.parent.postMessage({ type: 'ELEMENT_SELECTOR_ENABLED' }, '*');
  }

  function disable() {
    if (!isEnabled) return;
    isEnabled = false;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.style.cursor = '';
    hoveredElement = null;
    destroyUI();
  }

  window.addEventListener('message', (event) => {
    if (!event.data?.type) return;
    if (event.data.type === 'ELEMENT_SELECTOR_ENABLE') enable();
    else if (event.data.type === 'ELEMENT_SELECTOR_DISABLE') disable();
    else if (event.data.type === 'ELEMENT_SELECTOR_UNLOCK') unlockElement();
    else if (event.data.type === 'VECTOR_NAV_BACK') history.back();
    else if (event.data.type === 'VECTOR_NAV_FORWARD') history.forward();
    else if (event.data.type === 'VECTOR_NAV_REFRESH') location.reload();
  });

  window.__vectorElementSelector = { enable: enable, disable: disable };
  window.parent.postMessage({ type: 'ELEMENT_SELECTOR_READY' }, '*');

  /* ── Navigation tracking ─────────────────────────────────────── */

  function reportNav() {
    var path = location.pathname + location.search + location.hash;
    window.parent.postMessage({ type: 'VECTOR_NAV_UPDATE', data: { path: path } }, '*');
  }

  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function() { origPush.apply(this, arguments); reportNav(); };
  history.replaceState = function() { origReplace.apply(this, arguments); reportNav(); };
  window.addEventListener('popstate', reportNav);

  reportNav();

  /* ── Console error/warning capture ─────────────────────────── */

  var logBuffer = [];
  var LOG_MAX = 50;

  function safeStringify(args) {
    try {
      var parts = [];
      for (var i = 0; i < args.length; i++) {
        try { parts.push(typeof args[i] === 'string' ? args[i] : JSON.stringify(args[i])); }
        catch(_e) { parts.push(String(args[i])); }
      }
      return parts.join(' ');
    } catch(_e) { return ''; }
  }

  function pushLog(level, msg, source, line, col, stack) {
    try {
      if (logBuffer.length >= LOG_MAX) logBuffer.shift();
      logBuffer.push({
        level: level,
        message: String(msg || ''),
        source: source || '',
        line: line || 0,
        col: col || 0,
        stack: stack || '',
        timestamp: Date.now()
      });
    } catch(_e) { /* never crash the app */ }
  }

  window.onerror = (msg, source, line, col, err) => {
    pushLog('error', msg, source, line, col, err?.stack);
  };
  window.addEventListener('unhandledrejection', (e) => {
    pushLog('unhandledrejection', String(e.reason));
  });
  var origError = console.error;
  console.error = function() {
    origError.apply(console, arguments);
    pushLog('console.error', safeStringify(arguments));
  };
  var origWarn = console.warn;
  console.warn = function() {
    origWarn.apply(console, arguments);
    pushLog('console.warn', safeStringify(arguments));
  };
  var origLog = console.log;
  console.log = function() {
    origLog.apply(console, arguments);
    pushLog('console.log', safeStringify(arguments));
  };
  var origInfo = console.info;
  console.info = function() {
    origInfo.apply(console, arguments);
    pushLog('console.info', safeStringify(arguments));
  };

  /* Intercept fetch to capture network errors (4xx/5xx) and billing headers */
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function() {
      var url = arguments[0];
      if (typeof url === 'object' && url.url) url = url.url;
      return origFetch.apply(this, arguments).then(function(res) {
        if (!res.ok) {
          pushLog('network', (arguments[1]?.method || 'GET') + ' ' + url + ' ' + res.status + ' ' + res.statusText);
        }
        var billingErr = res.headers.get('X-Vector-Billing-Error');
        if (billingErr && !window.__vectorBillingErrorSent) {
          window.__vectorBillingErrorSent = true;
          window.parent.postMessage({
            type: 'VECTOR_BILLING_ERROR',
            data: { reason: 'insufficient_credits', entity: 'owner' }
          }, '*');
        }
        return res;
      }, (err) => {
        pushLog('network', 'FETCH FAILED ' + url + ' ' + (err?.message || err));
        throw err;
      });
    };
  }

  /* Intercept XMLHttpRequest to capture network errors (4xx/5xx) and billing headers */
  var origXhrOpen = XMLHttpRequest.prototype.open;
  var origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._vectorMethod = method;
    this._vectorUrl = url;
    return origXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('loadend', () => {
      if (this.status >= 400) {
        pushLog('network', this._vectorMethod + ' ' + this._vectorUrl + ' ' + this.status + ' ' + this.statusText);
      }
      var billingErr = this.getResponseHeader('X-Vector-Billing-Error');
      if (billingErr && !window.__vectorBillingErrorSent) {
        window.__vectorBillingErrorSent = true;
        window.parent.postMessage({
          type: 'VECTOR_BILLING_ERROR',
          data: { reason: 'insufficient_credits', entity: 'owner' }
        }, '*');
      }
    });
    return origXhrSend.apply(this, arguments);
  };

  setInterval(() => {
    if (!logBuffer.length) return;
    var batch = logBuffer.splice(0);
    window.parent.postMessage({
      type: 'VECTOR_CONSOLE_LOG',
      data: { entries: batch }
    }, '*');
  }, 3000);
})();