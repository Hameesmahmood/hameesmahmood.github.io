// Terminal demos. A project figure with a recording gets two tabs, Results and Watch it run. The
// player (asciinema) loads the first time someone opens a demo, and plays a real recorded run as
// text, in the site's mono face and colours. Without JavaScript the tabs stay hidden and the chart
// shows as before.
(() => {
  const figures = [...document.querySelectorAll('figure[data-demo]')];
  if (!figures.length) return;

  let player;
  function load() {
    player ??= new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'assets/css/asciinema-player.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = 'assets/js/asciinema-player.min.js';
      s.onload = () => resolve(window.AsciinemaPlayer);
      s.onerror = reject;
      document.head.append(s);
    });
    return player;
  }

  for (const figure of figures) {
    const tabs = [...figure.querySelectorAll('[role="tab"]')];
    const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
    const mount = figure.querySelector('.demo-player');
    let created;

    async function select(i, focus) {
      tabs.forEach((t, j) => {
        t.setAttribute('aria-selected', String(i === j));
        t.tabIndex = i === j ? 0 : -1;
        panels[j].hidden = i !== j;
      });
      if (focus) tabs[i].focus();
      if (panels[i].contains(mount) && !created) {
        created = true;
        try {
          const AsciinemaPlayer = await load();
          mount.replaceChildren();
          AsciinemaPlayer.create(figure.dataset.demo, mount, {
            autoPlay: true,
            fit: 'width',
            theme: 'site',
            terminalFontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim(),
            terminalLineHeight: 1.4,
            controls: true,
          });
        } catch (e) {
          created = false;
          mount.textContent = 'The demo player could not load. The recording is linked below.';
        }
      }
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, false));
      tab.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        select((i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true);
      });
    });
    figure.classList.add('has-demo');
  }
})();
