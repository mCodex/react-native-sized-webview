/**
 * Static HTML samples used by the in-app demos. Kept as plain strings so the
 * Metro bundler can inline them without any extra asset plumbing.
 */

const BASE_STYLE = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 16px;
    margin: 0;
    color: #0f172a;
  }
  h1 { font-size: 28px; margin-bottom: 12px; }
  h2 { font-size: 22px; margin: 24px 0 8px; }
  p { font-size: 16px; line-height: 1.52; }
  ul { padding-left: 22px; }
  code {
    background: rgba(0,0,0,0.05);
    padding: 2px 4px;
    border-radius: 4px;
  }
`;

export const MARKDOWN_SAMPLE = `
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${BASE_STYLE}</style>
  </head>
  <body>
    <h1>Auto-sized WebView</h1>
    <p>
      This <code>SizedWebView</code> expands to match the height of its HTML content, meaning
      your outer <code>ScrollView</code> stays in full control of the scrolling behaviour.
    </p>
    <p>
      Try toggling the switch below to view an extended version of the article. The WebView will
      recalculate its intrinsic height on the fly without flicker or layout jumps.
    </p>
  </body>
</html>
`;

export const EXTENDED_SECTION = `
  <section>
    <h2>When should you use it?</h2>
    <ul>
      <li>Rendering CMS-driven content without fixed dimensions;</li>
      <li>Embedding FAQ or policy pages in your native app;</li>
      <li>Displaying components generated on the fly, such as charts.</li>
    </ul>
    <p>
      The component listens to mutations and resizes using <em>requestAnimationFrame</em> to avoid
      blocking the main thread.
    </p>
  </section>
`;

/**
 * Composes the markdown sample optionally including the extended section.
 * Pure function — safe to call inside a `useMemo` selector.
 */
export const buildMarkdownSource = (extended: boolean): string =>
  extended
    ? MARKDOWN_SAMPLE.replace('</body>', `${EXTENDED_SECTION}</body>`)
    : MARKDOWN_SAMPLE;

/**
 * CMS-style long article that mirrors the production payload that historically
 * tripped the v1.1 measurement algorithm (deeply-nested figures, late image
 * reflow, generous trailing whitespace). Rendering this through `SizedWebView`
 * is the canonical regression test for the multi-source measurement strategy.
 */
export const LONG_ARTICLE = `
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      ${BASE_STYLE}
      figure { margin: 16px 0; }
      figure img {
        width: 100%;
        height: auto;
        border-radius: 8px;
        display: block;
      }
      figcaption {
        font-size: 13px;
        color: #64748b;
        margin-top: 6px;
        text-align: center;
      }
      blockquote {
        border-left: 3px solid #2563eb;
        padding: 4px 0 4px 12px;
        margin: 16px 0;
        color: #1e293b;
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <h1>The Long Read</h1>
    <p>
      This article reproduces the layout shape of a typical headless-CMS payload:
      mixed prose, lazy-loaded imagery and trailing footnotes. The bridge measures
      the <em>maximum</em> of <code>scrollHeight</code>, <code>offsetHeight</code> and the
      bottom of the last non-inert child via <code>getBoundingClientRect()</code>, so the
      container resolves to the correct height even when the page settles late.
    </p>
    <figure>
      <img
        src="https://picsum.photos/id/1015/1200/600"
        alt="Mountain landscape"
        loading="lazy"
      />
      <figcaption>Lazy-loaded hero image — extends the page height after first paint.</figcaption>
    </figure>
    <h2>Body</h2>
    <p>
      Editorial content frequently triggers post-load reflows: web fonts arrive late,
      embedded media decodes asynchronously, and ad slots inject content that pushes
      the document down by hundreds of pixels. Single-source measurement (e.g.
      <code>document.body.scrollHeight</code> alone) misses these tail-end deltas.
    </p>
    <p>
      With multi-source probing the bridge always resolves to the largest plausible
      height, while the bootstrap-grace fallback timer keeps re-arming for a few
      seconds after every signal so slow networks never starve the measurement.
    </p>
    <figure>
      <img
        src="https://picsum.photos/id/1025/1200/700"
        alt="Forest"
        loading="lazy"
      />
      <figcaption>Second figure — exercises the trailing-margin code path.</figcaption>
    </figure>
    <blockquote>
      The wrapper div has no explicit height and no <code>overflow: hidden</code>, so the
      injected script never clamps the document to the native viewport.
    </blockquote>
    <h2>Footnotes</h2>
    <ul>
      <li>iOS WKWebView reports <code>scrollHeight</code> in CSS pixels.</li>
      <li>Android WebView batches resize callbacks every 100&nbsp;ms by default.</li>
      <li>Both honour the CSSOM View spec for <code>getBoundingClientRect</code>.</li>
    </ul>
    <p style="margin-bottom: 32px;">
      End of article — the trailing margin below this paragraph is included in the
      committed height thanks to the <code>computedMarginBottom</code> probe.
    </p>
  </body>
</html>
`;
