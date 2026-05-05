/**
 * Local HTML payload that pulls a Google Font (`Lobster`) over the network
 * before the body becomes typographically stable. The WebView will hang for a
 * few hundred milliseconds while the `@font-face` resource downloads — once
 * the `FontFaceSet`'s `loadingdone` event fires, the bridge re-measures the
 * document and the container resolves to its final height.
 *
 * This demo proves the bootstrap-grace fallback strategy: even though the
 * initial paint reports a smaller `scrollHeight`, the measurement is rerun
 * after font swap so the committed height stays accurate.
 */
export const GOOGLE_FONT_HTML = `
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Lobster&family=Inter:wght@400;600&display=swap');

      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        padding: 20px;
        margin: 0;
        color: #0f172a;
        background: linear-gradient(180deg, #fefce8 0%, #fff7ed 100%);
      }
      .display {
        font-family: 'Lobster', cursive;
        font-size: 44px;
        line-height: 1.1;
        margin: 0 0 12px;
        color: #b45309;
      }
      .lead {
        font-size: 17px;
        line-height: 1.55;
      }
      .swatch {
        margin-top: 20px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(180, 83, 9, 0.2);
        border-radius: 10px;
      }
      .swatch h2 {
        font-family: 'Lobster', cursive;
        font-size: 26px;
        margin: 0 0 6px;
        color: #92400e;
      }
      .swatch p {
        margin: 0;
        font-size: 14px;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <h1 class="display">Hello, Lobster</h1>
    <p class="lead">
      This page imports the <strong>Lobster</strong> Google Font over the network.
      The WebView hangs briefly while the font downloads, then the bridge
      re-measures and the container snaps to the final height — no clipping.
    </p>
    <div class="swatch">
      <h2>Why this works</h2>
      <p>
        The injected bridge listens to <code>document.fonts</code>'
        <code>loadingdone</code> event and refreshes the bootstrap window so
        the adaptive fallback keeps probing until the layout settles.
      </p>
    </div>
  </body>
</html>
`;
