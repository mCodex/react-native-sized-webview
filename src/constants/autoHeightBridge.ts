/**
 * JavaScript bridge injected into the WebView to compute and post its content height.
 * The script is designed to be idempotent and resilient to repeated injections.
 */
export const AUTO_HEIGHT_BRIDGE = `(() => {
  var GLOBAL_KEY = '__RN_SIZED_WEBVIEW__';
  var MESSAGE_KEY = '__AUTO_HEIGHT__';
  var ACTIVE_DEBOUNCE_MS = 48;
  var IDLE_DEBOUNCE_MS = 160;
  var INITIAL_FALLBACK_MS = 600;
  var MAX_FALLBACK_MS = 4000;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window[GLOBAL_KEY]) {
    try {
      window[GLOBAL_KEY].refresh();
    } catch (error) {
      // no-op
    }
    return;
  }

  var queueMicro =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : function (callback) {
          if (typeof Promise === 'function') {
            Promise.resolve().then(callback).catch(function () {});
            return;
          }

          setTimeout(callback, 0);
        };

  var state = {
    frame: null,
    timer: null,
    microtask: false,
    pendingLoads: 0,
    lastHeight: 0,
    fallbackTimer: null,
    fallbackDelay: INITIAL_FALLBACK_MS,
    cleanup: [],
  };

  window[GLOBAL_KEY] = state;

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
  };

  state.refresh = function () {
    scheduleMeasure(true);
  };

  state.destroy = cleanupAll;

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

  var scheduleTimeout = function (callback, delay) {
    var id = window.setTimeout(callback, delay);
    addCleanup(function () {
      clearTimeout(id);
    });
    return id;
  };

  var trackedMedia =
    typeof WeakSet === 'function' ? new WeakSet() : undefined;

  var markLoading = function () {
    state.pendingLoads += 1;
    scheduleFallback();
  };

  var clearLoading = function () {
    if (state.pendingLoads > 0) {
      state.pendingLoads -= 1;
    }
  };

  var readRectHeight = function (element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return 0;
    }

    var rect = element.getBoundingClientRect();
    return typeof rect.height === 'number' ? rect.height : 0;
  };

  var readMaxValue = function (values) {
    var max = 0;

    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      if (typeof value === 'number' && value > max) {
        max = value;
      }
    }

    return max;
  };

  var measureHeight = function () {
    var html = document.documentElement;
    var body = document.body;

    if (!html) {
      return 0;
    }

    var values = [
      readRectHeight(html),
      html.scrollHeight,
      html.offsetHeight,
      html.clientHeight,
      window.innerHeight || 0,
    ];

    var scroller = document.scrollingElement;
    if (scroller && scroller !== html && scroller !== body) {
      values.push(
        readRectHeight(scroller),
        scroller.scrollHeight,
        scroller.offsetHeight,
        scroller.clientHeight
      );
    }

    if (body && body !== html) {
      values.push(
        readRectHeight(body),
        body.scrollHeight,
        body.offsetHeight,
        body.clientHeight
      );
    }

    return Math.max(0, Math.ceil(readMaxValue(values)));
  };

  var postHeight = function (height) {
    if (!height || height <= 0) {
      return;
    }

    if (state.lastHeight === height) {
      return;
    }

    state.lastHeight = height;

    try {
      var channel = window.ReactNativeWebView;
      if (channel && typeof channel.postMessage === 'function') {
        channel.postMessage(String(height));
      }
    } catch (error) {
      // no-op
    }
  };

  var resetFallback = function () {
    state.fallbackDelay = INITIAL_FALLBACK_MS;
    if (state.fallbackTimer != null) {
      clearTimeout(state.fallbackTimer);
      state.fallbackTimer = null;
    }
    scheduleFallback();
  };

  var scheduleFallback = function () {
    if (state.fallbackTimer != null) {
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

  var tryTrackMedia = function (element) {
    if (!element || typeof element.tagName !== 'string') {
      return;
    }

    if (trackedMedia && trackedMedia.has(element)) {
      return;
    }

    if (trackedMedia) {
      trackedMedia.add(element);
    }

    var tag = element.tagName.toUpperCase();

    if (tag === 'IMG') {
      if (element.complete && element.naturalHeight) {
        requestFrame(function () {
          scheduleMeasure(true);
        });
        return;
      }

      markLoading();

      var cleanupLoad = function () {};
      var cleanupError = function () {};

      var onSettled = function () {
        cleanupLoad();
        cleanupError();
        clearLoading();
        scheduleMeasure(true);
      };

      cleanupLoad = addEvent(element, 'load', onSettled, { once: true });
      cleanupError = addEvent(element, 'error', onSettled, { once: true });

      return;
    }

    if (tag === 'IFRAME') {
      markLoading();

      var cleanupLoadIframe = function () {};
      var cleanupErrorIframe = function () {};

      var onIframe = function () {
        cleanupLoadIframe();
        cleanupErrorIframe();
        clearLoading();
        scheduleMeasure(true);
      };

      cleanupLoadIframe = addEvent(element, 'load', onIframe, { once: true });
      cleanupErrorIframe = addEvent(element, 'error', onIframe, { once: true });

      try {
        var iframeDoc = element.contentDocument;
        if (iframeDoc && iframeDoc.readyState === 'complete') {
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
        requestFrame(function () {
          scheduleMeasure(true);
        });
        return;
      }

      markLoading();

      var cleanupData = function () {};
      var cleanupMetadata = function () {};
      var cleanupEnded = function () {};

      var onVideo = function () {
        cleanupData();
        cleanupMetadata();
        cleanupEnded();
        clearLoading();
        scheduleMeasure(true);
      };

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

  var applyBaseStyles = function () {
    var html = document.documentElement;
    var body = document.body;

    if (html) {
      html.style.overflow = 'hidden';
      html.style.height = 'auto';
      if (!html.style.minHeight || html.style.minHeight === '0') {
        html.style.minHeight = '100%';
      }
      if (!html.style.backgroundColor) {
        html.style.backgroundColor = 'transparent';
      }
    }

    if (body) {
      if (!body.style.margin) {
        body.style.margin = '0';
      }
      body.style.width = '100%';
      body.style.height = 'auto';
      if (!body.style.minHeight || body.style.minHeight === '0') {
        body.style.minHeight = '100%';
      }
      if (!body.style.backgroundColor) {
        body.style.backgroundColor = 'transparent';
      }
    }
  };

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

    var html = document.documentElement;
    var body = document.body;

    if (html) {
      resizeObserver.observe(html);
    }

    if (body && body !== html) {
      resizeObserver.observe(body);
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

      if (event.data === MESSAGE_KEY) {
        scheduleMeasure(true);
      }
    });
  };

  var queueStabilization = function () {
    var delays = [32, 120, 240, 500, 1000, 2000, 3200];
    for (var index = 0; index < delays.length; index += 1) {
      (function (delay) {
        scheduleTimeout(function () {
          scheduleMeasure(true);
        }, delay);
      })(delays[index]);
    }
  };

  var bootstrap = function () {
    applyBaseStyles();
    scanForMedia(document);
    observeMutations();
    observeResize();
    observeViewport();
    observeFonts();
    observeGlobalEvents();
    watchMessages();
    queueStabilization();
    addEvent(window, 'unload', cleanupAll);

    scheduleMeasure(true);
    scheduleFallback();
  };

  ensureDomReady(bootstrap);
})();`;
