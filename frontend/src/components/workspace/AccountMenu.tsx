/**
 * The topbar avatar, made interactive — a trigger that opens a compact
 * account menu (avatar, display name, email, Profile, Sign out).
 *
 * Same anchored-popover mechanics as `RecipientDisclosure`/`Select`:
 * `usePopoverPosition`/`useOutsideClose`/`getPortalRoot`, portalled to
 * `.obligo-root` (not `document.body`) so `position: fixed` stays
 * viewport-relative under `.obligo-page`'s own content-zoom transform, and
 * closes on outside-click or Escape like every other overlay in the
 * workspace.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EASE } from './motion';
import { usePopoverPosition, useOutsideClose, getPortalRoot } from './ReplyComposer';
import { Avatar } from './Avatar';
import { HelpFeedbackModal } from './HelpFeedbackModal';
import { sessionActions, useUserProfile } from '../../lib/userProfileStore';

export function AccountMenu() {
  const navigate = useNavigate();
  const profile = useUserProfile();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useOutsideClose<HTMLButtonElement>(open, () => setOpen(false), popoverRef);
  const position = usePopoverPosition(triggerRef, popoverRef, open, 'right');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const goToProfile = () => {
    setOpen(false);
    navigate('/profile');
  };

  const openHelp = () => {
    setOpen(false);
    setHelpOpen(true);
  };

  // The frontend interaction/navigation seam only — no real session exists
  // to invalidate yet (see `sessionActions.signOut`). A hard navigation, not
  // router `navigate()`, is deliberate: `signOut()` already clears every
  // persisted store, but mail/drafts/workflow state is in-memory-only and an
  // SPA route change wouldn't touch it, leaving it silently reachable until
  // a real reload. This is the reload.
  const handleSignOut = () => {
    setOpen(false);
    sessionActions.signOut();
    window.location.assign('/');
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account menu — ${profile.displayName}`}
        title={`${profile.displayName} · ${profile.email}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          borderRadius: '50%',
          cursor: 'pointer',
          lineHeight: 0,
          flex: 'none',
        }}
      >
        <Avatar displayName={profile.displayName} photo={profile.profilePhoto} size={30} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              role="dialog"
              aria-label="Account menu"
              className="obligo-menu"
              style={{
                width: 240,
                minWidth: 240,
                maxWidth: 'calc(100vw - 16px)',
                padding: 8,
                zIndex: 70,
                ...position,
              }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 6px 10px',
                }}
              >
                <Avatar displayName={profile.displayName} photo={profile.profilePhoto} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      font: '500 13px/1.3 Inter, sans-serif',
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
                      font: '400 11px/1.3 Inter, sans-serif',
                      color: 'var(--text-faint)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {profile.email}
                  </div>
                </div>
              </div>
              <div
                style={{
                  borderTop: '1px solid rgb(var(--ink) / 0.08)',
                  paddingTop: 6,
                }}
              >
                <button type="button" className="obligo-option" onClick={goToProfile}>
                  <User size={14} strokeWidth={1.75} aria-hidden />
                  <span>Profile</span>
                </button>
                <button type="button" className="obligo-option" onClick={openHelp}>
                  <HelpCircle size={14} strokeWidth={1.75} aria-hidden />
                  <span>Help &amp; Feedback</span>
                </button>
                <button type="button" className="obligo-option" onClick={handleSignOut}>
                  <LogOut size={14} strokeWidth={1.75} aria-hidden />
                  <span>Sign out</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        getPortalRoot(),
      )}

      <HelpFeedbackModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
