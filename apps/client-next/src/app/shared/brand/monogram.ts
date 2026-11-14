/**
 * The brand gradients a monogram can take: blue, teal, amber and green, each with its glow, and a
 * deeper version for a surface with white text on it, which keeps a contrast of at least 4.5:1.
 */
const GRADIENTS = [
  {
    fill: 'bg-[linear-gradient(135deg,#6b74ff,#343dff)]',
    glow: 'shadow-[0_10px_22px_-10px_rgba(52,61,255,0.9)]',
    deep: 'bg-[linear-gradient(135deg,#343dff,#1b2160)]',
  },
  {
    fill: 'bg-[linear-gradient(135deg,#14a594,#0a5560)]',
    glow: 'shadow-[0_10px_22px_-10px_rgba(15,140,126,0.9)]',
    deep: 'bg-[linear-gradient(135deg,#0d7a6e,#083c43)]',
  },
  {
    fill: 'bg-[linear-gradient(135deg,#f5a05c,#b5611c)]',
    glow: 'shadow-[0_10px_22px_-10px_rgba(181,97,28,0.9)]',
    deep: 'bg-[linear-gradient(135deg,#a8571a,#5c2d0c)]',
  },
  {
    fill: 'bg-[linear-gradient(135deg,#5cbf60,#2e7d32)]',
    glow: 'shadow-[0_10px_22px_-10px_rgba(46,125,50,0.9)]',
    deep: 'bg-[linear-gradient(135deg,#2e7d32,#163d18)]',
  },
] as const;

function gradientOf(id: string): (typeof GRADIENTS)[number] {
  return GRADIENTS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % GRADIENTS.length];
}

/** Up to two initials of a name, for example "AU" for "Acme University" or "TL" for "trust-list". */
export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  );
}

/** The gradient of the monogram of `id`, with its glow: always the same one for the same ID. */
export function monogramGradient(id: string): string {
  const { fill, glow } = gradientOf(id);
  return `${fill} ${glow}`;
}

/** The deeper gradient of `id`, for a surface with white text, such as the head of a tenant's page. */
export function monogramSurface(id: string): string {
  return gradientOf(id).deep;
}
