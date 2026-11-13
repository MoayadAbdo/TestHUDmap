/** Short site name for the visor: mission.site may be text ("Mount Sharp boxwork, Gale Crater, Mars") or { name }. */
export function siteName(site) {
  if (typeof site === 'string') return site.split(',')[0].trim() || 'Mars';
  return site?.name ?? 'Mars';
}

/** Photo credit line for a stop card: text, or an object such as { credit, camera, sol }. */
export function creditLine(credit) {
  if (!credit) return '';
  if (typeof credit === 'string') return credit;
  return Object.values(credit).filter((v) => v != null && v !== '').join(' · ');
}
