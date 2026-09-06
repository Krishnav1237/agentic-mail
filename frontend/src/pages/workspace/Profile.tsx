import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import {
  Avatar,
  Button,
  Panel,
  PageSection,
  Reveal,
  ShelfHeading,
  Stagger,
  WorkspacePage,
} from '../../components/workspace';
import {
  isPlausibleEmail,
  isValidDisplayName,
  NO_PROFILE_PHOTO,
  type ProfilePhoto,
} from '../../lib/userProfile';
import {
  changePassword,
  profileActions,
  sessionActions,
  useUserProfile,
} from '../../lib/userProfileStore';

/**
 * Profile — the Account/Auth surface, structurally the same page Settings
 * already establishes for configuration: `WorkspacePage`/`Stagger`/`Reveal`
 * for the shell, the same plain inline `<h1>` title (not the larger gradient
 * `PageHeader` Settings itself doesn't use either), `PageSection` +
 * `ShelfHeading` per section, embedded label+control rows inside a `Panel`.
 *
 * Every row groups its LABEL and VALUE as one unit on the left (so "Display
 * name" and "Alex Rivera" read as a single fact, not two things separated by
 * the width of the panel) and reserves the far right for the row's ACTION —
 * the same visual split Settings' own `SettingRow` uses between a label and
 * its control, just with the current value made visible next to the label
 * instead of only living inside the control.
 *
 * Reads and writes `userProfileStore` — never `SettingsStore`/`MailStore`.
 * Account identity is its own concern (see `lib/userProfile.ts`).
 */

const textInputStyle: CSSProperties = {
  height: 'calc(var(--ui-scale) * 32px)',
  width: '100%',
  minWidth: 0,
  maxWidth: 260,
  flex: '1 1 180px',
  borderRadius: 'calc(var(--ui-scale) * 8px)',
  border: '1px solid rgb(var(--ink) / 0.12)',
  background: 'rgb(var(--ink) / 0.03)',
  padding: '0 calc(var(--ui-scale) * 10px)',
  font: '400 calc(var(--ui-scale) * 12.5px) Inter, sans-serif',
  color: 'var(--text)',
};

const fieldLabelStyle: CSSProperties = {
  flex: 'none',
  font: '400 13px/1.3 Inter, sans-serif',
  color: 'var(--text-secondary)',
};

const valueTextStyle: CSSProperties = {
  minWidth: 0,
  font: '500 13px/1.4 Inter, sans-serif',
  color: 'var(--text-strong)',
  overflowWrap: 'anywhere',
};

const helperTextStyle: CSSProperties = {
  margin: '6px 0 0',
  font: '400 11.5px/1.5 Inter, sans-serif',
  color: 'var(--text-faint)',
};

/**
 * One Account/Security/Session row: LABEL + VALUE grouped together as a
 * single left-hand unit, ACTION(s) pinned to the right, and an optional
 * full-width NOTE line (an inline error, or "verification pending…") that
 * always drops below rather than fighting the label/value/action line for
 * space. Wraps onto two lines gracefully at narrow widths instead of
 * clipping or forcing desktop spacing.
 */
function Row({
  label,
  value,
  action,
  note,
  last = false,
}: {
  label: string;
  value?: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px 16px',
        minHeight: 46,
        padding: '10px 4px 10px 14px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
          flex: '1 1 240px',
        }}
      >
        <span style={fieldLabelStyle}>{label}</span>
        {value !== undefined && <span style={valueTextStyle}>{value}</span>}
      </div>
      {action && <div style={{ display: 'flex', gap: 8, flex: 'none' }}>{action}</div>}
      {note && <div style={{ flexBasis: '100%' }}>{note}</div>}
    </div>
  );
}

/* ------------------------------ Profile picture --------------------------- */

function ProfilePictureRow({ last = false }: { last?: boolean }) {
  const profile = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // `undefined` means "not editing" — kept distinct from `NO_PROFILE_PHOTO`
  // (an explicit, committed "no photo") so a not-yet-saved removal previews
  // correctly without touching the stored profile until Save.
  const [pendingPhoto, setPendingPhoto] = useState<ProfilePhoto | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const editing = pendingPhoto !== undefined;

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () =>
      setPendingPhoto({ kind: 'uploaded', dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!pendingPhoto) return;
    // `setUploadedPhoto`/`removePhoto` are the frontend-ready mutation seams
    // — see their doc comments for why this stays local data rather than a
    // real upload.
    if (pendingPhoto.kind === 'uploaded') {
      profileActions.setUploadedPhoto(pendingPhoto.dataUrl);
    } else {
      profileActions.removePhoto();
    }
    setPendingPhoto(undefined);
  };

  const cancel = () => {
    setPendingPhoto(undefined);
    setError(null);
  };

  const markForRemoval = () => {
    setError(null);
    setPendingPhoto(NO_PROFILE_PHOTO);
  };

  const previewPhoto = editing ? pendingPhoto : profile.profilePhoto;
  const hasCurrentPhoto = profile.profilePhoto.kind !== 'none';

  return (
    <>
      <Row
        label="Profile picture"
        last={last}
        value={<Avatar displayName={profile.displayName} photo={previewPhoto} size={44} />}
        action={
          editing ? (
            <>
              <Button variant="outline" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Change picture
              </Button>
              {hasCurrentPhoto && (
                <Button variant="outline" onClick={markForRemoval}>
                  Remove
                </Button>
              )}
            </>
          )
        }
        note={
          error ? (
            <span style={{ ...helperTextStyle, margin: 0, color: 'rgb(var(--coral) / 0.85)' }}>
              {error}
            </span>
          ) : undefined
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChosen}
        style={{ display: 'none' }}
      />
    </>
  );
}

/* ------------------------------- Display name ------------------------------ */

function DisplayNameRow({ last }: { last?: boolean }) {
  const profile = useUserProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.displayName);

  const startEdit = () => {
    setDraft(profile.displayName);
    setEditing(true);
  };

  const save = () => {
    if (!isValidDisplayName(draft)) return;
    profileActions.updateProfile({ displayName: draft.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <Row
        label="Display name"
        last={last}
        value={
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="Display name"
            autoFocus
            style={textInputStyle}
          />
        }
        action={
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={!isValidDisplayName(draft)}>
              Save
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Row
      label="Display name"
      last={last}
      value={profile.displayName}
      action={
        <Button variant="outline" onClick={startEdit}>
          Edit
        </Button>
      }
    />
  );
}

/* ---------------------------------- Email ---------------------------------- */

function EmailRow({ last }: { last?: boolean }) {
  const profile = useUserProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const pending = profile.emailChange.status === 'pending';

  const startChange = () => {
    setDraft('');
    setEditing(true);
  };

  const submit = () => {
    if (!isPlausibleEmail(draft)) return;
    // `profileActions.requestEmailChange` only records the pending step —
    // see its doc comment for why nothing here ever writes `email` directly.
    profileActions.requestEmailChange(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <Row
        label="Email address"
        last={last}
        value={
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="new@address.com"
            aria-label="New email address"
            autoFocus
            style={textInputStyle}
          />
        }
        action={
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!isPlausibleEmail(draft)}>
              Send verification
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Row
      label="Email address"
      last={last}
      value={profile.email}
      action={
        pending ? (
          <Button variant="outline" onClick={() => profileActions.cancelEmailChange()}>
            Cancel
          </Button>
        ) : (
          <Button variant="outline" onClick={startChange}>
            Change email
          </Button>
        )
      }
      note={
        pending ? (
          <span style={{ ...helperTextStyle, margin: 0 }}>
            Verification pending for {profile.emailChange.requestedEmail}
          </span>
        ) : undefined
      }
    />
  );
}

/* --------------------------------- Password --------------------------------- */

type PasswordFormState = { current: string; next: string; confirm: string };
const EMPTY_PASSWORD_FORM: PasswordFormState = { current: '', next: '', confirm: '' };

function PasswordRow() {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const canSubmit =
    form.current.length > 0 &&
    form.next.length > 0 &&
    form.next === form.confirm &&
    !submitting;

  const startEdit = () => {
    setForm(EMPTY_PASSWORD_FORM);
    setConfirmed(false);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setForm(EMPTY_PASSWORD_FORM);
  };

  const confirmedTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(confirmedTimeoutRef.current), []);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    // `changePassword` is the frontend interaction/form-state seam only —
    // no verification, hashing or auth happens here; see its doc comment.
    await changePassword(form.current, form.next);
    setSubmitting(false);
    setForm(EMPTY_PASSWORD_FORM);
    setEditing(false);
    setConfirmed(true);
    // A transient success note, not a permanent status — it describes the
    // action that just happened, not the account's current state, so it
    // clears itself rather than lingering as if "Password updated." were
    // true forever.
    clearTimeout(confirmedTimeoutRef.current);
    confirmedTimeoutRef.current = setTimeout(() => setConfirmed(false), 4000);
  };

  if (!editing) {
    return (
      <Row
        label="Password"
        last
        value="••••••••"
        action={
          <Button variant="outline" onClick={startEdit}>
            Change password
          </Button>
        }
        note={
          confirmed ? (
            <span style={{ ...helperTextStyle, margin: 0 }}>Password updated.</span>
          ) : undefined
        }
      />
    );
  }

  return (
    <div style={{ padding: '10px 4px 14px 14px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 180px) minmax(0, 1fr)',
          rowGap: 10,
          columnGap: 16,
          maxWidth: 420,
        }}
      >
        <label htmlFor="profile-current-password" style={fieldLabelStyle}>
          Current password
        </label>
        <input
          id="profile-current-password"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
          style={{ ...textInputStyle, minWidth: 0, maxWidth: 'none' }}
        />

        <label htmlFor="profile-new-password" style={fieldLabelStyle}>
          New password
        </label>
        <input
          id="profile-new-password"
          type="password"
          autoComplete="new-password"
          value={form.next}
          onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
          style={{ ...textInputStyle, minWidth: 0, maxWidth: 'none' }}
        />

        <label htmlFor="profile-confirm-password" style={fieldLabelStyle}>
          Confirm new password
        </label>
        <input
          id="profile-confirm-password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          style={{ ...textInputStyle, minWidth: 0, maxWidth: 'none' }}
        />
      </div>

      {form.confirm.length > 0 && form.next !== form.confirm && (
        <p style={{ ...helperTextStyle, color: 'rgb(var(--coral) / 0.85)' }}>
          New password and confirmation don't match.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button variant="outline" onClick={cancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!canSubmit}>
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------- */

export default function Profile() {
  const profile = useUserProfile();

  const handleSignOut = () => {
    // The frontend interaction/navigation seam only — see
    // `sessionActions.signOut` for why real session invalidation stays
    // out of scope here. A hard navigation, not router `navigate()`, is
    // deliberate — see the identical note in `AccountMenu.tsx`'s own
    // `handleSignOut`: it's what actually clears in-memory mail/drafts/
    // workflow state, which an SPA route change would leave live.
    sessionActions.signOut();
    window.location.assign('/');
  };

  return (
    <WorkspacePage scale={1.1}>
      <Stagger style={{ display: 'flex', flexDirection: 'column' }}>
        <Reveal>
          <h1
            style={{
              margin: 0,
              font: 'var(--type-page-title)',
              letterSpacing: '-0px',
              color: 'var(--text-strong)',
            }}
          >
            Profile
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              font: '400 13.5px/1.6 Inter, sans-serif',
              color: 'var(--text-secondary)',
            }}
          >
            Manage your account and profile information.
          </p>

          {/* Identity anchor — who this page is about, at a glance. A
              summary only: it never carries its own edit controls, which
              stay exactly where they already lived, in ACCOUNT below. Same
              "state feeds a summary, summary never becomes a second source
              of truth" relationship Settings' own "Current Behavior" block
              has to the sections beneath it. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 24,
            }}
          >
            <Avatar displayName={profile.displayName} photo={profile.profilePhoto} size={48} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  font: '600 16px/1.3 Inter, sans-serif',
                  color: 'var(--text-strong)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {profile.displayName}
              </div>
              <div
                style={{
                  marginTop: 2,
                  font: '400 12.5px/1.4 Inter, sans-serif',
                  color: 'var(--text-secondary)',
                  overflowWrap: 'anywhere',
                }}
              >
                {profile.email}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <PageSection heading={<ShelfHeading>Account</ShelfHeading>} style={{ marginTop: 28 }}>
            <Panel padding={6}>
              <ProfilePictureRow />
              <DisplayNameRow />
              <EmailRow last />
            </Panel>
          </PageSection>
        </Reveal>

        <Reveal>
          <PageSection heading={<ShelfHeading>Security</ShelfHeading>} style={{ marginTop: 28 }}>
            <Panel padding={6}>
              <PasswordRow />
            </Panel>
          </PageSection>
        </Reveal>

        <Reveal>
          <PageSection heading={<ShelfHeading>Session</ShelfHeading>} style={{ marginTop: 28 }}>
            <Panel padding={6}>
              <Row
                label="Current session"
                last
                value={profile.email}
                action={
                  <Button variant="danger" onClick={handleSignOut}>
                    <LogOut size={13} strokeWidth={2} aria-hidden />
                    Sign out
                  </Button>
                }
              />
            </Panel>
          </PageSection>
        </Reveal>
      </Stagger>
    </WorkspacePage>
  );
}
