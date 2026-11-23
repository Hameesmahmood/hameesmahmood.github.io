// Interactive project charts. Each <figure data-chart> starts as a static SVG (the fallback without
// JavaScript); when it comes near the viewport, the trimmed ECharts bundle loads once and replaces
// the image with a live chart drawn in the site's own type and colours. Theme changes redraw it.
(() => {
  const figures = [...document.querySelectorAll('figure[data-chart]')];
  if (!figures.length || !('IntersectionObserver' in window)) return;

  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const charts = new Map();
  let library;

  const css = name => getComputedStyle(root).getPropertyValue(name).trim();
  const num = n => Math.round(n).toLocaleString('en');
  const compact = n => (n >= 1000 ? `${n / 1000}K` : String(n));

  function theme() {
    return {
      text: css('--text'), muted: css('--muted'), line: css('--line'), raised: css('--raised'),
      good: css('--chart-good'), warn: css('--chart-warn'), flow: css('--flow'),
      sans: css('--sans'), mono: css('--mono'),
    };
  }

  function base(t) {
    return {
      animation: !still,
      animationDuration: 900,
      animationEasing: 'cubicOut',
      textStyle: { fontFamily: t.sans, color: t.muted },
      tooltip: {
        trigger: 'axis',
        backgroundColor: t.raised,
        borderColor: t.line,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: t.text, fontFamily: t.sans, fontSize: 13 },
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,.28); border-radius: 6px;',
        axisPointer: { type: 'line', lineStyle: { color: t.muted, width: 1, type: [3, 3] } },
      },
    };
  }

  const axisLabel = t => ({ color: t.muted, fontFamily: t.mono, fontSize: 11 });
  const row = (t, swatch, label, value) =>
    `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;min-width:190px">` +
    `<span style="display:flex;gap:7px;align-items:center">${swatch ? `<i style="width:10px;height:2px;border-radius:1px;background:${swatch}"></i>` : ''}${label}</span>` +
    `<b style="font-family:${t.mono};font-weight:500">${value}</b></div>`;

  // Webhook Inbox: deliveries and the queue over a chaos run, with every SIGKILL marked on a rug.
  const chaos = {
    option(d, t) {
      const killsBy = s => d.killTimes.filter(k => k <= s).length;
      const peak = d.samples.reduce((a, b) => (b[2] > a[2] ? b : a));
      const last = d.samples[d.samples.length - 1];
      return {
        ...base(t),
        grid: { left: 46, right: 88, top: 34, bottom: 34 },
        xAxis: {
          type: 'value', min: 0, max: Math.ceil(last[0] / 25) * 25, interval: 25,
          axisLabel: { ...axisLabel(t), formatter: v => `${v}s` },
          axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }, splitLine: { show: false },
        },
        yAxis: {
          type: 'value', min: 0, max: d.events, interval: d.events / 4,
          axisLabel: { ...axisLabel(t), formatter: compact },
          splitLine: { lineStyle: { color: t.line, opacity: 0.6 } },
        },
        tooltip: {
          ...base(t).tooltip,
          formatter: ps => {
            const s = ps[0].value[0];
            return `<div style="font-family:${t.mono};color:${t.muted};font-size:12px;margin-bottom:6px">${s.toFixed(1)} s into the run</div>` +
              row(t, t.good, 'Delivered', num(ps[0].value[1])) +
              row(t, t.warn, 'Waiting', num(ps[1].value[1])) +
              row(t, t.muted, 'Workers killed so far', killsBy(s));
          },
        },
        series: [
          {
            name: 'Delivered', type: 'line', showSymbol: false, smooth: 0.15,
            data: d.samples.map(s => [s[0], s[1]]),
            lineStyle: { color: t.good, width: 2 }, itemStyle: { color: t.good },
            areaStyle: { color: t.good, opacity: 0.1 },
            endLabel: {
              show: true, distance: 8, color: t.text, fontFamily: t.sans, fontSize: 12, lineHeight: 15,
              formatter: () => `{v|${num(last[1])}}\n{l|delivered}`,
              rich: { v: { fontFamily: t.mono, fontWeight: 500, color: t.text, fontSize: 12 }, l: { color: t.muted, fontSize: 11 } },
            },
          },
          {
            name: 'Waiting', type: 'line', showSymbol: false, smooth: 0.15,
            data: d.samples.map(s => [s[0], s[2]]),
            lineStyle: { color: t.warn, width: 2 }, itemStyle: { color: t.warn },
            areaStyle: { color: t.warn, opacity: 0.08 },
            markPoint: {
              symbol: 'circle', symbolSize: 7, silent: true, animation: false,
              itemStyle: { color: t.warn, borderColor: t.raised, borderWidth: 2 },
              data: [{ coord: [peak[0], peak[2]] }],
              label: {
                // Below-right of the peak, inside the queue's shaded area: above it is the kill rug, and
                // the line falls away to the right, so this is the clear spot.
                show: true, position: [16, 26], color: t.text, fontSize: 12, lineHeight: 15,
                formatter: `{v|${num(peak[2])}} waiting\n{l|at the peak, ${peak[0]}s in}`,
                rich: { v: { fontFamily: t.mono, fontWeight: 500, color: t.text }, l: { color: t.muted, fontSize: 11 } },
              },
            },
          },
        ],
      };
    },
    // The kill rug sits above the plot, so it's drawn after the axes exist.
    decorate(chart, d, t) {
      const y = 14;
      const ticks = d.killTimes.map(k => {
        const x = chart.convertToPixel({ xAxisIndex: 0 }, k);
        return { type: 'line', silent: true, shape: { x1: x, y1: y, x2: x, y2: y + 10 }, style: { stroke: t.muted, lineWidth: 1.5, lineCap: 'round' } };
      });
      const x0 = chart.convertToPixel({ xAxisIndex: 0 }, 0);
      chart.setOption({
        graphic: [
          { type: 'text', silent: true, left: x0 - 46, top: y - 1, style: { text: 'kills', fill: t.muted, font: `11px ${t.mono}` } },
          ...ticks,
        ],
      }, { replaceMerge: ['graphic'] });
    },
  };

  // Crash-safe batch: throughput against chunk size, on a log scale, with the default marked.
  const bench = {
    option(d, t) {
      const pts = d.results;
      const top = Math.max(...pts.map(p => p[3]));
      const step = 3000;
      const def = pts.find(p => p[0] === d.defaultChunk);
      const first = pts[0], last = pts[pts.length - 1];
      const label = (pos, valueText, note, align = 'left') => ({
        show: true, position: pos, align, distance: 10, color: t.text, fontSize: 12, lineHeight: 15,
        formatter: `{v|${valueText}}\n{l|${note}}`,
        rich: { v: { fontFamily: t.mono, fontWeight: 500, color: t.text }, l: { color: t.muted, fontSize: 11 } },
      });
      return {
        ...base(t),
        grid: { left: 46, right: 30, top: 34, bottom: 34 },
        xAxis: {
          type: 'log', logBase: 10, min: 0.7, max: 7500,
          // The axis runs a little past 1 and 5,000 so the end points aren't clipped; don't label the padding.
          axisLabel: { ...axisLabel(t), formatter: v => num(v), showMinLabel: false, showMaxLabel: false },
          axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }, splitLine: { show: false },
        },
        yAxis: {
          type: 'value', min: 0, max: Math.ceil(top / step) * step, interval: step,
          axisLabel: { ...axisLabel(t), formatter: compact },
          splitLine: { lineStyle: { color: t.line, opacity: 0.6 } },
        },
        tooltip: {
          ...base(t).tooltip,
          trigger: 'item',
          formatter: p => {
            const r = pts[p.dataIndex];
            return `<div style="font-family:${t.mono};color:${t.muted};font-size:12px;margin-bottom:6px">${num(r[0])} rows per chunk${r[0] === d.defaultChunk ? ' · the default' : ''}</div>` +
              row(t, null, 'Rows per second', num(r[1])) +
              row(t, null, 'Transactions', num(r[4])) +
              row(t, null, `Runs (${d.repeats})`, `${num(r[2])}–${num(r[3])}`);
          },
        },
        series: [{
          type: 'line', smooth: false, symbol: 'circle', symbolSize: 7,
          data: pts.map(p => ({
            value: [p[0], p[1]],
            itemStyle: p === def
              ? { color: t.warn, borderColor: t.raised, borderWidth: 2 }
              : { color: t.flow, borderColor: t.raised, borderWidth: 2 },
            symbolSize: p === def ? 11 : 7,
            // The line rises left to right, so labels sit above-right of the first point and
            // below-right of the default, where the line leaves room.
            label: p === first ? label([10, -44], `${num(p[1])} rows/s`, '1 per chunk')
              : p === def ? label([14, 4], `${num(p[1])} rows/s`, '500, the default')
              // Right-aligned to the last point, so it never runs off a narrow card.
              : p === last ? label([4, -40], `${num(p[1])} rows/s`, '5,000, fastest tested', 'right')
              : { show: false },
          })),
          lineStyle: { color: t.flow, width: 2 },
          emphasis: { scale: 1.4 },
          labelLayout: { hideOverlap: false },
        }],
      };
    },
  };

  const kinds = { chaos, bench };

  async function render(figure, animate) {
    const kind = kinds[figure.dataset.chart];
    const entry = charts.get(figure) ?? { data: await (await fetch(figure.dataset.src)).json() };
    const t = theme();
    if (!entry.chart) {
      const plot = figure.querySelector('.chart-plot');
      plot.replaceChildren();
      entry.chart = library.init(plot, null, { renderer: 'svg' });
      new ResizeObserver(() => { entry.chart.resize(); kind.decorate?.(entry.chart, entry.data, theme()); }).observe(plot);
      figure.classList.add('live');
    }
    const option = kind.option(entry.data, t);
    if (!animate) option.animation = false;
    entry.chart.setOption(option, true);
    entry.chart.setOption({ aria: { enabled: true, label: { description: figure.querySelector('.chart-plot').getAttribute('aria-label') } } });
    kind.decorate?.(entry.chart, entry.data, t);
    charts.set(figure, entry);
  }

  function load() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'assets/js/echarts.min.js';
      s.onload = () => resolve(window.echarts);
      s.onerror = reject;
      document.head.append(s);
    });
  }

  const seen = new IntersectionObserver(async entries => {
    const visible = entries.filter(e => e.isIntersecting).map(e => e.target);
    if (!visible.length) return;
    visible.forEach(f => seen.unobserve(f));
    try {
      library ??= await load();
      for (const f of visible) await render(f, true);
    } catch (e) {
      // The static SVG stays in place; nothing else depends on the chart.
    }
  }, { rootMargin: '300px 0px' });
  figures.forEach(f => seen.observe(f));

  // The theme toggle flips data-theme on <html>; redraw in the new colours without replaying the entrance.
  new MutationObserver(() => {
    for (const f of charts.keys()) render(f, false);
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();
