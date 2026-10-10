// Noms des communes sur la carte (fonctions pures, testées avec Node).

/** Population minimale pour afficher un nom à ce niveau de zoom. */
export function labelMinPopulation(zoom, steps) {
  for (const [maxZoom, minPopulation] of steps) {
    if (zoom <= maxZoom) return minPopulation;
  }
  return 0;
}

/**
 * Choisit les noms à afficher sans chevauchement. Les communes les plus
 * peuplées passent en premier.
 *
 * items : [{ code, name, x, y, r, population }] (x, y en pixels à l'écran ;
 *         r = rayon du point). Le nom est placé à droite du point.
 * Renvoie les éléments retenus, avec leur rectangle { left, top, width, height }.
 */
export function placeLabels(items, { width, height, maxCount = 250, charWidth = 6.8, lineHeight = 16, gap = 3 }) {
  const sorted = [...items].sort((a, b) => (b.population ?? -1) - (a.population ?? -1));
  const placed = [];
  for (const it of sorted) {
    if (placed.length >= maxCount) break;
    const box = {
      left: it.x + it.r + gap,
      top: it.y - lineHeight / 2,
      width: it.name.length * charWidth + 6,
      height: lineHeight,
    };
    if (box.left + box.width < 0 || box.left > width || box.top + box.height < 0 || box.top > height) continue;
    const overlaps = placed.some(
      (p) =>
        box.left < p.box.left + p.box.width + gap &&
        p.box.left < box.left + box.width + gap &&
        box.top < p.box.top + p.box.height &&
        p.box.top < box.top + box.height
    );
    if (!overlaps) placed.push({ ...it, box });
  }
  return placed;
}
