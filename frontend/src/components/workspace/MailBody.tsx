/**
 * THE mail-body renderer. Every received message on every surface goes
 * through this one component.
 *
 * It exists so that the decision "how do we put someone else's email on the
 * screen" is made once, in a file whose whole purpose is that decision,
 * rather than by whichever component happened to need to show a body. That
 * matters more than the usual DRY argument: a body is the most
 * attacker-influenced string in the product, and the failure mode of getting
 * it wrong in one forgotten place is script execution, not a layout bug.
 *
 * TWO REPRESENTATIONS, ONE RULE. Real mail is multipart — an HTML part and a
 * plain-text fallback, either of which can be missing. This renders the HTML
 * when there is HTML and the text when there isn't, and the caller never
 * branches. Every message in the current demo set is text-only, so today this
 * always takes the text path and looks exactly as it did before.
 *
 * HTML IS ONLY RENDERED IF IT IS TYPED AS SANITIZED. `SanitizedHtml` is a
 * branded type (see `lib/mailContent.ts`): a plain string will not compile
 * here. The only way to produce one is `sanitizedHtmlFromBackend`, which is a
 * deliberate, greppable assertion made at the data boundary. So there is
 * exactly one `dangerouslySetInnerHTML` for inbound mail in the app, and it
 * is unreachable without someone having explicitly claimed responsibility for
 * the string first.
 *
 * The sanitizer itself is NOT here and should not be added here — see
 * `SanitizedHtml`'s own note for why that belongs where the mail is fetched.
 */
import type { CSSProperties } from 'react';
import type { MailBodyContent } from '../../lib/mailContent';

export function MailBody({
  body,
  style,
}: {
  body: MailBodyContent;
  /** Typography/measure from the calling surface — the thread's current
   * message and its collapsed history use the same renderer at different
   * sizes. */
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    // The shared mail reading measure, not a literal — see `--measure-mail`
    // in index.css. The body, Obligo's insight and the suggested reply's
    // preview are the three surfaces that make up a read email, and they
    // have to agree on their width; three separate `62ch` literals is how
    // they previously agreed by coincidence rather than by construction.
    maxWidth: 'var(--measure-mail)',
    font: '400 13px/1.75 Inter, sans-serif',
    color: 'var(--text-secondary)',
    margin: '8px 0 0',
    ...style,
  };

  if (body.html) {
    return (
      <div
        className="obligo-mail-body"
        style={base}
        // Safe by type, not by inspection: see this file's header. `body.html`
        // is `SanitizedHtml`, which cannot be constructed from a raw string
        // without an explicit assertion at the data boundary.
        dangerouslySetInnerHTML={{ __html: body.html }}
      />
    );
  }

  return (
    <p
      className="obligo-mail-body"
      style={{
        ...base,
        // A real email is frequently more than one paragraph (adapters join
        // them with blank lines) — without this, HTML's default whitespace
        // collapsing runs every paragraph together as one sentence.
        whiteSpace: 'pre-line',
      }}
    >
      {body.text}
    </p>
  );
}
