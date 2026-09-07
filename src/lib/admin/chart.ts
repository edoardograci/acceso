// src/lib/admin/chart.ts
//
// Interactive area chart for the analytics dashboard.
//
// Hit-testing is a single mousemove on the plot with nearest-index maths rather
// than one invisible rect per point: it stays smooth at 90 data points and the
// crosshair tracks continuously instead of snapping between hit zones.

export interface ChartPoint {
  /** ISO day (YYYY-MM-DD) or hour ("YYYY-MM-DD HH:MM"). */
  label: string;
  values: Record<string, number>;
}

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
}

export interface ChartOptions {
  points: ChartPoint[];
  series: ChartSeries[];
  /** Series drawn with the area fill. Defaults to the first series. */
  primaryKey?: string;
  /** "day" formats labels as Sep 7; "hour" as 14:00. */
  mode?: 'day' | 'hour';
  /** Called when a point is clicked — used to drill into a single day. */
  onSelect?: (point: ChartPoint) => void;
}

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
const H = 280;
const PAD = { left: 52, right: 18, top: 18, bottom: 34 };

const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function formatNumber(value: number): string {
  const n = Math.round(value);
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
  return new Intl.NumberFormat('en-US').format(n);
}

/** Round an axis maximum up to a clean 1/2/5 × 10^n so gridlines read well. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Format an axis tick.
 *
 * Hourly points arrive as "2026-09-07 14:00". The previous implementation fed
 * that straight into `new Date(label + 'T00:00:00Z')`, which is not a valid
 * date string, so every hourly tick fell back to printing the raw timestamp.
 */
export function formatChartLabel(label: string, mode: 'day' | 'hour'): string {
  if (mode === 'hour') {
    const time = label.slice(11, 16);
    return time || label;
  }
  const date = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return label;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatFullLabel(label: string, mode: 'day' | 'hour'): string {
  if (mode === 'hour') {
    const date = new Date(`${label.replace(' ', 'T')}:00Z`);
    if (Number.isNaN(date.getTime())) return label;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    });
  }
  const date = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return label;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Render the chart into `container`. Returns a teardown function that removes
 * the listeners, so re-rendering on a filter change cannot leak handlers.
 */
export function renderChart(container: HTMLElement, options: ChartOptions): () => void {
  const { points, series, mode = 'day', onSelect } = options;
  const primaryKey = options.primaryKey || series[0]?.key;

  container.replaceChildren();

  if (!points.length) {
    container.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'an-empty',
        textContent: 'No traffic recorded in this period.',
      })
    );
    return () => {};
  }

  const rawMax = points.reduce(
    (acc, point) => Math.max(acc, ...series.map((s) => point.values[s.key] || 0)),
    0
  );
  const yMax = niceMax(rawMax);

  // A single point has no interval to spread across; centre it so it doesn't
  // collapse onto the y-axis.
  const x = (index: number) =>
    points.length <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (index * PLOT_W) / (points.length - 1);
  const y = (value: number) => PAD.top + PLOT_H - (value / yMax) * PLOT_H;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'an-chart-svg',
    role: 'img',
    'aria-label': `${series.map((s) => s.name).join(' and ')} over time`,
  });

  // Gradient for the primary area fill.
  const primary = series.find((s) => s.key === primaryKey) || series[0];
  const gradientId = `an-grad-${Math.random().toString(36).slice(2, 9)}`;
  const defs = svgEl('defs');
  const gradient = svgEl('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.appendChild(svgEl('stop', { offset: '0%', 'stop-color': primary.color, 'stop-opacity': '0.22' }));
  gradient.appendChild(svgEl('stop', { offset: '100%', 'stop-color': primary.color, 'stop-opacity': '0' }));
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // Gridlines + y labels
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const gy = PAD.top + PLOT_H - fraction * PLOT_H;
    svg.appendChild(
      svgEl('line', { x1: PAD.left, x2: W - PAD.right, y1: gy, y2: gy, stroke: '#EFEFF1', 'stroke-width': 1 })
    );
    const text = svgEl('text', {
      x: PAD.left - 10,
      y: gy + 4,
      'text-anchor': 'end',
      'font-size': 11,
      fill: '#A1A1AA',
    });
    text.textContent = formatNumber(yMax * fraction);
    svg.appendChild(text);
  }

  // X ticks — at most 7, always including the last point.
  const tickStep = Math.max(1, Math.ceil(points.length / 7));
  points.forEach((point, index) => {
    if (index % tickStep !== 0 && index !== points.length - 1) return;
    const text = svgEl('text', {
      x: x(index),
      y: H - 10,
      'text-anchor': 'middle',
      'font-size': 11,
      fill: '#A1A1AA',
    });
    text.textContent = formatChartLabel(point.label, mode);
    svg.appendChild(text);
  });

  if (rawMax > 0) {
    // Area under the primary series.
    const areaPoints = points.map((p, i) => `${x(i).toFixed(1)},${y(p.values[primary.key] || 0).toFixed(1)}`);
    const area = [
      `M ${PAD.left},${PAD.top + PLOT_H}`,
      ...(points.length === 1
        ? [`L ${areaPoints[0]}`, `L ${(W - PAD.right).toFixed(1)},${y(points[0].values[primary.key] || 0).toFixed(1)}`]
        : areaPoints.map((pt) => `L ${pt}`)),
      `L ${W - PAD.right},${PAD.top + PLOT_H}`,
      'Z',
    ].join(' ');
    svg.appendChild(svgEl('path', { d: area, fill: `url(#${gradientId})`, stroke: 'none' }));

    for (const s of series) {
      const d = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.values[s.key] || 0).toFixed(1)}`)
        .join(' ');
      svg.appendChild(
        svgEl('path', {
          d,
          fill: 'none',
          stroke: s.color,
          'stroke-width': s.key === primary.key ? 2.25 : 1.5,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
          opacity: s.key === primary.key ? 1 : 0.65,
        })
      );

      // A one-point line draws nothing, so mark it explicitly. This is why
      // the "Today" range used to render an empty chart.
      if (points.length === 1) {
        svg.appendChild(
          svgEl('circle', { cx: x(0), cy: y(points[0].values[s.key] || 0), r: 4, fill: s.color })
        );
      }
    }
  }

  // Crosshair + hover markers, hidden until the pointer enters the plot.
  const crosshair = svgEl('line', {
    y1: PAD.top,
    y2: PAD.top + PLOT_H,
    stroke: '#0F1113',
    'stroke-width': 1,
    'stroke-dasharray': '3 3',
    opacity: 0,
  });
  svg.appendChild(crosshair);

  const markers = series.map((s) => {
    const circle = svgEl('circle', {
      r: 4.5,
      fill: '#fff',
      stroke: s.color,
      'stroke-width': 2.5,
      opacity: 0,
    });
    svg.appendChild(circle);
    return circle;
  });

  container.appendChild(svg);

  const tooltip = document.createElement('div');
  tooltip.className = 'an-tooltip';
  tooltip.hidden = true;
  container.appendChild(tooltip);

  let activeIndex = -1;

  function indexFromEvent(event: MouseEvent): number {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return -1;
    // Map client px -> viewBox units, then invert the x() spacing.
    const viewX = ((event.clientX - rect.left) / rect.width) * W;
    if (points.length <= 1) return 0;
    const ratio = (viewX - PAD.left) / PLOT_W;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  }

  function showAt(index: number) {
    if (index < 0 || index >= points.length) return;
    activeIndex = index;
    const point = points[index];
    const px = x(index);

    crosshair.setAttribute('x1', String(px));
    crosshair.setAttribute('x2', String(px));
    crosshair.setAttribute('opacity', '1');

    series.forEach((s, i) => {
      markers[i].setAttribute('cx', String(px));
      markers[i].setAttribute('cy', String(y(point.values[s.key] || 0)));
      markers[i].setAttribute('opacity', '1');
    });

    tooltip.replaceChildren();
    const heading = document.createElement('p');
    heading.className = 'an-tooltip-title';
    heading.textContent = formatFullLabel(point.label, mode);
    tooltip.appendChild(heading);

    for (const s of series) {
      const row = document.createElement('p');
      row.className = 'an-tooltip-row';

      const dot = document.createElement('span');
      dot.className = 'an-dot';
      dot.style.background = s.color;

      const name = document.createElement('span');
      name.className = 'an-tooltip-name';
      name.textContent = s.name;

      const value = document.createElement('span');
      value.className = 'an-tooltip-value';
      value.textContent = new Intl.NumberFormat('en-US').format(point.values[s.key] || 0);

      row.append(dot, name, value);
      tooltip.appendChild(row);
    }

    // Position within the container, flipping side near the right edge so the
    // tooltip never escapes the card.
    const ratio = px / W;
    tooltip.hidden = false;
    tooltip.style.left = `${ratio * 100}%`;
    tooltip.style.transform = ratio > 0.72 ? 'translate(-100%, 0)' : 'translate(-50%, 0)';
  }

  function hide() {
    activeIndex = -1;
    crosshair.setAttribute('opacity', '0');
    markers.forEach((marker) => marker.setAttribute('opacity', '0'));
    tooltip.hidden = true;
  }

  const onMove = (event: MouseEvent) => showAt(indexFromEvent(event));
  const onLeave = () => hide();
  const onClick = () => {
    if (activeIndex >= 0 && onSelect) onSelect(points[activeIndex]);
  };

  svg.addEventListener('mousemove', onMove);
  svg.addEventListener('mouseleave', onLeave);
  if (onSelect) {
    svg.addEventListener('click', onClick);
    svg.classList.add('is-clickable');
  }

  return () => {
    svg.removeEventListener('mousemove', onMove);
    svg.removeEventListener('mouseleave', onLeave);
    svg.removeEventListener('click', onClick);
  };
}
