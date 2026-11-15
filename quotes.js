// Header quote: types out a random quote, terminal style. Click it for the next one.
(function () {
  const QUOTES = [
    ['Ipsa scientia potestas est. (Knowledge itself is power.)', 'Francis Bacon, 1597'],
    ['If I have seen further it is by standing on the shoulders of Giants.', 'Isaac Newton, 1675'],
    ['Nothing in biology makes sense except in the light of evolution.', 'Theodosius Dobzhansky, 1973'],
    ['The first principle is that you must not fool yourself, and you are the easiest person to fool.', 'Richard Feynman, 1974'],
    ['In the fields of observation, chance favors only the prepared mind.', 'Louis Pasteur, 1854'],
    ['Omnis cellula e cellula. (Every cell from a cell.)', 'Rudolf Virchow, 1855'],
  ];
  const el = document.getElementById('quote');
  if (!el) return;
  const textEl = el.querySelector('.q-text');
  const whoEl = el.querySelector('.q-who');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = Math.floor(Math.random() * QUOTES.length);
  let timer = null;

  function show(n) {
    clearTimeout(timer);
    const [text, who] = QUOTES[n];
    el.setAttribute('aria-label', text + ' ' + who);
    whoEl.textContent = '';
    if (reduce) { textEl.textContent = text; whoEl.textContent = '// ' + who; return; }
    let k = 0;
    textEl.textContent = '';
    (function tick() {
      textEl.textContent = text.slice(0, ++k);
      if (k < text.length) timer = setTimeout(tick, 28);
      else whoEl.textContent = '// ' + who;
    })();
  }

  el.addEventListener('click', () => { i = (i + 1) % QUOTES.length; show(i); });
  show(i);
})();
