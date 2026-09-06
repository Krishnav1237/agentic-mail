/**
 * What a message's CONTENT is made of: its body, and anything attached to it.
 *
 * Split out from the record types in `workspaceData.ts` because both concerns
 * cross a trust boundary that the rest of the mail model doesn't. A subject
 * line is a string. A body may be attacker-authored HTML, and an attachment
 * is a file someone else chose the name and type of. Naming that boundary in
 * one place is what keeps it from being re-decided per component.
 */

/* --------------------------------- Body ---------------------------------- */

/**
 * HTML that has ALREADY been sanitized, by the party that owns sanitization.
 *
 * The brand is the point. A plain `string` cannot be assigned to this type, so
 * the only way to render HTML through {@link MailBody} is to call
 * {@link sanitizedHtmlFromBackend} explicitly — which is a written assertion,
 * greppable in one search, rather than a `dangerouslySetInnerHTML` somewhere
 * in a component nobody re-reads.
 *
 * SANITIZATION IS NOT DONE HERE, AND DELIBERATELY SO. Stripping scripts,
 * event handlers, `javascript:` URLs, remote-image beacons and CSS exfiltration
 * out of real email is a job for a hardened, well-maintained sanitizer running
 * where the mail is fetched — not a regex in a React app that an attacker can
 * read. This module records WHO is responsible; it does not pretend to be
 * them.
 */
export type SanitizedHtml = string & { readonly __sanitized: unique symbol };

/**
 * Asserts that `html` has been sanitized by the backend, and hands back the
 * branded value {@link MailBody} will render.
 *
 * Call this at the boundary where backend data enters the app — the mail
 * adapter — and nowhere else. Every call is a claim that the producer
 * sanitized this string; if that claim is ever untrue for a given source, the
 * fix belongs at that source, not at the render site.
 *
 * INTENTIONALLY UNUSED TODAY. No current data source produces HTML: every
 * demo message is plain text, so nothing in the app calls this yet. It exists
 * so that when a real provider payload arrives there is one obvious place to
 * attach it, instead of a component reaching for `dangerouslySetInnerHTML`
 * under deadline.
 */
export function sanitizedHtmlFromBackend(html: string): SanitizedHtml {
  return html as SanitizedHtml;
}

/**
 * A message body in whichever representations are available.
 *
 * Real mail is routinely multipart: an HTML part and a plain-text fallback,
 * either of which can be absent. Modelling both means the renderer picks
 * rather than the data source having to decide, and means a text-only message
 * (every message in the current demo set) needs no HTML at all.
 *
 * `text` stays required: it is what search, previews, snippets and
 * accessibility read, and it is the fallback when HTML is missing or a client
 * declines to render it.
 */
export type MailBodyContent = {
  /** Plain text. Always present — previews and search read this. */
  text: string;
  /** Backend-sanitized HTML, when the source had an HTML part. */
  html?: SanitizedHtml;
};

/** Normalizes the two shapes a body can be authored in. A bare string is
 * plain text — the form every current demo message uses. */
export function toBodyContent(body: string | MailBodyContent): MailBodyContent {
  return typeof body === 'string' ? { text: body } : body;
}

/* ------------------------------ Attachments -------------------------------
 *
 * TWO STATES OF ONE THING, and the transition between them is the contract.
 *
 *   user picks a file
 *        ↓  localAttachmentFromFile()
 *   LocalAttachment          bytes live in this tab, nowhere else
 *        ↓  upload, at draft-save or at send — BACKEND, NOT BUILT
 *   StoredAttachment         backend holds the bytes and names the handle
 *        ↓
 *   the draft/message references the stored one, and survives a reload
 *
 * WHAT MAKES THAT TRANSITION A NON-EVENT FOR THIS FRONTEND: every surface that
 * carries an attachment already carries the `Attachment` union, not one arm of
 * it — the composer's state, `ComposerPayload`, `OutgoingInput`, `DraftRow`
 * and `OutgoingRow` all do. So an upload step turns into rewriting the
 * elements of one array in place, and no component, prop or store shape
 * changes. There is exactly ONE place in the app that discriminates on `kind`
 * (`outgoingRowToThreadMessage`, which filters the read side down to `stored`)
 * and it is already correct for the post-upload world.
 *
 * UNTIL THEN, LOCAL MEANS LOCAL. A picked file does not survive a reload, and
 * nothing here pretends otherwise: no base64 in localStorage, no object URL
 * kept past its document, no fabricated download link. That limit is not
 * currently visible to the user because the drafts holding these files don't
 * survive a reload either — the whole store is in-memory. When drafts become
 * durable (`GET /drafts`) and attachments do not, THAT is the point at which
 * the difference starts being something the reader has to be told about.
 */

/** Fields every attachment has, whoever currently holds the bytes. */
type AttachmentBase = {
  id: string;
  /** As supplied by the sender/user. Display only — never used as a path. */
  name: string;
  /** Bytes. Rendered via `formatBytes`. */
  size: number;
  /** As declared by the source. A CLAIM, not a verified fact: the backend is
   * responsible for checking that content matches the declared type before
   * anything is ever served back. */
  mimeType: string;
};

/**
 * A file the user has picked but no server has accepted yet.
 *
 * Holds a live `File`, which is why it can never be part of a backend
 * payload: `File` isn't serialisable, doesn't survive a reload, and means
 * nothing to another device. Anything that persists an attachment has to
 * upload it first and store a {@link StoredAttachment} instead.
 */
export type LocalAttachment = AttachmentBase & {
  kind: 'local';
  file: File;
};

/**
 * An attachment the backend owns, identified by whatever handle it returns.
 *
 * `id` IS THE SERVER'S, not the local one. A {@link LocalAttachment}'s id is
 * derived from the file's own name/size/mtime — a de-duplication key for the
 * composer, never an identifier anything else should trust. The upload
 * response names the file; the frontend adopts that name and stops using its
 * own. Same shape of assumption as `DraftRow.id`: the client's identifier is a
 * placeholder, and the server's replaces it.
 *
 * `url` is optional and NOTHING IN THIS APP EVER SETS IT. A fabricated URL
 * would be a link to a file that doesn't exist, and the shape of the real one
 * (signed, expiring, scoped to a session) is a backend decision that hasn't
 * been made. It's declared so the download affordance has somewhere to read
 * from once it has been.
 */
export type StoredAttachment = AttachmentBase & {
  kind: 'stored';
  url?: string;
};

export type Attachment = LocalAttachment | StoredAttachment;

/** Human-readable size, shared by every surface that lists an attachment. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Turns a picked `File` into a local attachment. The id is derived from the
 * file's own identity so re-picking the same file twice doesn't produce two
 * entries — it is a DE-DUPLICATION KEY FOR THIS COMPOSER, not an identifier
 * anything downstream should hold onto; the upload response supplies the real
 * one (see {@link StoredAttachment}). */
export function localAttachmentFromFile(file: File): LocalAttachment {
  return {
    kind: 'local',
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    file,
  };
}
