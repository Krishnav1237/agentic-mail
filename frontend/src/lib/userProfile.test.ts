import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  isPlausibleEmail,
  isValidDisplayName,
  NO_PROFILE_PHOTO,
  resolveAvatar,
  sanitizeProfile,
} from './userProfile';
import { initialsOf } from './mailAdapters';

describe('defaults', () => {
  it('seed from the canonical mailbox identity, no photo, no pending email change', () => {
    expect(DEFAULT_PROFILE.displayName.length).toBeGreaterThan(0);
    expect(DEFAULT_PROFILE.email).toContain('@');
    expect(DEFAULT_PROFILE.profilePhoto).toEqual(NO_PROFILE_PHOTO);
    expect(DEFAULT_PROFILE.emailChange).toEqual({ status: 'none' });
  });
});

describe('isValidDisplayName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(isValidDisplayName('')).toBe(false);
    expect(isValidDisplayName('   ')).toBe(false);
  });
  it('accepts an ordinary name', () => {
    expect(isValidDisplayName('Alex Rivera')).toBe(true);
  });
});

describe('isPlausibleEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isPlausibleEmail('a@b.com')).toBe(true);
  });
  it('rejects addresses with no @ or no domain', () => {
    expect(isPlausibleEmail('not-an-email')).toBe(false);
    expect(isPlausibleEmail('a@b')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
  });
});

describe('resolveAvatar', () => {
  it('falls back to initials generated from the current display name when there is no photo', () => {
    expect(
      resolveAvatar({ displayName: 'Alex Rivera', profilePhoto: NO_PROFILE_PHOTO })
    ).toEqual({ kind: 'initials', text: initialsOf('Alex Rivera') });
  });

  it('prefers an uploaded photo over initials, regardless of the current name', () => {
    expect(
      resolveAvatar({
        displayName: 'Alex Rivera',
        profilePhoto: { kind: 'uploaded', dataUrl: 'data:image/png;base64,abc' },
      })
    ).toEqual({ kind: 'image', url: 'data:image/png;base64,abc' });
  });

  it('prefers a provider photo over initials', () => {
    expect(
      resolveAvatar({
        displayName: 'Alex Rivera',
        profilePhoto: { kind: 'provider', url: 'https://example.com/avatar.png' },
      })
    ).toEqual({ kind: 'image', url: 'https://example.com/avatar.png' });
  });

  it('regenerates initials from a NEW name once the name changes, with no photo', () => {
    const before = resolveAvatar({ displayName: 'Alex Rivera', profilePhoto: NO_PROFILE_PHOTO });
    const after = resolveAvatar({ displayName: 'Shrey Bansal', profilePhoto: NO_PROFILE_PHOTO });
    expect(before).toEqual({ kind: 'initials', text: 'AR' });
    expect(after).toEqual({ kind: 'initials', text: 'SB' });
  });

  it('keeps an uploaded photo across a later name change — the override survives renaming', () => {
    const photo = { kind: 'uploaded' as const, dataUrl: 'data:image/png;base64,xyz' };
    const renamed = resolveAvatar({ displayName: 'Jonathan Bansal', profilePhoto: photo });
    expect(renamed).toEqual({ kind: 'image', url: photo.dataUrl });
  });

  it('falls back to the CURRENT name once a photo is explicitly removed', () => {
    const resolved = resolveAvatar({ displayName: 'Shrey Bansal', profilePhoto: NO_PROFILE_PHOTO });
    expect(resolved).toEqual({ kind: 'initials', text: 'SB' });
  });
});

describe('sanitizeProfile', () => {
  it('falls back to defaults for a non-object blob', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile(undefined)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile('garbage')).toEqual(DEFAULT_PROFILE);
  });

  it('keeps a well-formed blob as-is', () => {
    const input = {
      displayName: 'Dana Lee',
      profilePhoto: { kind: 'uploaded', dataUrl: 'data:image/png;base64,abc' },
      email: 'dana@example.com',
      emailChange: { status: 'pending', requestedEmail: 'new@example.com' },
    };
    expect(sanitizeProfile(input)).toEqual(input);
  });

  it('falls back displayName to default when blank, never propagates empty', () => {
    expect(
      sanitizeProfile({ ...DEFAULT_PROFILE, displayName: '   ' }).displayName
    ).toBe(DEFAULT_PROFILE.displayName);
  });

  it('drops an unrecognised profilePhoto shape to none rather than crashing', () => {
    expect(
      sanitizeProfile({ ...DEFAULT_PROFILE, profilePhoto: { kind: 'bogus' } }).profilePhoto
    ).toEqual(NO_PROFILE_PHOTO);
    expect(sanitizeProfile({ ...DEFAULT_PROFILE, profilePhoto: 42 }).profilePhoto).toEqual(
      NO_PROFILE_PHOTO
    );
  });

  it('migrates a legacy bare avatarDataUrl string into an uploaded photo', () => {
    const { profilePhoto: _omit, ...legacyBase } = DEFAULT_PROFILE;
    expect(
      sanitizeProfile({ ...legacyBase, avatarDataUrl: 'data:image/png;base64,legacy' })
        .profilePhoto
    ).toEqual({ kind: 'uploaded', dataUrl: 'data:image/png;base64,legacy' });
  });

  it('ignores a legacy avatarDataUrl once a current-shape profilePhoto is present', () => {
    expect(
      sanitizeProfile({
        ...DEFAULT_PROFILE,
        profilePhoto: { kind: 'uploaded', dataUrl: 'current' },
        avatarDataUrl: 'stale-legacy',
      }).profilePhoto
    ).toEqual({ kind: 'uploaded', dataUrl: 'current' });
  });

  it('falls back email to default when missing or blank', () => {
    expect(sanitizeProfile({ ...DEFAULT_PROFILE, email: '' }).email).toBe(
      DEFAULT_PROFILE.email
    );
    expect(sanitizeProfile({ ...DEFAULT_PROFILE, email: undefined }).email).toBe(
      DEFAULT_PROFILE.email
    );
  });

  it('resets an incoherent emailChange (pending with no requestedEmail) to none', () => {
    expect(
      sanitizeProfile({
        ...DEFAULT_PROFILE,
        emailChange: { status: 'pending' },
      }).emailChange
    ).toEqual({ status: 'none' });
  });

  it('resets an unrecognised emailChange status to none', () => {
    expect(
      sanitizeProfile({
        ...DEFAULT_PROFILE,
        emailChange: { status: 'confirmed', requestedEmail: 'x@y.com' },
      }).emailChange
    ).toEqual({ status: 'none' });
  });
});
