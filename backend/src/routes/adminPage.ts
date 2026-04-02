export const renderAdminPage = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inbox Intelligence Layer Admin</title>
    <style>
      :root {
        color-scheme: dark;
        font-family:
          "Segoe UI",
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(80, 80, 80, 0.25), transparent 40%),
          #050505;
        color: #f5f5f5;
      }

      main {
        width: min(720px, calc(100vw - 32px));
        padding: 32px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(18px);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      }

      .eyebrow {
        display: inline-block;
        margin-bottom: 12px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.72);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(32px, 6vw, 52px);
        line-height: 1.05;
        letter-spacing: -0.04em;
      }

      p {
        margin: 16px 0 0;
        max-width: 60ch;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.7;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 28px;
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transition:
          transform 120ms ease,
          opacity 120ms ease,
          background 120ms ease;
      }

      a:hover {
        transform: translateY(-1px);
      }

      .primary {
        background: #ffffff;
        color: #050505;
      }

      .secondary {
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.04);
        color: #f5f5f5;
      }

      .meta {
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 14px;
        color: rgba(255, 255, 255, 0.56);
      }
    </style>
  </head>
  <body>
    <main>
      <span class="eyebrow">Hidden Admin Entry</span>
      <h1>Inbox Intelligence Layer backend admin</h1>
      <p>
        Use this page to validate backend connectivity and kick off OAuth during
        testing. Google sign-in still runs through the configured callback flow
        and will land in the frontend app after authorization succeeds.
      </p>
      <div class="actions">
        <a class="primary" href="/auth/google">Connect Google</a>
        <a class="secondary" href="/auth/microsoft">Connect Outlook</a>
        <a class="secondary" href="/auth/session">Check Session JSON</a>
        <a class="secondary" href="/health">Health Check</a>
      </div>
      <div class="meta">
        If the hidden shortcut is working, typing <strong>admin</strong> in the
        frontend should open this page directly.
      </div>
    </main>
  </body>
</html>
`;
