// Panneau coulissant sur mobile : réduit (nombre de résultats), moitié, plein écran.

const MOBILE = window.matchMedia('(max-width: 767.98px)');
const STATES = ['collapsed', 'half', 'full'];

export function createSheet({ panel, grip, handle, header, toggle, onChange, onDragStart }) {
  let state = panel.dataset.sheet || 'half';
  let suppressClick = false;

  const isMobile = () => MOBILE.matches;

  function measurePeek() {
    const peek = grip.offsetHeight + header.offsetHeight;
    if (peek > 0) panel.style.setProperty('--sheet-peek', `${peek}px`);
  }

  function updateToggle() {
    toggle.textContent = state === 'collapsed' ? 'Voir la liste' : 'Voir la carte';
    handle.setAttribute('aria-expanded', String(state !== 'collapsed'));
    handle.setAttribute(
      'aria-label',
      state === 'full' ? 'Réduire le panneau' : 'Agrandir le panneau'
    );
  }

  function setState(next) {
    if (!STATES.includes(next)) return;
    state = next;
    panel.dataset.sheet = next;
    panel.style.removeProperty('height');
    updateToggle();
    onChange?.(state);
  }

  /** Hauteur du panneau qui recouvre la carte (0 sur grand écran). */
  function coveredHeight() {
    if (!isMobile()) return 0;
    const h = { collapsed: grip.offsetHeight + header.offsetHeight, half: window.innerHeight * 0.52, full: window.innerHeight };
    return h[state] ?? 0;
  }

  /** Hauteur du panneau réduit (poignée + en-tête). */
  const peekHeight = () => grip.offsetHeight + header.offsetHeight;

  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setState(state === 'collapsed' ? 'half' : state === 'half' ? 'full' : 'collapsed');
  });

  toggle.addEventListener('click', () => setState(state === 'collapsed' ? 'half' : 'collapsed'));

  // ---- Glisser ----
  let drag = null;

  function onPointerDown(e) {
    if (!isMobile() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button') && e.target.closest('button') !== handle) return;
    drag = { startY: e.clientY, startH: panel.getBoundingClientRect().height, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) onDragStart?.();
    drag.moved = true;
    panel.classList.add('dragging');
    const min = grip.offsetHeight + header.offsetHeight;
    const max = window.innerHeight - 12;
    panel.style.height = `${Math.max(min, Math.min(max, drag.startH - dy))}px`;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = (e.clientY - drag.lastY) / dt; // px/ms, positif vers le bas
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
  }

  function onPointerUp() {
    if (!drag) return;
    const { moved, v } = drag;
    drag = null;
    panel.classList.remove('dragging');
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 350);
    const h = panel.getBoundingClientRect().height;
    const vh = window.innerHeight;
    let next;
    if (v > 0.6) next = h > vh * 0.6 ? 'half' : 'collapsed';
    else if (v < -0.6) next = h < vh * 0.4 ? 'half' : 'full';
    else {
      const snaps = { collapsed: grip.offsetHeight + header.offsetHeight, half: vh * 0.52, full: vh };
      next = Object.entries(snaps).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
    }
    setState(next);
  }

  for (const el of [grip, header]) {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }

  const ro = new ResizeObserver(measurePeek);
  ro.observe(header);
  MOBILE.addEventListener('change', () => {
    measurePeek();
    onChange?.(state);
  });
  measurePeek();
  updateToggle();

  return {
    setState,
    getState: () => state,
    isMobile,
    coveredHeight,
    peekHeight,
  };
}
