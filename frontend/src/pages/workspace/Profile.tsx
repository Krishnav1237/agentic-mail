import { useState, type CSSProperties, type ReactNode } from 'react';
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
import { isValidDisplayName } from '../../lib/userProfile';
import {
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

/**
 * Read-only for now, and honestly labelled as such.
 *
 * This row used to run a full local edit flow: pick a file, preview it as a
 * data URL, Save. None of it can persist. `PUT /profile` rejects
 * `{kind:'uploaded'}` outright because no image storage exists behind it, so
 * the control would have failed every time it was used.
 *
 * Removal is withheld for a subtler reason rather than a technical one:
 * `{kind:'none'}` IS writable, but with uploads unavailable and the Google
 * picture only re-applied at login to a photo that is already `provider`,
 * removing one is a door that doesn't open again. A control that works once
 * and then strands the user is worse than one that plainly isn't ready.
 */
function ProfilePictureRow({ last = false }: { last?: boolean }) {
  const profile = useUserProfile();

  return (
    <Row
      label="Profile picture"
      last={last}
      value={
        <Avatar displayName={profile.displayName} photo={profile.profilePhoto} size={44} />
      }
      note={
        <span style={{ ...helperTextStyle, margin: 0 }}>
          {profile.profilePhoto.kind === 'provider'
            ? 'Your picture comes from your Google account. Changing it here isn’t available yet.'
            : 'Custom profile pictures aren’t available yet — your picture comes from your Google account.'}
        </span>
      }
    />
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

/**
 * Read-only, and honestly labelled.
 *
 * This row modelled a current → new → verification-pending flow that nothing
 * has ever backed. It cannot be backed yet either: `PUT /profile` rejects
 * `emailChange` outright, and a real flow needs a verification-token table and
 * outbound email, neither of which exists. More fundamentally, the address is
 * the Google account's — auth is Google-OAuth-only and `users.email` is
 * re-read from Google at every login — so changing it here would be undone by
 * the next sign-in even if it did persist.
 *
 * The pending-state rendering is gone with the control, since `GET /profile`
 * always reports `{status:'none'}` and no code path can produce anything else.
 */
function EmailRow({ last }: { last?: boolean }) {
  const profile = useUserProfile();

  return (
    <Row
      label="Email address"
      last={last}
      value={profile.email}
      note={
        <span style={{ ...helperTextStyle, margin: 0 }}>
          Your Obligo address is your Google account address. Changing it here
          isn’t available yet.
        </span>
      }
    />
  );
}

/* --------------------------------- Password --------------------------------- */

/**
 * Not a disabled feature — an inapplicable one, and the copy says so.
 *
 * This row used to run a full current/new/confirm form against
 * `changePassword()`, which resolves after a timer and touches nothing. That
 * made it the most misleading control on the page: it reported "Password
 * updated." for a password that does not exist.
 *
 * THE DISTINCTION FROM THE OTHER TWO DISABLED ROWS IS DELIBERATE. Profile
 * pictures and email changes are deferred — the backend can't do them *yet*,
 * and one day will. A password is different in kind: sign-in is Google OAuth
 * only, so the account has no Obligo credential to rotate. There is nothing
 * here to ship later, which is why this says what's true rather than
 * "not available yet" (audit §12 reaches the same conclusion — the concept is
 * moot unless the product adds a non-Google credential path).
 *
 * The value shows the sign-in METHOD rather than a masked `••••••••`, for the
 * same reason: dots imply a stored secret, and there isn't one.
 */
function SignInMethodRow() {
  return (
    <Row
      label="Sign-in"
      last
      value="Google"
      note={
        <span style={{ ...helperTextStyle, margin: 0 }}>
          Sign-in uses your Google account, so there’s no separate password to
          change. Manage it in your Google account settings.
        </span>
      }
    />
  );
}

/* ---------------------------------------------------------------------------- */

export default function Profile() {
  const profile = useUserProfile();

  const handleSignOut = async () => {
    // AWAITED, not fire-and-forget: `signOut()` now flushes pending preference
    // writes and calls `POST /auth/logout`, and navigating out from under it
    // would abort both — losing the user's last change and leaving the session
    // cookie alive. A hard navigation, not router `navigate()`, is still
    // deliberate — see the identical note in `AccountMenu.tsx`'s own
    // `handleSignOut`: it's what actually clears in-memory mail/drafts/
    // workflow state, which an SPA route change would leave live.
    await sessionActions.signOut();
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
              <SignInMethodRow />
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
