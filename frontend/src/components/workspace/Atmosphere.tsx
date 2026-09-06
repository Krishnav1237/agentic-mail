/**
 * Workspace atmosphere — a deep, calm room crossed by only three shafts of
 * champagne-gold light, each a genuine multi-oscillation sine wave, slowly
 * drifting bottom-to-top while breathing like a swell rolling across open
 * water.
 *
 * Pure CSS, no canvas or image assets. Each beam (`.iil-beam-slot--N`) has two
 * co-located parts sharing the exact same box and the exact same centreline
 * formula (`y = 50 + amp·sin(2π·freq·x + phase)`, in % of that box): a
 * sine-shaped line and illuminated grain wrapped around it.
 *
 * The line (`.iil-beam`) is one continuous filled shape per layer (outer
 * falloff, glow, core), carved by `clip-path: polygon()` into a wavy ribbon —
 * a top edge and a bottom edge both following that same centreline, offset
 * by the layer's own half-thickness, closed into one polygon (baked once,
 * ~44 vertices per edge, via a generator script — never hand-edited point by
 * point). Because each layer is a single element, not a chain of separately
 * positioned pieces, there are no internal seams; `freq` is tuned so at
 * least one full oscillation is visible within the viewport even though the
 * box itself extends well past both edges. Each layer is its own element
 * (not a pseudo-element of a filtered parent) because `filter` rasterizes an
 * element together with its descendants before blurring: nesting all three
 * under one filtered wrapper would blur the core by the outer layer's much
 * larger radius too. Critically, the wave's SHAPE is never re-animated —
 * only `.iil-beam-wave`'s `scaleY` breathes the whole thing in and out —
 * so the grain (below), sharing this identical box and centreline, scales in
 * perfect lockstep with the ribbon instead of drifting out of registration.
 *
 * Illuminated grain — two layers of hundreds of individually-placed,
 * individually-sized, individually-faded microscopic specks (baked into a
 * single non-repeating `background-image` per layer, generated once against
 * the SAME sine formula as the ribbon above, with the same amp/freq/phase
 * per beam) — lives inside `.iil-beam` alongside outer/glow/core, so it
 * traces the ribbon's actual wave shape rather than a flat band. Both layers
 * render at full opacity, stacked for a dense, consistently-lit dust field.
 *
 * Motion composes on the existing `.iil-beam-slot` / `.iil-beam-wave`
 * wrappers so the line and its grain always move together: "travel" (the
 * whole beam drifts bottom-to-top on a long loop, fading to zero opacity
 * exactly at the loop boundary so the reset is invisible) and the
 * amplitude-breathing "wave" described above. Color and strength adapt to
 * the active theme purely through the `--beam-*` / `--grain-*` tokens on
 * `.iil-root`, so this component holds no theme state.
 *
 * All motion is transform/opacity only (GPU-friendly) and freezes under
 * `prefers-reduced-motion` via the workspace-scoped block in index.css.
 */
function Beam({ index }: { index: 1 | 2 | 3 }) {
  return (
    <div className={`iil-beam-slot iil-beam-slot--${index}`}>
      <div className={`iil-beam-wave iil-beam-wave--${index}`}>
        <div className={`iil-beam iil-beam--${index}`}>
          <div className="iil-beam-outer" />
          <div className="iil-beam-glow" />
          <div className="iil-beam-core" />
          <div className={`iil-beam-grain iil-beam-grain--${index}a`} />
          <div className={`iil-beam-grain iil-beam-grain--${index}b`} />
        </div>
      </div>
    </div>
  );
}

export function Atmosphere() {
  return (
    <div className="iil-atmosphere" aria-hidden="true">
      {/* Constant, non-animated wash covering the shell's own footprint (the
          top strip the topbar sits over, the left column the sidebar sits
          over). Each beam only ever drifts through a limited vertical band
          of its own (see .iil-beam-slot / travel keyframes) — their combined
          coverage leaves permanent gaps a moving beam never reaches, so the
          shell's backdrop-blur would reveal nothing there no matter how long
          you wait. This gives blur something faint to reveal everywhere the
          shell covers, independent of where the beams currently are. */}
      <div className="iil-shell-ambient" />
      <Beam index={1} />
      <Beam index={2} />
      <Beam index={3} />
      <div className="iil-vignette" />
    </div>
  );
}
