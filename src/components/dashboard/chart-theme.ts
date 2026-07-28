/**
 * Dashboard chart palette — derived ONLY from ocean-breeze theme tokens.
 *
 * The theme ships `--chart-1 … --chart-5` as a single-hue emerald ramp, so it is a
 * SEQUENTIAL scale, not a categorical one. Two consequences drive everything below:
 *
 *  1. Adjacent steps of the raw ramp are too close in lightness to separate on their
 *     own (chart-1 ↔ chart-2 is ΔL 0.027 in light, 0.012 in dark). The ramp is
 *     therefore *sub-sampled* into three steps with real gaps, chosen separately per
 *     mode — dark is a deliberate selection, never an automatic flip of light.
 *       light: chart-1 → chart-3 → chart-5   (ΔL 0.127 / 0.164)
 *       dark:  chart-1 → chart-4 → chart-5   (ΔL 0.077 / 0.100)
 *     Both subsets pass the monotone-lightness, step-gap, single-hue and light-end
 *     contrast checks against their own surface.
 *
 *  2. Anything that is not a magnitude gets a NON-ramp role colour: a neutral ink for
 *     reference lines (target, budget — they are benchmarks, not series) and the
 *     destructive token for the one band the reader must act on. The emerald/red
 *     emphasis pair clears the normal-vision floor comfortably (ΔE 36) and sits in the
 *     CVD floor band, which is why every chart using it also carries direct labels.
 *
 * Charts consume these through `ChartConfig`, so `ChartStyle` emits `--color-<key>`
 * per theme and a single class name is correct in both modes.
 */

/** Lightest ramp step — the default "one series, one colour" fill. */
export const RAMP_1 = { light: 'var(--chart-1)', dark: 'var(--chart-1)' } as const
/** Middle ramp step. */
export const RAMP_2 = { light: 'var(--chart-3)', dark: 'var(--chart-4)' } as const
/** Darkest ramp step. */
export const RAMP_3 = { light: 'var(--chart-5)', dark: 'var(--chart-5)' } as const

/** Benchmarks (target, budget). Deliberately neutral so it never reads as a series. */
export const REFERENCE_INK = {
  light: 'var(--muted-foreground)',
  dark: 'var(--muted-foreground)',
} as const

/** The one band the reader must act on. Always paired with a direct label. */
export const CRITICAL_INK = { light: 'var(--destructive)', dark: 'var(--destructive)' } as const

/** Folded tail ("Lain-lain") and other non-data fills. */
export const MUTED_INK = {
  light: 'var(--muted-foreground)',
  dark: 'var(--muted-foreground)',
} as const

/**
 * Amber is absent from the token set, so the caution tone is mixed from the theme's
 * own tokens. Written out literally — Tailwind and CSS both need the full string.
 */
export const WARNING_INK = {
  light: 'color-mix(in oklch, var(--destructive) 58%, var(--chart-1))',
  dark: 'color-mix(in oklch, var(--destructive) 58%, var(--chart-1))',
} as const

/** Surface colour used for the 2px gap between touching marks and for marker rings. */
export const SURFACE = 'var(--card)'

/** Hairline, solid, one step off the surface — never dashed. */
export const GRID_INK = 'var(--border)'

/** Shared axis styling so every chart's chrome recedes identically. */
export const AXIS_TICK = { fontSize: 11 } as const
