/**
 * The one shared avatar recipe — an uploaded/provider image, or the
 * initials-on-a-gradient-circle fallback the topbar has always shown.
 * Previously duplicated inline wherever an avatar was needed; this is that
 * recipe pulled out so the topbar trigger, the account menu and the Profile
 * page's picture section render byte-for-byte the same avatar rather than
 * three near-identical circles that could drift apart in size or shade.
 *
 * Renders through `resolveAvatar` — the ONE place that decides image vs.
 * initials — rather than branching on `imageUrl` itself, so no caller can
 * independently invent a different rule for what this user's avatar is.
 */
import type { CSSProperties } from 'react';
import { resolveAvatar, type ProfilePhoto } from '../../lib/userProfile';

export function Avatar({
  displayName,
  photo,
  size = 30,
  style,
}: {
  displayName: string;
  photo: ProfilePhoto;
  /** Diameter in px, scaled by `--ui-scale` like the rest of the workspace
   * chrome. */
  size?: number;
  style?: CSSProperties;
}) {
  const resolved = resolveAvatar({ displayName, profilePhoto: photo });
  const dimension = `calc(var(--ui-scale) * ${size}px)`;
  const shared: CSSProperties = {
    width: dimension,
    height: dimension,
    borderRadius: '50%',
    flex: 'none',
    display: 'block',
    ...style,
  };

  if (resolved.kind === 'image') {
    return (
      <img
        src={resolved.url}
        alt=""
        style={{
          ...shared,
          objectFit: 'cover',
          boxShadow: 'inset 0 1px 0 rgb(var(--ink) / 0.14)',
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        ...shared,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: `500 calc(var(--ui-scale) * ${Math.round(size * 0.37)}px) Inter, sans-serif`,
        color: 'rgb(var(--ink) / 0.7)',
        background:
          'linear-gradient(160deg, rgb(var(--ink) / 0.16), rgb(var(--ink) / 0.05))',
        boxShadow: 'inset 0 1px 0 rgb(var(--ink) / 0.14)',
      }}
    >
      {resolved.text}
    </div>
  );
}
