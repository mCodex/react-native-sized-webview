/**
 * JavaScript bridge injected into the WebView to compute and post its content height.
 * The script is designed to be idempotent and resilient to repeated injections.
 */
export const AUTO_HEIGHT_BRIDGE = `(() => {
  if (window.__AUTO_HEIGHT_INITIALIZED__) {
    return;
  }

  window.__AUTO_HEIGHT_INITIALIZED__ = true;
  const messageKey = '__AUTO_HEIGHT__';
  const DEBOUNCE_DELAY_MS = 80;

  const ensureArray = (maybeIterable) => {
    if (!maybeIterable) {
      return [];
    }

    return Array.isArray(maybeIterable) ? maybeIterable : [maybeIterable];
  };

  const readObserverBlockSize = (entry) => {
    if (!entry) {
      return 0;
    }

    const borderSize = ensureArray(entry.borderBoxSize);
    for (let index = 0; index < borderSize.length; index += 1) {
      const size = borderSize[index];
      if (size && typeof size.blockSize === 'number') {
        return size.blockSize;
      }
    }

    const contentSize = ensureArray(entry.contentBoxSize);
    for (let index = 0; index < contentSize.length; index += 1) {
      const size = contentSize[index];
      if (size && typeof size.blockSize === 'number') {
        return size.blockSize;
      }
    }

    if (entry.contentRect && typeof entry.contentRect.height === 'number') {
      return entry.contentRect.height;
    }

    return 0;
  };

  const measureDocumentHeight = () => {
    const html = document.documentElement;
    const body = document.body;
    const isAndroid = navigator.userAgent.includes('Android');

    // Ensure body has proper styling for measurement
    if (body) {
      body.style.height = 'auto';
      body.style.minHeight = '100%';
      body.style.width = '100%';
    }

    if (html) {
      html.style.height = 'auto';
    }

    // Force layout recalculation
    const forceLayout = html.offsetHeight || body.offsetHeight;

    // Use getBoundingClientRect for more accurate measurement
    const htmlRect = html.getBoundingClientRect();
    const bodyRect = body ? body.getBoundingClientRect() : { height: 0 };

    if (isAndroid) {
      // On Android, prefer getBoundingClientRect for better accuracy
      return Math.max(htmlRect.height, bodyRect.height);
    }

    return Math.max(
      htmlRect.height,
      bodyRect.height,
      html.scrollHeight,
      html.offsetHeight,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0
    );
  };

  const postHeight = (rawHeight) => {
    if (!rawHeight || rawHeight <= 0) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const adjustedHeight = Math.ceil(rawHeight / pixelRatio);

    if (window.__AUTO_HEIGHT_LAST__ === adjustedHeight) {
      return;
    }

    window.__AUTO_HEIGHT_LAST__ = adjustedHeight;

    try {
      window.ReactNativeWebView?.postMessage(String(adjustedHeight));
    } catch (error) {
      // no-op
    }
  };

  const updateHeightFromDocument = () => {
    const measured = measureDocumentHeight();

    if (measured) {
      postHeight(measured);
    }
  };

  const runHeightUpdate = () => {
    if (window.__AUTO_HEIGHT_RAF__) {
      cancelAnimationFrame(window.__AUTO_HEIGHT_RAF__);
    }

    window.__AUTO_HEIGHT_RAF__ = requestAnimationFrame(() => {
      window.__AUTO_HEIGHT_RAF__ = undefined;
      updateHeightFromDocument();
    });
  };

  const scheduleHeightUpdate = () => {
    if (!window.__AUTO_HEIGHT_PENDING__) {
      window.__AUTO_HEIGHT_PENDING__ = true;
      runHeightUpdate();
    }

    if (window.__AUTO_HEIGHT_TIMEOUT__) {
      clearTimeout(window.__AUTO_HEIGHT_TIMEOUT__);
    }

    window.__AUTO_HEIGHT_TIMEOUT__ = setTimeout(() => {
      window.__AUTO_HEIGHT_TIMEOUT__ = undefined;
      window.__AUTO_HEIGHT_PENDING__ = false;
      runHeightUpdate();
    }, DEBOUNCE_DELAY_MS);
  };

  const applyBaseStyles = () => {
    const html = document.documentElement;
    if (html) {
      html.style.overflow = 'hidden';
      html.style.backgroundColor = 'transparent';
      html.style.height = 'auto';
    }

    const body = document.body;
    if (body) {
      body.style.backgroundColor = 'transparent';
      body.style.margin = '0';
      body.style.width = '100%';
      body.style.height = 'auto';
      body.style.minHeight = '100%';
    }
  };

  const attachMutationObserver = () => {
    if (!window.MutationObserver) {
      return;
    }

    const target = document.body || document.documentElement;
    if (!target) {
      requestAnimationFrame(attachMutationObserver);
      return;
    }

    applyBaseStyles();

    const mutationObserver = new MutationObserver(scheduleHeightUpdate);
    mutationObserver.observe(target, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.__AUTO_HEIGHT_MUTATION_OBSERVER__ = mutationObserver;
  };

  const attachResizeObserver = () => {
    if (!window.ResizeObserver) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      let observedHeight = 0;

      if (entries && entries.length) {
        for (let index = 0; index < entries.length; index += 1) {
          observedHeight = Math.max(
            observedHeight,
            Math.ceil(readObserverBlockSize(entries[index])),
          );
        }
      }

      if (observedHeight) {
        postHeight(observedHeight);
      }

      scheduleHeightUpdate();
    });

    const html = document.documentElement;
    const body = document.body;

    if (html) {
      resizeObserver.observe(html);
    }

    if (body && body !== html) {
      resizeObserver.observe(body);
    }

    window.__AUTO_HEIGHT_RESIZE_OBSERVER__ = resizeObserver;
  };

  const attachVisualViewport = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const handler = () => scheduleHeightUpdate();
    viewport.addEventListener('resize', handler);
    viewport.addEventListener('scroll', handler);
    window.__AUTO_HEIGHT_VISUAL_VIEWPORT_HANDLER__ = handler;
  };

  const attachIframeLoadListeners = () => {
    const iframes = document.querySelectorAll('iframe');
    if (!iframes.length) {
      return;
    }

    const handler = () => scheduleHeightUpdate();
    for (let index = 0; index < iframes.length; index += 1) {
      iframes[index].addEventListener('load', handler);
    }
  };

  const attachGlobalListeners = () => {
    const events = [
      'load',
      'pageshow',
      'orientationchange',
      'resize',
      'DOMContentLoaded',
    ];

    for (let index = 0; index < events.length; index += 1) {
      window.addEventListener(events[index], scheduleHeightUpdate);
    }

    document.addEventListener('readystatechange', scheduleHeightUpdate);
  };

  const bootstrap = () => {
    applyBaseStyles();
    attachMutationObserver();
    attachResizeObserver();
    attachVisualViewport();
    attachFontLoadListeners();
    attachImageLoadListeners();
    attachIframeLoadListeners();
    attachGlobalListeners();
    scheduleHeightUpdate();

    const timeouts = [16, 60, 180, 500, 1000, 2000, 3000, 5000];
    for (let index = 0; index < timeouts.length; index += 1) {
      setTimeout(scheduleHeightUpdate, timeouts[index]);
    }
  };

  window.addEventListener('message', (event) => {
    if (!event || !event.data) {
      return;
    }

    if (event.data === messageKey) {
      scheduleHeightUpdate();
    }
  });

  bootstrap();
})();`;
