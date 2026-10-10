// Rendu des lignes de résultats, de la fiche commune, des favoris et de la
// version imprimable.

import { h } from './dom.js';
import { density, departementLabel, sizeCategoryOf } from '../lib/commune.js';
import { formatKm, formatNumber, NBSP } from '../lib/text.js';
import { populationTrend, priceInfo, trendText } from '../lib/insights.js';

const NA = 'Non disponible';

export function populationText(population) {
  return Number.isFinite(population) ? `${formatNumber(population)}${NBSP}hab.` : 'Population inconnue';
}

/** « 11,2 km » ou, avec plusieurs points, « Lille 14,2 km · Arras 18,9 km » */
export function distanceText(result, pointNames) {
  if (!result) return null;
  if (pointNames.length > 1) {
    return result.distances.map((d, i) => `${pointNames[i]} ${formatKm(d)}`).join(' · ');
  }
  return formatKm(result.distance);
}

export function badge(population) {
  const cat = sizeCategoryOf(population);
  return h('span', { class: `badge cat-${cat.id}` }, cat.label);
}

export function starButton(isFav, name, onClick) {
  return h(
    'button',
    {
      type: 'button',
      class: 'star-btn',
      'aria-pressed': String(isFav),
      'aria-label': `${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${name}`,
      title: isFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
      onclick: onClick,
    },
    isFav ? '★' : '☆'
  );
}

/** Ligne de la liste des résultats */
export function resultRow(result, { pointNames, selected, isFav, onOpen, onToggleFav }) {
  const c = result.commune;
  const meta = `${populationText(c.population)} · ${distanceText(result, pointNames)}`;
  return h(
    'li',
    { class: selected ? 'selected' : null, dataset: { code: c.code } },
    h(
      'button',
      {
        type: 'button',
        class: 'result',
        'aria-current': selected ? 'true' : null,
        onclick: () => onOpen(c.code),
      },
      h('span', { class: 'r-name' }, c.nom, ' ', h('span', { class: 'r-dep' }, `(${c.dep})`)),
      h('span', { class: 'r-meta' }, meta),
      badge(c.population)
    ),
    starButton(isFav, c.nom, () => onToggleFav(c.code))
  );
}

function sparkline(points) {
  const w = 160;
  const hgt = 36;
  const xs = points.map((p) => p.year);
  const ys = points.map((p) => p.value);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sx = (x) => (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * (w - 6) + 3);
  const sy = (y) => (maxY === minY ? hgt / 2 : hgt - 3 - ((y - minY) / (maxY - minY)) * (hgt - 6));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('width', w);
  svg.setAttribute('height', hgt);
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Population de ${points[0].year} à ${points[points.length - 1].year} : ` +
      points.map((p) => `${p.year} ${formatNumber(p.value)}`).join(', ')
  );
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  const last = points[points.length - 1];
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', sx(last.year));
  dot.setAttribute('cy', sy(last.value));
  dot.setAttribute('r', '3');
  dot.setAttribute('fill', 'currentColor');
  svg.append(dot);
  return svg;
}

function trendCell(insights, code) {
  if (!insights.trend) return h('span', { class: 'muted' }, insights.trendLoaded ? NA : 'Chargement…');
  const series = insights.trend.get(code);
  const trend = populationTrend(series);
  if (!trend) return h('span', { class: 'muted' }, NA);
  const cls = trend.kind === 'up' ? 'trend-up' : trend.kind === 'down' ? 'trend-down' : '';
  const frag = document.createDocumentFragment();
  frag.append(h('span', { class: cls }, trend.label));
  if (trend.points.length >= 3) frag.append(sparkline(trend.points));
  return frag;
}

function priceCell(insights, commune) {
  if (!insights.prices) return h('span', { class: 'muted' }, insights.pricesLoaded ? NA : 'Chargement…');
  const info = priceInfo(insights.prices.get(commune.code), commune.dep, insights.pricesMeta);
  const frag = document.createDocumentFragment();
  frag.append(h('span', { class: info.status === 'ok' ? null : 'muted' }, info.label));
  frag.append(
    h(
      'span',
      { class: 'source' },
      'Source : ',
      h(
        'a',
        { href: insights.pricesMeta?.url ?? 'https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres/', target: '_blank', rel: 'noopener' },
        'DVF, data.gouv.fr'
      ),
      insights.pricesMeta?.periode ? ` (${insights.pricesMeta.periode})` : ''
    )
  );
  return frag;
}

/** Contenu de la fiche commune */
export function detailsContent(commune, { data, result, pointNames, isFav, insights, onClose, onToggleFav, onSearchAround }) {
  const value = (v) => (v == null || v === '' ? h('span', { class: 'muted' }, NA) : v);
  const dens = density(commune.population, commune.surface);
  const cps = commune.codesPostaux ?? [];
  const depName = data.departements[commune.dep];
  const wikiQuery = depName ? `${commune.nom} (${depName})` : commune.nom;

  const facts = [
    ['Population', Number.isFinite(commune.population) ? `${formatNumber(commune.population)} habitants` : null],
    ['Distance', distanceText(result, pointNames)],
    ['Département', commune.dep ? departementLabel(commune.dep, data.departements) : null],
    ['Région', data.regions[commune.reg] ?? null],
    [cps.length > 1 ? 'Codes postaux' : 'Code postal', cps.length ? cps.join(', ') : null],
    ['Catégorie', badge(commune.population)],
    ['Superficie', Number.isFinite(commune.surface) ? `${formatNumber(commune.surface, 1)}${NBSP}km²` : null],
    ['Densité', dens != null ? `${formatNumber(dens)}${NBSP}hab./km²` : null],
    ['Tendance démographique', trendCell(insights, commune.code)],
    ['Prix médian au m²', priceCell(insights, commune)],
  ];

  return [
    h(
      'div',
      { class: 'details-head' },
      h('div', {}, h('h2', { id: 'details-title' }, commune.nom), h('p', { class: 'details-sub' }, `Code INSEE ${commune.code}`)),
      h('button', { type: 'button', class: 'btn btn-icon details-close', 'aria-label': 'Fermer', title: 'Fermer', onclick: onClose }, '✕')
    ),
    h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, value(v))])),
    h(
      'div',
      { class: 'details-links' },
      h(
        'a',
        {
          class: 'btn btn-secondary',
          href: `https://www.google.com/maps/search/?api=1&query=${commune.lat},${commune.lon}`,
          target: '_blank',
          rel: 'noopener',
        },
        'Google Maps'
      ),
      h(
        'a',
        {
          class: 'btn btn-secondary',
          href: `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(wikiQuery)}`,
          target: '_blank',
          rel: 'noopener',
        },
        'Wikipédia'
      )
    ),
    h(
      'button',
      {
        type: 'button',
        class: `btn ${isFav ? 'btn-secondary' : 'btn-primary'} details-fav`,
        'aria-pressed': String(isFav),
        onclick: onToggleFav,
      },
      isFav ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'
    ),
    h(
      'button',
      { type: 'button', class: 'btn btn-secondary details-around', onclick: onSearchAround },
      `Chercher autour de ${commune.nom}`
    ),
  ];
}

/** Élément de la liste des favoris */
export function favoriteRow(item, commune, { data, onOpen, onRemove, onNote, selected, selectDisabled, onSelect, onSearchAround }) {
  const noteId = `note-${item.code}`;
  const sub = commune
    ? `${departementLabel(commune.dep, data.departements)} · ${populationText(commune.population)}`
    : 'Commune introuvable dans les données';
  let timer = null;
  return h(
    'li',
    { dataset: { code: item.code } },
    h(
      'div',
      { class: 'fav-head' },
      h(
        'button',
        { type: 'button', class: 'result', onclick: () => commune && onOpen(item.code), disabled: !commune },
        h('span', { class: 'r-name' }, commune?.nom ?? item.nom),
        h('span', { class: 'r-meta' }, sub),
        commune ? badge(commune.population) : null
      ),
      starButton(true, commune?.nom ?? item.nom, () => onRemove(item.code))
    ),
    h(
      'div',
      { class: 'fav-note' },
      h('label', { for: noteId }, 'Note personnelle'),
      h('textarea', {
        id: noteId,
        rows: 2,
        placeholder: 'Ex. : marché le samedi, gare TER…',
        oninput: (e) => {
          clearTimeout(timer);
          const text = e.target.value;
          timer = setTimeout(() => onNote(item.code, text), 300);
        },
        onblur: (e) => {
          clearTimeout(timer);
          onNote(item.code, e.target.value);
        },
      })
    ),
    commune
      ? h(
          'div',
          { class: 'fav-actions' },
          h(
            'label',
            { class: 'fav-compare' },
            h('input', {
              type: 'checkbox',
              checked: selected,
              disabled: selectDisabled && !selected,
              onchange: (e) => onSelect(item.code, e.target.checked),
            }),
            ' Comparer'
          ),
          h(
            'button',
            { type: 'button', class: 'btn btn-ghost', onclick: () => onSearchAround(item.code) },
            'Chercher autour'
          )
        )
      : null
  );
}

/** Tableau de comparaison (modèle fourni par lib/compare.js) */
export function comparisonTableElement({ columns, rows }) {
  return h(
    'table',
    { class: 'compare-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Critère')),
        columns.map((c) => h('th', { scope: 'col' }, c.nom, ' ', h('span', { class: 'r-dep' }, `(${c.dep})`)))
      )
    ),
    h(
      'tbody',
      {},
      rows.map((row) =>
        h(
          'tr',
          { class: row.key === 'note' ? 'compare-note' : null },
          h('th', { scope: 'row' }, row.label),
          row.cells.map((cell, i) =>
            row.best.includes(i)
              ? h('td', { class: 'best' }, cell.text, h('span', { class: 'visually-hidden' }, ' (meilleure valeur)'))
              : h('td', {}, cell.text)
          )
        )
      )
    )
  );
}

/** Version imprimable des favoris : une fiche par commune, avec la note. */
export function favoritesPrintContent({ appName, items, data, insights, pointNames }) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const cards = items.map(({ fav, commune, result }) => {
    const dens = density(commune.population, commune.surface);
    const facts = [
      ['Population', Number.isFinite(commune.population) ? `${formatNumber(commune.population)} habitants` : NA],
      ['Catégorie', sizeCategoryOf(commune.population).label],
      ['Superficie', Number.isFinite(commune.surface) ? `${formatNumber(commune.surface, 1)}${NBSP}km²` : NA],
      ['Densité', dens != null ? `${formatNumber(dens)}${NBSP}hab./km²` : NA],
    ];
    if (insights.trend) facts.push(['Tendance', trendText(insights.trend.get(commune.code))]);
    if (insights.prices) facts.push(['Prix médian au m²', priceInfo(insights.prices.get(commune.code), commune.dep, insights.pricesMeta).label]);
    if (result) facts.push(['Distance', distanceText(result, pointNames)]);
    return h(
      'article',
      { class: 'print-fav' },
      h('h2', {}, `${commune.nom} (${commune.dep})`),
      h('p', { class: 'print-fav-sub' }, `${departementLabel(commune.dep, data.departements)} · ${data.regions[commune.reg] ?? ''} · code postal ${commune.codesPostaux.join(', ')}`),
      h('dl', {}, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('p', { class: 'print-fav-note' }, h('strong', {}, 'Note : '), fav.note || '—')
    );
  });
  return [
    h('h1', {}, `${appName} — mes favoris`),
    h('p', { class: 'print-meta' }, `${items.length} ${items.length > 1 ? 'communes' : 'commune'} · imprimé le ${date} · Données : INSEE / geo.api.gouv.fr`),
    ...cards,
  ];
}

/** Version imprimable : titre, résumé, date et tableau complet */
export function printContent({ appName, summary, results, data, pointNames, insights }) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const multi = pointNames.length > 1;
  const headers = [
    ['Nom'],
    ['Dép.'],
    ['Population', 'num'],
    [multi ? 'Distances' : 'Distance', multi ? null : 'num'],
    ['Catégorie'],
    ['Superficie', 'num'],
    ['Densité', 'num'],
  ];
  if (insights.trend) headers.push(['Tendance']);
  const rows = results.map((r) => {
    const c = r.commune;
    const dens = density(c.population, c.surface);
    const cells = [
      [c.nom],
      [c.dep],
      [Number.isFinite(c.population) ? formatNumber(c.population) : '—', 'num'],
      [distanceText(r, pointNames), multi ? null : 'num'],
      [sizeCategoryOf(c.population).label],
      [Number.isFinite(c.surface) ? `${formatNumber(c.surface, 1)}${NBSP}km²` : '—', 'num'],
      [dens != null ? formatNumber(dens) : '—', 'num'],
    ];
    if (insights.trend) cells.push([trendText(insights.trend.get(c.code))]);
    return h('tr', {}, cells.map(([text, cls]) => h('td', { class: cls }, text)));
  });
  return [
    h('h1', {}, `${appName} — résultats`),
    h('p', { class: 'print-summary' }, summary),
    h('p', { class: 'print-meta' }, `Imprimé le ${date} · Données : INSEE / geo.api.gouv.fr`),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, headers.map(([text, cls]) => h('th', { class: cls, scope: 'col' }, text)))),
      h('tbody', {}, rows)
    ),
  ];
}
