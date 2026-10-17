// Rendu des lignes de résultats, de la fiche commune, des favoris et de la
// version imprimable.

import { h } from './dom.js';
import { density, departementLabel, sizeCategoryOf } from '../lib/commune.js';
import { formatKm, formatMinutes, formatNumber, NBSP } from '../lib/text.js';
import { populationTrend, priceInfo, trendText } from '../lib/insights.js';
import { amenityList, amenitySummary } from '../lib/amenities.js';
import { BUDGET_STATUS_LABELS, formatEuros, PROPERTY_TYPES, priceReliability } from '../lib/budget.js';
import { STATUSES } from '../lib/favorites.js';
import { briefHasZone } from '../lib/folders.js';
import { distanceKm } from '../lib/geo.js';
import { deName } from '../lib/summary.js';

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

/** Icône de dossier (pleine si la commune est rangée dans au moins un dossier). */
function folderIcon(filled) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z');
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/** Bouton « Ajouter à un dossier » ; count = nombre de dossiers contenant la commune. */
export function folderButton(count, name, onClick) {
  const label = count
    ? `Dossiers (${count > 1 ? `dans ${count} dossiers` : 'dans 1 dossier'}) : ${name}`
    : `Ajouter à un dossier : ${name}`;
  return h(
    'button',
    {
      type: 'button',
      class: `star-btn folder-btn${count ? ' in-folder' : ''}`,
      'aria-label': label,
      'aria-haspopup': 'dialog',
      title: count ? `Dans ${count} dossier${count > 1 ? 's' : ''}` : 'Ajouter à un dossier',
      onclick: onClick,
    },
    folderIcon(count > 0)
  );
}

// Libellés courts pour la ligne de résultat
const ROW_BUDGET_LABELS = { ok: 'dans le budget', limite: 'limite (+10 %)', trop: 'au-dessus du budget' };

/** Ligne de la liste des résultats */
export function resultRow(result, { pointNames, selected, isFav, folderCount = 0, budget = null, onOpen, onToggleFav, onFolders }) {
  const c = result.commune;
  const meta = `${populationText(c.population)} · ${distanceText(result, pointNames)}`;
  // Estimation du budget sur sa propre ligne (jamais coupée)
  const budgetLine = budget
    ? h(
        'span',
        { class: `r-budget budget-chip budget-${budget.status}` },
        budget.status === 'inconnu'
          ? 'Prix inconnu'
          : `≈ ${formatEuros(budget.estimate)} · ${ROW_BUDGET_LABELS[budget.status]}`
      )
    : null;
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
      budgetLine,
      badge(c.population)
    ),
    folderButton(folderCount, c.nom, () => onFolders(c.code)),
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

function priceCell(insights, commune, budget) {
  if (!insights.prices) return h('span', { class: 'muted' }, insights.pricesLoaded ? NA : 'Chargement…');
  const entry = insights.prices.get(commune.code);
  const info = priceInfo(entry, commune.dep, insights.pricesMeta);
  const frag = document.createDocumentFragment();
  frag.append(h('span', { class: info.status === 'ok' ? null : 'muted' }, info.label));
  if (info.status === 'ok') {
    const rel = (type) => (entry?.[type]?.ventes ? priceReliability(entry[type].ventes) : null);
    const parts = ['maison', 'appartement']
      .map((t) => [t, rel(t)])
      .filter(([, r]) => r && r.id !== 'insuffisant')
      .map(([t, r]) => `${PROPERTY_TYPES[t]} : ${r.label.replace('Fiabilité ', '')}`);
    if (parts.length) frag.append(h('span', { class: 'source' }, `Fiabilité — ${parts.join(' · ')}`));
  }
  if (budget) {
    frag.append(
      h(
        'span',
        { class: `budget-line budget-${budget.status}` },
        budget.status === 'inconnu'
          ? `Budget : prix inconnu (${budget.reason ?? 'données insuffisantes'})`
          : `Estimation : ≈ ${formatEuros(budget.estimate)} — ${BUDGET_STATUS_LABELS[budget.status]}`
      )
    );
  }
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

function amenitiesCell(insights, code) {
  if (!insights.amenities) return h('span', { class: 'muted' }, insights.pricesLoaded ? NA : 'Chargement…');
  const list = amenityList(insights.amenities.get(code));
  const frag = document.createDocumentFragment();
  frag.append(list.length ? h('span', {}, list.map((a) => a.text).join(', ')) : h('span', { class: 'muted' }, 'Aucun équipement recensé'));
  frag.append(
    h(
      'span',
      { class: 'source' },
      'Source : ',
      h('a', { href: insights.amenitiesMeta?.url ?? 'https://www.insee.fr/', target: '_blank', rel: 'noopener' }, 'INSEE, BPE'),
      insights.amenitiesMeta?.annee ? ` ${insights.amenitiesMeta.annee}` : ''
    )
  );
  return frag;
}

/** Contenu de la fiche commune */
export function detailsContent(commune, { data, result, pointNames, isFav, folderCount = 0, insights, budget = null, hasPoints = false, onClose, onToggleFav, onFolders, onSearchAround }) {
  const value = (v) => (v == null || v === '' ? h('span', { class: 'muted' }, NA) : v);
  const dens = density(commune.population, commune.surface);
  const cps = commune.codesPostaux ?? [];
  const depName = data.departements[commune.dep];
  const wikiQuery = depName ? `${commune.nom} (${depName})` : commune.nom;

  const facts = [
    ['Population', Number.isFinite(commune.population) ? `${formatNumber(commune.population)} habitants` : null],
    ['Distance (vol d’oiseau)', distanceText(result, pointNames)],
    ['Trajet en voiture', hasPoints ? h('span', { id: 'travel-cell', class: 'muted' }, 'Calcul…') : null],
    ['Département', commune.dep ? departementLabel(commune.dep, data.departements) : null],
    ['Région', data.regions[commune.reg] ?? null],
    [cps.length > 1 ? 'Codes postaux' : 'Code postal', cps.length ? cps.join(', ') : null],
    ['Catégorie', badge(commune.population)],
    ['Superficie', Number.isFinite(commune.surface) ? `${formatNumber(commune.surface, 1)}${NBSP}km²` : null],
    ['Densité', dens != null ? `${formatNumber(dens)}${NBSP}hab./km²` : null],
    ['Tendance démographique', trendCell(insights, commune.code)],
    ['Prix médian au m²', priceCell(insights, commune, budget)],
    ['Équipements', amenitiesCell(insights, commune.code)],
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
      { type: 'button', class: 'btn btn-secondary details-around', 'aria-haspopup': 'dialog', onclick: onFolders },
      folderIcon(folderCount > 0),
      folderCount ? ` Dans ${folderCount} dossier${folderCount > 1 ? 's' : ''} : modifier` : ' Ajouter à un dossier'
    ),
    h(
      'button',
      { type: 'button', class: 'btn btn-secondary details-around', onclick: onSearchAround },
      `Chercher autour de ${commune.nom}`
    ),
  ];
}

/** Élément de la liste des favoris */
export function favoriteRow(item, commune, { data, folderCount = 0, onOpen, onRemove, onFolders, selected, selectDisabled, onSelect, onSearchAround }) {
  const sub = commune
    ? `${departementLabel(commune.dep, data.departements)} · ${populationText(commune.population)}`
    : 'Commune introuvable dans les données';
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
      commune ? folderButton(folderCount, commune.nom, () => onFolders(item.code)) : null,
      starButton(true, commune?.nom ?? item.nom, () => onRemove(item.code))
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
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => onSearchAround(item.code) }, 'Chercher autour')
        )
      : null
  );
}

/** Ville dans un dossier : note personnelle propre à ce dossier. */
export function folderCityRow(item, commune, { data, folderId, onOpen, onRemove, onNote, onStatus, onSearchAround }) {
  const noteId = `note-${folderId}-${item.code}`;
  const name = commune?.nom ?? item.nom;
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
        h('span', { class: 'r-name' }, name),
        h('span', { class: 'r-meta' }, sub),
        commune ? badge(commune.population) : null
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'star-btn',
          'aria-label': `Retirer du dossier : ${name}`,
          title: 'Retirer du dossier',
          onclick: () => onRemove(item.code),
        },
        '✕'
      )
    ),
    h(
      'div',
      { class: 'fav-note' },
      h('label', { for: noteId }, 'Note'),
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
            { class: 'status-select' },
            h('span', { class: 'visually-hidden' }, `Statut de ${name}`),
            h(
              'select',
              {
                class: `status-${item.statut ?? 'aucun'}`,
                onchange: (e) => onStatus(item.code, e.target.value || null),
              },
              h('option', { value: '' }, 'Sans statut'),
              Object.entries(STATUSES).map(([k, label]) => {
                const o = h('option', { value: k }, label);
                if (item.statut === k) o.selected = true;
                return o;
              })
            )
          ),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => onSearchAround(item.code) }, 'Chercher autour')
        )
      : null
  );
}

/** Fiche client affichée en tête d'un dossier */
/** « 25 km autour de Lille » */
export function briefZoneText(brief) {
  const r = brief?.zoneRayon ? `${String(brief.zoneRayon).replace('.', ',')}${NBSP}km` : '';
  if (!briefHasZone(brief)) return r ? `Rayon de ${r}` : '';
  // « autour de Lille », « autour d’Arras », « autour du Havre »
  return `${r ? `${r} autour` : 'Autour'} ${deName(brief.zoneNom || brief.zoneCode)}`;
}

/** « 5 000 à 20 000 habitants », « plus de 5 000 habitants »… */
export function briefPopulationText(brief) {
  const { popMin: min, popMax: max } = brief ?? {};
  if (min && max) return `${formatNumber(min)} à ${formatNumber(max)}${NBSP}habitants`;
  if (min) return `${formatNumber(min)}${NBSP}habitants ou plus`;
  if (max) return `${formatNumber(max)}${NBSP}habitants ou moins`;
  return '';
}

/** « 30 min max en voiture » (depuis la ville de recherche) */
export function briefDriveText(brief) {
  const m = brief?.trajetMax;
  if (!m) return '';
  return `${formatMinutes(m)} max en voiture${briefHasZone(brief) ? ` depuis ${brief.zoneNom || brief.zoneCode}` : ''}`;
}

export function briefCard(brief) {
  if (!brief)
    return h('p', { class: 'hint' }, 'Pas encore de fiche client : zone, population, trajet, budget, type de bien, lieux importants, critères…');
  const rows = [
    ['Client', brief.client],
    ['Zone', briefZoneText(brief)],
    ['Population', briefPopulationText(brief)],
    ['Trajet', briefDriveText(brief)],
    ['Budget', brief.budget ? `${formatNumber(brief.budget)}${NBSP}€` : ''],
    ['Bien', [brief.type ? PROPERTY_TYPES[brief.type] : '', brief.surface ? `${brief.surface}${NBSP}m²` : ''].filter(Boolean).join(', ')],
    ['Lieux importants', brief.travail],
    ['Critères', brief.criteres],
  ].filter(([, v]) => v);
  return h('dl', { class: 'facts brief-facts' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

/** Ligne de la liste des dossiers */
/** Confirmation de suppression dans la page (Échap = annuler) */
export function deleteConfirm(message, { onConfirm, onCancel, confirmLabel = 'Supprimer' }) {
  return h(
    'div',
    {
      class: 'delete-confirm',
      role: 'group',
      'aria-label': 'Confirmer la suppression',
      onkeydown: (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      },
    },
    h('p', {}, message),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-danger', onclick: onConfirm }, confirmLabel),
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: onCancel }, 'Annuler')
    )
  );
}

export function folderRow(folder, count, { onOpen, onDelete, confirm = null }) {
  if (confirm) return h('li', { dataset: { id: folder.id } }, confirm);
  return h(
    'li',
    { dataset: { id: folder.id }, class: 'folder-line' },
    h(
      'button',
      { type: 'button', class: 'result folder-row', onclick: () => onOpen(folder.id) },
      h('span', { class: 'r-name' }, folderIcon(true), ' ', folder.nom),
      h('span', { class: 'r-meta' }, count ? `${count} commune${count > 1 ? 's' : ''}` : 'Vide'),
      h('span', { class: 'folder-chevron', 'aria-hidden': 'true' }, '›')
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'star-btn',
        'aria-label': `Supprimer le dossier : ${folder.nom}`,
        title: 'Supprimer le dossier',
        onclick: () => onDelete(folder.id),
      },
      '✕'
    )
  );
}

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

/** Dossier à la corbeille : restaurer ou effacer pour de bon */
export function trashRow(folder, count, expiry, { onRestore, onErase, confirm = null }) {
  if (confirm) return h('li', { dataset: { id: folder.id } }, confirm);
  const days = Math.max(1, Math.ceil((expiry - Date.now()) / 86400000));
  return h(
    'li',
    { dataset: { id: folder.id }, class: 'trash-line' },
    h(
      'div',
      { class: 'trash-info' },
      h('span', { class: 'r-name' }, folderIcon(false), ' ', folder.nom),
      h(
        'span',
        { class: 'r-meta' },
        `${count ? `${count} commune${count > 1 ? 's' : ''}` : 'Vide'} · effacé le ${shortDate.format(expiry)} (${days} j)`
      )
    ),
    h(
      'div',
      { class: 'trash-actions' },
      h(
        'button',
        { type: 'button', class: 'btn btn-secondary', 'aria-label': `Restaurer le dossier : ${folder.nom}`, onclick: () => onRestore(folder.id) },
        'Restaurer'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'star-btn',
          'aria-label': `Effacer définitivement : ${folder.nom}`,
          title: 'Effacer définitivement',
          onclick: () => onErase(folder.id),
        },
        '✕'
      )
    )
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

/**
 * Version imprimable de favoris ou de dossiers : une fiche par commune.
 * sections : [{ title?, items: [{ fav, commune, result }] }] ; withNotes affiche la note.
 */
export function favoritesPrintContent({ appName, title, sections, data, insights, pointNames, withNotes = false }) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const card = ({ fav, commune, result }) => {
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
      withNotes ? h('p', { class: 'print-fav-note' }, h('strong', {}, 'Note : '), fav.note || '—') : null
    );
  };
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  return [
    h('h1', {}, `${appName} — ${title}`),
    h('p', { class: 'print-meta' }, `${total} ${total > 1 ? 'communes' : 'commune'} · imprimé le ${date} · Données : INSEE / geo.api.gouv.fr`),
    ...sections.flatMap((s) => [
      ...(s.title ? [h('h2', { class: 'print-section' }, s.title)] : []),
      ...(s.items.length ? s.items.map(card) : [h('p', {}, 'Aucune commune.')]),
    ]),
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

/**
 * Rapport client d'un dossier : fiche, zone, plan, comparaison, une fiche par
 * commune (statut, chiffres, équipements, trajet, note).
 * map : plan déjà dessiné (élément), ou null.
 * towns : [{ commune, fav, budget, travel: [{ minutes, km } | null] }]
 */
export function clientReportContent({ appName, folder, towns, excluded, points, data, insights, summary, comparison, map }) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
  const brief = folder.fiche;
  const card = ({ commune, fav, budget, travel }, i) => {
    const dens = density(commune.population, commune.surface);
    const facts = [
      ['Population', Number.isFinite(commune.population) ? `${formatNumber(commune.population)} habitants` : NA],
      ['Densité', dens != null ? `${formatNumber(dens)}${NBSP}hab./km²` : NA],
    ];
    points.forEach((p, k) => {
      const km = distanceKm(p.lat, p.lon, commune.lat, commune.lon);
      const t = travel?.[k];
      facts.push([
        points.length > 1 ? `Depuis ${p.name}` : 'Distance',
        km < 0.5
          ? 'Sur place'
          : `${formatKm(km)} à vol d’oiseau${t ? ` · ${Math.round(t.minutes)}${NBSP}min en voiture (${formatNumber(t.km, 0)}${NBSP}km)` : ''}`,
      ]);
    });
    if (insights.trend) facts.push(['Tendance', trendText(insights.trend.get(commune.code))]);
    if (insights.prices) facts.push(['Prix médian', priceInfo(insights.prices.get(commune.code), commune.dep, insights.pricesMeta).label]);
    if (budget) {
      facts.push([
        'Budget',
        budget.status === 'inconnu' ? 'Prix inconnu' : `≈ ${formatEuros(budget.estimate)} — ${BUDGET_STATUS_LABELS[budget.status]}`,
      ]);
    }
    if (insights.amenities) facts.push(['Équipements', amenitySummary(insights.amenities.get(commune.code), Object.keys(AMENITY_KEYS))]);
    return h(
      'article',
      { class: 'print-fav' },
      h('h2', {}, `${i + 1}. ${commune.nom} (${commune.dep})${fav.statut ? ` — ${STATUSES[fav.statut]}` : ''}`),
      h('p', { class: 'print-fav-sub' }, `${departementLabel(commune.dep, data.departements)} · ${data.regions[commune.reg] ?? ''}`),
      h('dl', {}, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('p', { class: 'print-fav-note' }, h('strong', {}, 'Notre avis : '), fav.note || '—')
    );
  };
  const briefRows = brief
    ? [
        ['Client', brief.client],
        ['Zone de recherche', briefZoneText(brief)],
        ['Taille des communes', briefPopulationText(brief)],
        ['Temps de trajet', briefDriveText(brief)],
        ['Budget', brief.budget ? `${formatNumber(brief.budget)}${NBSP}€` : ''],
        ['Bien recherché', [brief.type ? PROPERTY_TYPES[brief.type] : '', brief.surface ? `${brief.surface}${NBSP}m² minimum` : ''].filter(Boolean).join(', ')],
        ['Lieux importants', brief.travail],
        ['Critères', brief.criteres],
      ].filter(([, v]) => v)
    : [];
  return [
    h('h1', {}, `${appName} — Dossier de recherche`),
    h('p', { class: 'print-summary' }, `${brief?.client || folder.nom} · préparé le ${date}`),
    briefRows.length ? h('h2', { class: 'print-section' }, 'Le projet') : null,
    briefRows.length ? h('dl', { class: 'report-brief' }, briefRows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    summary ? h('h2', { class: 'print-section' }, 'La zone étudiée') : null,
    summary ? h('p', {}, summary) : null,
    map,
    comparison ? h('h2', { class: 'print-section' }, 'Comparaison des communes') : null,
    comparison,
    h('h2', { class: 'print-section' }, `Les communes (${towns.length})`),
    ...(towns.length ? towns.map(card) : [h('p', {}, 'Aucune commune dans ce dossier.')]),
    excluded ? h('p', { class: 'print-meta' }, `${excluded} commune${excluded > 1 ? 's écartées' : ' écartée'} non présentée${excluded > 1 ? 's' : ''}.`) : null,
    h(
      'p',
      { class: 'print-meta report-sources' },
      'Sources : INSEE (populations, équipements), DVF – data.gouv.fr (prix), IGN (temps de trajet). Les prix sont des médianes indicatives et ne constituent pas une estimation d’un bien.'
    ),
  ].filter(Boolean);
}

const AMENITY_KEYS = { ecoles: 1, colleges: 1, lycees: 1, creches: 1, medecins: 1, pharmacies: 1, supermarches: 1, gares: 1 };
