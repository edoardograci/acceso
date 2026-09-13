export const TITLE_MAX = 60;
const DESC_MAX = 155;
const DESC_MIN = 120;

function truncateAtWord(str: string, max: number): string {
  if (str.length <= max) return str;
  const cut = str.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function entityTitle(name: string, typeLabel: string, city?: string): string {
  if (city) {
    const withCity = `${name} - ${typeLabel} in ${city} | Acceso`;
    if (withCity.length <= TITLE_MAX) return withCity;
  }
  const withoutCity = `${name} - ${typeLabel} | Acceso`;
  if (withoutCity.length <= TITLE_MAX + 8) return withoutCity;
  return `${name} | Acceso`;
}

export function entityDescription(raw: string | null | undefined, fallback: string): string {
  const base = (raw || '').trim();
  if (!base) return fallback;
  if (base.length > DESC_MAX) return truncateAtWord(base, DESC_MAX);
  if (base.length < DESC_MIN) return truncateAtWord(`${base} ${fallback}`, DESC_MAX);
  return base;
}
