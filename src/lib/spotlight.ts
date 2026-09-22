import { withCovers, type MoodboardItem } from './moodboard';

// The spotlight is the most recent week present in the data (Monday–Sunday,
// UTC), NOT the calendar week — this way, on Monday before the new items are
// pushed, last week's items stay in the spotlight instead of the section
// going empty. Mirrors the logic used on /discover, kept as its own module
// so the homepage doesn't need to touch that page's source.
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun … 6 = Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

const WEEK_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatWeekLabel(start: Date, endExclusive: Date): string {
  // endExclusive is the following Monday; step back one day to get Sunday.
  const end = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  const f = (d: Date) => `${d.getUTCDate()} ${WEEK_MONTHS[d.getUTCMonth()]}`;
  return `${f(start)} - ${f(end)}`;
}

export function getWeeklySpotlight(rawItems: Partial<MoodboardItem>[]): {
  spotlightItems: MoodboardItem[];
  weekLabel: string;
} {
  const visibleItems = (withCovers(rawItems) as MoodboardItem[])
    .filter((item) => item.cover)
    .sort((a, b) => new Date(b.dayToPost ?? 0).getTime() - new Date(a.dayToPost ?? 0).getTime());

  let spotlightItems: MoodboardItem[] = [];
  let weekLabel = '';

  if (visibleItems.length) {
    const times = visibleItems
      .map((i) => new Date(i.dayToPost ?? 0).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length) {
      const maxTime = Math.max(...times);
      const weekStart = mondayOf(new Date(maxTime));
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      weekLabel = formatWeekLabel(weekStart, weekEnd);
      spotlightItems = visibleItems
        .filter((i) => {
          const t = new Date(i.dayToPost ?? 0).getTime();
          return !Number.isNaN(t) && t >= weekStart.getTime() && t < weekEnd.getTime();
        })
        .sort((a, b) => new Date(a.dayToPost ?? 0).getTime() - new Date(b.dayToPost ?? 0).getTime());
    }
  }

  return { spotlightItems, weekLabel };
}
