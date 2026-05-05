/**
 * JavaScript bridge injected into the WebView to compute and post its content height.
 *
 * The script is idempotent (safe to inject multiple times), uses a namespaced
 * `postMessage` protocol (`__RN_SIZED_WV__:<height>`) so user-land messages
 * never collide with bridge traffic, and avoids clamping the host document's
 * layout until a real height has been committed — a behaviour required for
 * correct rendering inside iOS 26 WKWebView.
 *
 * @remarks
 * ## Measurement algorithm (O(1))
 *
 * Every measurement is the `Math.max` of multiple authoritative layout
 * sources, **without mutating** the host page's DOM or styles:
 *
 * 1. `body.scrollHeight` / `body.offsetHeight` — primary signal; includes
 *    body padding and any block-level margin that did not collapse out.
 * 2. `documentElement.scrollHeight` / `documentElement.offsetHeight` —
 *    backstop when framework CSS rules style `html` directly.
 * 3. `body.lastInFlowChild.getBoundingClientRect().bottom +
 *    computedMarginBottom` — catches margin-collapse (where the last
 *    child's bottom margin escapes `<body>`) and late-reflow scenarios
 *    where `scrollHeight` momentarily under-reports on iOS WKWebView.
 *    `getBoundingClientRect` is part of the CSSOM View spec and returns
 *    document-layout coordinates, NOT viewport-clamped values.
 *
 * Inert siblings (`SCRIPT`, `STYLE`, `META`, `LINK`, `TITLE`, `HEAD`,
 * `NOSCRIPT`) and out-of-flow positions (`fixed` / `sticky` / `absolute`)
 * are skipped during the last-child walk so they never short-circuit the
 * probe with viewport-clamped or zero-height values.
 *
 * **No DOM mutation:** earlier versions wrapped `<body>`'s children in a
 * synthetic `<div>` for measurement, which broke margin collapse between
 * the first/last child and the body and caused under-reporting on
 * margin-heavy CMS content. The bridge now measures the user's DOM
 * directly and never injects styles.
 *
 * ## Fallback strategy
 *
 * Measurement is rerun adaptively while either condition holds:
 *
 * - `state.pendingLoads > 0` (an image / iframe / video is still loading), or
 * - `Date.now() - state.bootstrapAt < BOOTSTRAP_GRACE_MS` (5 s grace window
 *   from script start, refreshed on `markLoading`, font `loadingdone`, and
 *   `state.refresh`).
 *
 * Once both expire only signal-driven re-measures (mutation, resize, font,
 * viewport, message) trigger work — the steady-state CPU cost is zero.
 */
export const AUTO_HEIGHT_BRIDGE: string = `(() => {
  // ============================================================
  // SECTION: Constants
  // ============================================================
  var GLOBAL_KEY = '__RN_SIZED_WEBVIEW__';
  var MESSAGE_KEY = '__AUTO_HEIGHT__';
  var MESSAGE_PREFIX = '__RN_SIZED_WV__:';
  var ACTIVE_DEBOUNCE_MS = 48;
  var IDLE_DEBOUNCE_MS = 160;
  var INITIAL_FALLBACK_MS = 600;
  var MAX_FALLBACK_MS = 4000;
  var BOOTSTRAP_GRACE_MS = 5000;
  var MAX_REASONABLE_HEIGHT = 120000;
  var WARMUP_MIN_HEIGHT = 2;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // The global handle exposes ONLY a tiny frozen surface (refresh/destroy/
  // version) — the mutable internal \`state\` stays in closure so page scripts
  // cannot tamper with counters, timers, or pending-load flags.
  if (window[GLOBAL_KEY]) {
    try {
      var existing = window[GLOBAL_KEY];
      if (existing && typeof existing.refresh === 'function') {
        existing.refresh();
      }
    } catch (error) {
      // no-op
    }
    return;
  }

  var queueMicro =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : function (callback) {
          Promise.resolve().then(callback).catch(function () {});
        };

  var once = function (fn) {
    var called = false;

    return function () {
      if (called) {
        return;
      }

      called = true;
      return fn.apply(this, arguments);
    };
  };

  // ============================================================
  // SECTION: State
  // ============================================================
  var state = {
    frame: null,
    timer: null,
    microtask: false,
    pendingLoads: 0,
    lastHeight: 0,
    anomalyCount: 0,
    fallbackTimer: null,
    fallbackDelay: INITIAL_FALLBACK_MS,
    // Timestamp of the most recent "bootstrap signal" (script start, refresh,
    // markLoading, font loadingdone). Within BOOTSTRAP_GRACE_MS of this value
    // the fallback timer keeps re-arming itself adaptively. Replaces the
    // bounded fallbackCount strategy that could exhaust before slow CMS pages
    // finished settling.
    bootstrapAt: Date.now(),
    cleanup: [],
    mediaObserver: null,
  };

  var publishHandle = function () {
    var handle = {
      version: 2,
      refresh: function () {
        state.bootstrapAt = Date.now();
        scheduleMeasure(true);
      },
      destroy: function () {
        cleanupAll();
      },
    };

    try {
      // Lock down the public handle so page scripts cannot replace methods
      // with no-ops. Object.freeze is supported on every WebView platform we
      // target; defineProperty hardens the slot itself against reassignment.
      if (typeof Object.freeze === 'function') {
        Object.freeze(handle);
      }
      if (typeof Object.defineProperty === 'function') {
        Object.defineProperty(window, GLOBAL_KEY, {
          value: handle,
          writable: false,
          configurable: false,
          enumerable: false,
        });
      } else {
        window[GLOBAL_KEY] = handle;
      }
    } catch (error) {
      // Property may already be locked or defineProperty may be missing on
      // very old engines — fall back to a plain assignment.
      try {
        window[GLOBAL_KEY] = handle;
      } catch (innerError) {
        // no-op
      }
    }
  };

  var requestFrame = function (callback) {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(callback);
    }

    return window.setTimeout(function () {
      callback(Date.now());
    }, 16);
  };

  var cancelFrame = function (id) {
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(id);
      return;
    }

    clearTimeout(id);
  };

  var addCleanup = function (fn) {
    if (typeof fn === 'function') {
      state.cleanup.push(fn);
    }
  };

  var cleanupAll = function () {
    if (state.frame != null) {
      cancelFrame(state.frame);
      state.frame = null;
    }

    if (state.timer != null) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.fallbackTimer != null) {
      clearTimeout(state.fallbackTimer);
      state.fallbackTimer = null;
    }

    for (var index = 0; index < state.cleanup.length; index += 1) {
      try {
        var fn = state.cleanup[index];
        fn && fn();
      } catch (error) {
        // no-op
      }
    }

    state.cleanup.length = 0;
    state.mediaObserver = null;
    // Best-effort: leave the frozen handle in place when defineProperty made
    // it non-configurable. Subsequent re-injections see it and short-circuit.
    try {
      if (
        typeof Object.getOwnPropertyDescriptor === 'function' &&
        Object.getOwnPropertyDescriptor(window, GLOBAL_KEY) &&
        Object.getOwnPropertyDescriptor(window, GLOBAL_KEY).configurable
      ) {
        window[GLOBAL_KEY] = undefined;
      }
    } catch (error) {
      // no-op
    }
  };

  // Hoisted so cleanupAll above can reference it without TDZ issues; the body
  // simply forwards into closure-private state mutation.
  // (No-op placeholder — real definition lives below.)

  var addEvent = function (target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') {
      return function () {};
    }

    var removed = false;
    var wrapped = function (event) {
      handler(event);
    };

    try {
      target.addEventListener(type, wrapped, options);
    } catch (error) {
      target.addEventListener(type, wrapped);
    }

    var remove = function () {
      if (removed) {
        return;
      }

      removed = true;

      try {
        target.removeEventListener(type, wrapped, options);
      } catch (error) {
        target.removeEventListener(type, wrapped);
      }
    };

    addCleanup(remove);
    return remove;
  };

  // ============================================================
  // SECTION: Content classification
  // ============================================================
  var RENDERABLE_MEDIA_TAGS = {
    IMG: true,
    IFRAME: true,
    VIDEO: true,
    SVG: true,
    CANVAS: true,
    PICTURE: true,
    OBJECT: true,
    EMBED: true,
    AUDIO: true,
  };

  // Inert tags — never contribute to layout height. Skipped by the last-child
  // walk in measureHeight() so a trailing <script>/<style> never fools the
  // position-based probe into reporting 0.
  var INERT_TAGS = {
    SCRIPT: true,
    STYLE: true,
    META: true,
    LINK: true,
    TITLE: true,
    HEAD: true,
    NOSCRIPT: true,
  };

  // Out-of-flow positioning schemes: their bounding rects do NOT represent
  // the document's natural content extent (a sticky footer at viewport
  // bottom would inflate the height to viewport size; an absolutely
  // positioned element below the flow is already counted by scrollHeight).
  // We skip them in the last-child probe so the measurement stays accurate.
  var OUT_OF_FLOW_POSITIONS = {
    fixed: true,
    sticky: true,
    absolute: true,
  };

  var trackedMedia = new WeakSet();

  var markLoading = function () {
    state.pendingLoads += 1;
    state.bootstrapAt = Date.now();
    scheduleFallback();
  };

  var clearLoading = function () {
    if (state.pendingLoads > 0) {
      state.pendingLoads -= 1;
    }
  };

  // ============================================================
  // SECTION: Measurement
  // ============================================================

  /**
   * Multi-source height measurement — reads only, never mutates the DOM.
   *
   * Returns the maximum of:
   *   - body.scrollHeight / body.offsetHeight
   *   - documentElement.scrollHeight / documentElement.offsetHeight
   *   - lastInFlowChild.getBoundingClientRect().bottom + marginBottom
   *
   * The position-based probe catches cases where scrollHeight under-reports
   * (margin-collapse where the last child's bottom margin escapes \`<body>\`,
   * late image reflow, etc.). It is spec-correct on both iOS WKWebView and
   * Android WebView — \`getBoundingClientRect\` returns document-layout
   * coordinates, not viewport-clamped values.
   *
   * Complexity: O(k) where k is the number of trailing inert / out-of-flow
   * siblings (typically 0–2). Single layout flush per call.
   */
  var measureHeight = function () {
    var html = document.documentElement;
    var body = document.body;

    if (!body && !html) {
      return 0;
    }

    var height = 0;
    var bs = (body && body.scrollHeight) || 0;
    var bo = (body && body.offsetHeight) || 0;
    var hs = (html && html.scrollHeight) || 0;
    var ho = (html && html.offsetHeight) || 0;

    if (bs > height) height = bs;
    if (bo > height) height = bo;
    if (hs > height) height = hs;
    if (ho > height) height = ho;

    if (body) {
      var last = body.lastElementChild;
      // Walk past inert tags AND out-of-flow elements; only in-flow content
      // contributes to the document's natural bottom edge.
      while (last) {
        var tagName = (last.tagName || '').toUpperCase();
        if (INERT_TAGS[tagName]) {
          last = last.previousElementSibling;
          continue;
        }

        var position = '';
        if (typeof window.getComputedStyle === 'function') {
          try {
            var cs0 = window.getComputedStyle(last);
            position = (cs0 && cs0.position) || '';
          } catch (error) {
            position = '';
          }
        }

        if (OUT_OF_FLOW_POSITIONS[position]) {
          last = last.previousElementSibling;
          continue;
        }

        break;
      }

      if (last && typeof last.getBoundingClientRect === 'function') {
        try {
          var rect = last.getBoundingClientRect();
          var marginBottom = 0;
          if (typeof window.getComputedStyle === 'function') {
            var cs = window.getComputedStyle(last);
            marginBottom = parseFloat(cs && cs.marginBottom) || 0;
            if (!isFinite(marginBottom) || marginBottom < 0) {
              marginBottom = 0;
            }
          }
          var bottom = rect.bottom + marginBottom;
          if (isFinite(bottom) && bottom > height) {
            height = bottom;
          }
        } catch (error) {
          // no-op
        }
      }
    }

    if (!(height > 0)) {
      return 0;
    }

    return Math.ceil(height);
  };

  var postHeight = function (height) {
    if (!height || height <= 0) {
      return;
    }

    var sanitized = Math.ceil(height);

    if (!isFinite(sanitized) || sanitized <= 0) {
      return;
    }

    // Warm-up guard: on iOS 26 WKWebView the very first measurements can
    // collapse to 1px if the host container starts tiny. Skip those and let
    // the fallback timer re-measure; the real height is reported shortly.
    if (sanitized < WARMUP_MIN_HEIGHT && state.lastHeight === 0) {
      scheduleFallback();
      return;
    }

    if (sanitized > MAX_REASONABLE_HEIGHT) {
      state.anomalyCount += 1;

      if (state.anomalyCount <= 5) {
        scheduleMeasure(true);
        return;
      }

      if (state.lastHeight > 0 && state.lastHeight <= MAX_REASONABLE_HEIGHT) {
        sanitized = state.lastHeight;
      } else {
        sanitized = MAX_REASONABLE_HEIGHT;
      }
    } else {
      state.anomalyCount = 0;
    }

    if (state.lastHeight === sanitized) {
      return;
    }

    state.lastHeight = sanitized;

    try {
      var channel = window.ReactNativeWebView;
      if (channel && typeof channel.postMessage === 'function') {
        channel.postMessage(MESSAGE_PREFIX + String(sanitized));
      }
    } catch (error) {
      // no-op
    }
  };

  // ============================================================
  // SECTION: Scheduling
  // ============================================================
  var resetFallback = function () {
    state.fallbackDelay = INITIAL_FALLBACK_MS;
    if (state.fallbackTimer != null) {
      clearTimeout(state.fallbackTimer);
      state.fallbackTimer = null;
    }
    scheduleFallback();
  };

  /**
   * Bootstrap-grace + signal-driven adaptive fallback.
   *
   * Re-arms itself only while either is true:
   *   - state.pendingLoads > 0
   *   - Date.now() - state.bootstrapAt < BOOTSTRAP_GRACE_MS
   *
   * Steady-state CPU cost: zero. Reset by markLoading, state.refresh, font
   * loadingdone, and requestDebouncedMeasure — all of which extend the grace
   * window so slow CMS pages never "exhaust" the fallback prematurely.
   */
  var scheduleFallback = function () {
    if (state.fallbackTimer != null) {
      return;
    }

    var withinGrace =
      Date.now() - state.bootstrapAt < BOOTSTRAP_GRACE_MS;
    if (state.pendingLoads === 0 && !withinGrace) {
      return;
    }

    state.fallbackTimer = window.setTimeout(function () {
      state.fallbackTimer = null;
      scheduleMeasure(true);
      state.fallbackDelay = Math.min(
        MAX_FALLBACK_MS,
        Math.floor(state.fallbackDelay * 1.5)
      );
      scheduleFallback();
    }, state.fallbackDelay);
  };

  var runMeasure = function () {
    state.frame = null;
    var height = measureHeight();
    if (height) {
      postHeight(height);
    }
    resetFallback();
  };

  var scheduleMeasure = function (force) {
    if (force) {
      if (state.frame != null) {
        cancelFrame(state.frame);
        state.frame = null;
      }

      if (state.timer != null) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      runMeasure();
      return;
    }

    if (state.frame != null) {
      return;
    }

    state.frame = requestFrame(runMeasure);
  };

  var getDebounceDelay = function () {
    return state.pendingLoads > 0 ? ACTIVE_DEBOUNCE_MS : IDLE_DEBOUNCE_MS;
  };

  var debouncedMeasure = function () {
    scheduleMeasure(false);

    if (state.timer != null) {
      clearTimeout(state.timer);
    }

    state.timer = window.setTimeout(function () {
      state.timer = null;
      scheduleMeasure(true);
    }, getDebounceDelay());
  };

  var requestDebouncedMeasure = function () {
    state.bootstrapAt = Date.now();
    scheduleFallback();

    if (state.microtask) {
      return;
    }

    state.microtask = true;
    queueMicro(function () {
      state.microtask = false;
      debouncedMeasure();
    });
  };

  // ============================================================
  // SECTION: Media tracking
  // ============================================================
  var ensureMediaObserver = function () {
    if (state.mediaObserver || typeof ResizeObserver !== 'function') {
      return state.mediaObserver;
    }

    var observer = new ResizeObserver(function () {
      scheduleMeasure(true);
    });

    state.mediaObserver = observer;

    addCleanup(function () {
      observer.disconnect();
      state.mediaObserver = null;
    });

    return observer;
  };

  var tryTrackMedia = function (element) {
    if (!element || typeof element.tagName !== 'string') {
      return;
    }

    if (trackedMedia.has(element)) {
      return;
    }
    trackedMedia.add(element);

    var observer = ensureMediaObserver();
    if (observer) {
      try {
        observer.observe(element);
      } catch (error) {
        // no-op
      }
    }

    var tag = element.tagName.toUpperCase();

    if (tag === 'IMG') {
      if (element.complete && element.naturalHeight) {
        scheduleMeasure(true);
        return;
      }

      markLoading();

      var cleanupLoad = function () {};
      var cleanupError = function () {};

      var finalizeImage = once(function () {
        cleanupLoad();
        cleanupError();
        clearLoading();
        scheduleMeasure(true);
      });

      cleanupLoad = addEvent(element, 'load', finalizeImage, { once: true });
      cleanupError = addEvent(element, 'error', finalizeImage, { once: true });

      if (typeof element.decode === 'function') {
        element.decode().then(finalizeImage).catch(finalizeImage);
      }

      return;
    }

    if (tag === 'IFRAME') {
      markLoading();

      var cleanupLoadIframe = function () {};
      var cleanupErrorIframe = function () {};

      var onIframe = once(function () {
        cleanupLoadIframe();
        cleanupErrorIframe();
        clearLoading();
        scheduleMeasure(true);
      });

      cleanupLoadIframe = addEvent(element, 'load', onIframe, { once: true });
      cleanupErrorIframe = addEvent(element, 'error', onIframe, { once: true });

      try {
        var iframeDoc = element.contentDocument;
        if (iframeDoc && iframeDoc.readyState === 'complete') {
          scheduleMeasure(true);
          requestFrame(onIframe);
        }
      } catch (error) {
        // no-op
      }

      return;
    }

    if (tag === 'VIDEO') {
      if (
        typeof element.readyState === 'number' &&
        element.readyState >= 2
      ) {
        scheduleMeasure(true);
        return;
      }

      markLoading();

      var cleanupData = function () {};
      var cleanupMetadata = function () {};
      var cleanupEnded = function () {};

      var onVideo = once(function () {
        cleanupData();
        cleanupMetadata();
        cleanupEnded();
        clearLoading();
        scheduleMeasure(true);
      });

      cleanupData = addEvent(element, 'loadeddata', onVideo, { once: true });
      cleanupMetadata = addEvent(element, 'loadedmetadata', onVideo, {
        once: true,
      });
      cleanupEnded = addEvent(element, 'ended', onVideo, { once: true });

      return;
    }
  };

  var scanForMedia = function (root) {
    if (!root) {
      return;
    }

    if (root.nodeType === 1) {
      tryTrackMedia(root);
    }

    if (typeof root.querySelectorAll !== 'function') {
      return;
    }

    var nodes = root.querySelectorAll('img, video, iframe');
    for (var index = 0; index < nodes.length; index += 1) {
      tryTrackMedia(nodes[index]);
    }
  };

  // ============================================================
  // SECTION: Document setup
  // ============================================================
  var ensureDomReady = function (callback) {
    if (
      document.readyState === 'interactive' ||
      document.readyState === 'complete'
    ) {
      callback();
      return;
    }

    var handler = function () {
      if (
        document.readyState === 'interactive' ||
        document.readyState === 'complete'
      ) {
        document.removeEventListener('readystatechange', handler);
        window.removeEventListener('load', handler);
        callback();
      }
    };

    document.addEventListener('readystatechange', handler);
    window.addEventListener('load', handler);
  };

  // ============================================================
  // SECTION: Observers
  // ============================================================
  var observeMutations = function () {
    if (typeof window.MutationObserver !== 'function') {
      return;
    }

    var mutationObserver = new MutationObserver(function (mutations) {
      requestDebouncedMeasure();

      for (var index = 0; index < mutations.length; index += 1) {
        var mutation = mutations[index];
        if (!mutation || !mutation.addedNodes) {
          continue;
        }

        for (var nodeIndex = 0; nodeIndex < mutation.addedNodes.length; nodeIndex += 1) {
          var node = mutation.addedNodes[nodeIndex];
          if (node && node.nodeType === 1) {
            scanForMedia(node);
          }
        }
      }
    });

    var target = document.documentElement || document.body;
    if (!target) {
      return;
    }

    mutationObserver.observe(target, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });

    addCleanup(function () {
      mutationObserver.disconnect();
    });
  };

  var observeResize = function () {
    if (typeof window.ResizeObserver !== 'function') {
      return;
    }

    var resizeObserver = new ResizeObserver(function () {
      requestDebouncedMeasure();
    });

    // Observe both the body and the document element — either may be the
    // element whose height grows when content settles. ResizeObserver fires
    // a callback for each observed element so the bridge re-measures on
    // any genuine layout change.
    if (document.body) {
      try {
        resizeObserver.observe(document.body);
      } catch (error) {
        // no-op
      }
    }
    if (document.documentElement) {
      try {
        resizeObserver.observe(document.documentElement);
      } catch (error) {
        // no-op
      }
    }

    addCleanup(function () {
      resizeObserver.disconnect();
    });
  };

  var observeViewport = function () {
    var viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    var handler = function () {
      requestDebouncedMeasure();
    };

    addEvent(viewport, 'resize', handler);
    addEvent(viewport, 'scroll', handler);
  };

  var observeFonts = function () {
    var fonts = document.fonts;
    if (!fonts) {
      return;
    }

    var handler = function () {
      // Late web-font reflow extends content; refresh the bootstrap window so
      // the fallback timer keeps re-arming for another grace period even if
      // the page has otherwise stopped mutating.
      state.bootstrapAt = Date.now();
      scheduleMeasure(true);
    };

    if (typeof fonts.addEventListener === 'function') {
      addEvent(fonts, 'loadingdone', handler);
      addEvent(fonts, 'loadingerror', handler);
    }

    if (fonts.ready && typeof fonts.ready.then === 'function') {
      fonts.ready.then(handler).catch(handler);
    }
  };

  var observeGlobalEvents = function () {
    var handler = function () {
      scheduleMeasure(true);
    };

    var events = ['load', 'pageshow', 'orientationchange', 'resize'];
    for (var index = 0; index < events.length; index += 1) {
      addEvent(window, events[index], handler);
    }

    addEvent(document, 'DOMContentLoaded', handler);
    addEvent(document, 'readystatechange', handler);
  };

  var watchMessages = function () {
    addEvent(window, 'message', function (event) {
      if (!event || !event.data) {
        return;
      }
      // Only honour same-window dispatches. Cross-frame postMessage from
      // arbitrary origins must not be able to trigger work on the bridge —
      // the impact is small (an extra measure) but defence-in-depth keeps
      // the attack surface tight.
      if (event.source && event.source !== window) {
        return;
      }
      if (event.data === MESSAGE_KEY) {
        scheduleMeasure(true);
      }
    });
  };

  // ============================================================
  // SECTION: Bootstrap
  // ============================================================
  var bootstrap = function () {
    publishHandle();
    scanForMedia(document.body || document);
    observeMutations();
    observeResize();
    observeViewport();
    observeFonts();
    observeGlobalEvents();
    watchMessages();
    addEvent(window, 'unload', cleanupAll);

    state.bootstrapAt = Date.now();
    scheduleMeasure(true);
    scheduleFallback();
  };

  ensureDomReady(bootstrap);
})();`;
