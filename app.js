(() => {
  const root = document.documentElement;
  document.getElementById('theme').addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    readColors();
    if (still) draw();
  });

  const canvas = document.getElementById('queue');
  const ctx = canvas.getContext('2d');
  const kill = document.getElementById('kill');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = id => document.getElementById('c-' + id);
  const status = document.getElementById('status');
  const shown = {};
  const out = { received: el('received'), delivered: el('delivered'), retries: el('retries'), parked: el('parked'), lost: el('lost') };

  // Positions are fractions of the canvas, so a resize never strands a message.
  const Q_IN = 0.06, Q_HEAD = 0.42, WORKER = 0.58, END = 1.01, MAIN = 0.30, RETRY = 0.60, DEAD = 0.84, PARK = 0.86;
  const ARRIVE_MS = 340, SERVICE_MS = 190, FAIL = 0.26, MAX_TRIES = 4, BACKOFF_MS = 900, DOWN_MS = 4000, REPLAY_MS = 7000, POISON_EVERY = 25;

  let W = 0, H = 0, colors = {};
  let clock = 0, arriveAt = 0, serveAt = 0, replayAt = REPLAY_MS, downUntil = 0, busy = false;
  const stats = { received: 0, delivered: 0, retries: 0 };
  const alive = new Set(), queue = [], parked = [];

  function readColors() {
    const s = getComputedStyle(root);
    for (const k of ['lane', 'muted', 'text', 'accent', 'ok', 'bad', 'flow']) colors[k] = s.getPropertyValue('--' + k).trim();
  }

  function size() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (still) draw();
  }

  function go(m, points, ms, done) {
    m.from = [m.x, m.y]; m.points = points; m.leg = 0; m.start = clock; m.ms = ms; m.done = done;
    const all = [m.from, ...points];
    m.lengths = all.slice(1).map((p, i) => Math.hypot((p[0] - all[i][0]) * W, (p[1] - all[i][1]) * H) || 1);
    m.total = m.lengths.reduce((a, b) => a + b, 0);
  }

  function move(m) {
    const t = Math.min((clock - m.start) / m.ms, 1);
    let d = t * m.total, a = m.from;
    for (let i = 0; i < m.points.length; i++) {
      const b = m.points[i], len = m.lengths[i];
      if (d <= len || i === m.points.length - 1) {
        const f = Math.min(d / len, 1);
        m.x = a[0] + (b[0] - a[0]) * f; m.y = a[1] + (b[1] - a[1]) * f;
        break;
      }
      d -= len; a = b;
    }
    if (t >= 1) { const done = m.done; m.points = null; done && done(); }
  }

  function arrive() {
    stats.received++;
    const m = { x: -0.01, y: MAIN, tries: 0, poison: stats.received % POISON_EVERY === 0, tint: 'flow', points: null };
    alive.add(m);
    go(m, [[Q_IN, MAIN]], 180, () => { queue.push(m); });
  }

  function slot(i) {
    const rows = 5, col = Math.floor(i / rows), row = i % rows;
    const x = Math.max(Q_HEAD - (col * 10) / W, Q_IN);
    return [x, MAIN + ((row - 2) * 9) / H];
  }

  function handle(m) {
    busy = false;
    if (clock < downUntil) { queue.unshift(m); return; } // The worker died mid-job, so the lease runs out and the message goes back.
    if (m.poison || Math.random() < FAIL) {
      m.tries++;
      if (m.tries >= MAX_TRIES) {
        m.tint = 'bad';
        go(m, [[WORKER, DEAD], [PARK, DEAD]], 700, () => { parked.push(m); });
      } else {
        stats.retries++;
        m.tint = 'accent';
        go(m, [[WORKER, RETRY], [Q_HEAD - 0.2, RETRY], [Q_HEAD - 0.2, MAIN + 0.1]], BACKOFF_MS * 2 ** (m.tries - 1), () => { queue.push(m); });
      }
    } else {
      m.tint = 'ok';
      go(m, [[END, MAIN]], 520, () => { stats.delivered++; alive.delete(m); });
    }
  }

  function step(dt) {
    clock += dt;
    if (clock >= arriveAt) { arrive(); arriveAt = clock + ARRIVE_MS * (0.7 + Math.random() * 0.6); }
    const up = clock >= downUntil;
    if (up && !busy && clock >= serveAt && queue.length) {
      const m = queue.shift();
      busy = true; serveAt = clock + SERVICE_MS;
      go(m, [[WORKER, MAIN]], 130, () => handle(m));
    }
    if (clock >= replayAt) {
      replayAt = clock + REPLAY_MS;
      const m = parked.shift();
      if (m) {
        m.poison = false; m.tries = 0; m.tint = 'bad';
        go(m, [[0.1, DEAD], [0.1, MAIN + 0.1]], 1500, () => { m.tint = 'flow'; queue.push(m); });
      }
    }
    for (const m of alive) if (m.points) move(m);
    queue.forEach((m, i) => { const [x, y] = slot(i); m.x += (x - m.x) * 0.25; m.y += (y - m.y) * 0.25; });
    parked.forEach((m, i) => { m.x = PARK + (i * 10) / W; m.y = DEAD; });
  }

  function line(points, color, dash) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash || []);
    points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * W, y * H));
    ctx.stroke(); ctx.setLineDash([]);
  }

  function label(text, x, y, align, color) {
    ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color || colors.muted;
    ctx.fillText(text, x * W, y * H);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const up = clock >= downUntil, narrow = W < 520;
    line([[0, MAIN], [1, MAIN]], colors.lane);
    line([[WORKER, MAIN], [WORKER, RETRY], [Q_HEAD - 0.2, RETRY], [Q_HEAD - 0.2, MAIN + 0.1]], colors.lane, [3, 4]);
    line([[WORKER, RETRY], [WORKER, DEAD], [PARK, DEAD]], colors.lane, [3, 4]);
    line([[PARK, DEAD], [0.1, DEAD], [0.1, MAIN + 0.1]], colors.lane, [1, 5]);

    label('queue', Q_IN, 0.13, 'left');
    label(up ? 'worker' : 'worker down', WORKER, 0.13, 'center', up ? colors.muted : colors.bad);
    label('delivered', 0.985, 0.13, 'right');
    label(narrow ? 'retry' : 'retry with growing delay', (Q_HEAD - 0.17), RETRY - 0.035, 'left', colors.accent);
    label('set aside', 0.985, DEAD - 0.06, 'right', colors.bad);
    if (!narrow) label('replay', 0.12, DEAD - 0.035, 'left');

    const s = 22, wx = WORKER * W - s / 2, wy = MAIN * H - s / 2;
    ctx.fillStyle = up ? colors.text : colors.bad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(wx, wy, s, s, 4); else ctx.rect(wx, wy, s, s);
    ctx.fill();

    for (const m of alive) {
      const x = m.x * W, y = m.y * H;
      if (m.points && m.px !== undefined) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = colors[m.tint]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (x - m.px) * 5, y - (y - m.py) * 5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      m.px = x; m.py = y;
      ctx.fillStyle = colors[m.tint];
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    }
  }

  function show(key, value) {
    if (shown[key] !== value) { shown[key] = value; out[key].textContent = value; }
  }

  function report() {
    show('received', stats.received.toLocaleString('en-US'));
    show('delivered', stats.delivered.toLocaleString('en-US'));
    show('retries', stats.retries.toLocaleString('en-US'));
    show('parked', String(parked.length));
    show('lost', String(stats.received - stats.delivered - alive.size));
  }

  function button() {
    const waiting = kill.getAttribute('aria-disabled') === 'true';
    if (clock < downUntil) {
      const text = 'Worker down, restarting in ' + Math.ceil((downUntil - clock) / 1000) + 's';
      if (kill.textContent !== text) kill.textContent = text;
    } else if (waiting) {
      kill.removeAttribute('aria-disabled');
      kill.textContent = 'Stop the worker';
      status.textContent = 'The worker is back and is clearing the queue. Messages lost: ' + shown.lost + '.';
    }
  }

  readColors();
  size();
  new ResizeObserver(size).observe(canvas);

  if (still) {
    // No animation here: each press jumps straight to the result of that action.
    const advance = ms => { for (let t = 0; t < ms; t += 16) step(16); draw(); report(); };
    advance(19000);
    kill.addEventListener('click', () => {
      const stopping = clock >= downUntil;
      downUntil = stopping ? Infinity : clock;
      advance(stopping ? 4000 : 8000);
      kill.textContent = stopping ? 'Restart the worker' : 'Stop the worker';
      status.textContent = stopping ? 'The worker is down. New messages are waiting in the queue.' : 'The worker is back and has cleared the queue. Messages lost: ' + shown.lost + '.';
    });
    return;
  }

  kill.addEventListener('click', () => {
    if (kill.getAttribute('aria-disabled') === 'true') return;
    downUntil = clock + DOWN_MS;
    kill.setAttribute('aria-disabled', 'true');
    status.textContent = 'The worker is down. New messages are waiting in the queue.';
    button();
  });

  let visible = true, last = 0;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(canvas);
  function frame(t) {
    const dt = Math.min(t - last, 50); last = t;
    if (visible && !document.hidden) { step(dt); draw(); report(); button(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(t => { last = t; frame(t); });
})();
