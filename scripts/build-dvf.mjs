// Télécharge les statistiques DVF agrégées (data.gouv.fr, jeu « Statistiques
// DVF ») et écrit data/prix.json : prix médian au m² et nombre de ventes,
// maisons et appartements, par commune, sur toute la période disponible.
//
// Usage : node scripts/build-dvf.mjs
// Les fichiers DVF bruts sont énormes : on n'utilise que les agrégats.
// DVF ne couvre pas l'Alsace-Moselle (57, 67, 68) ni Mayotte (976).

import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ARRONDISSEMENTS } from './lib/arrondissements.mjs';

const DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/statistiques-dvf/';
const DATASET_PAGE = 'https://www.data.gouv.fr/fr/datasets/statistiques-dvf/';
const FALLBACK_WHOLE = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/dvf/stats_whole_period.csv';
const FALLBACK_MONTHLY = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/dvf/stats_dvf.csv';
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const FIELDS = ['prixMaison', 'ventesMaison', 'prixAppartement', 'ventesAppartement'];

/** Découpe une ligne CSV (virgules, guillemets doubles). */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function resourceUrls() {
  try {
    const res = await fetch(DATASET_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const find = (re) => json.resources.find((r) => re.test(r.url))?.url;
    return {
      whole: find(/stats_whole_period\.csv$/) ?? FALLBACK_WHOLE,
      monthly: find(/stats_dvf\.csv$/) ?? FALLBACK_MONTHLY,
    };
  } catch (err) {
    console.warn(`API data.gouv.fr indisponible (${err.message}), URL par défaut utilisée`);
    return { whole: FALLBACK_WHOLE, monthly: FALLBACK_MONTHLY };
  }
}

/** Premier et dernier mois couverts, lus aux deux bouts du fichier mensuel. */
async function period(monthlyUrl) {
  const months = async (range) => {
    const res = await fetch(monthlyUrl, { headers: { Range: range } });
    if (!res.ok) return [];
    return (await res.text()).match(/\b(19|20)\d{2}-(0[1-9]|1[0-2])\b/g) ?? [];
  };
  try {
    const all = [...(await months('bytes=0-4000')), ...(await months('bytes=-4000'))].sort();
    if (!all.length) return null;
    return { debut: all[0], fin: all[all.length - 1] };
  } catch {
    return null;
  }
}

const num = (s) => (s === '' || s == null ? null : Number(s));

async function main() {
  const urls = await resourceUrls();
  const dates = await period(urls.monthly);
  console.log(`Téléchargement : ${urls.whole}`);
  const res = await fetch(urls.whole);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Colonne absente : ${name}`);
    return i;
  };
  const iCode = col('code_geo');
  const iScale = col('echelle_geo');
  const iVm = col('nb_ventes_whole_maison');
  const iPm = col('med_prix_m2_whole_maison');
  const iVa = col('nb_ventes_whole_appartement');
  const iPa = col('med_prix_m2_whole_appartement');

  const rows = new Map();
  for (const line of lines.slice(1)) {
    if (!line || !line.includes(',commune,')) continue;
    const c = parseCsvLine(line);
    if (c[iScale] !== 'commune') continue;
    rows.set(c[iCode], {
      maison: { prix: num(c[iPm]), ventes: num(c[iVm]) ?? 0 },
      appartement: { prix: num(c[iPa]), ventes: num(c[iVa]) ?? 0 },
    });
  }

  // Paris, Lyon, Marseille : DVF ne donne que les arrondissements. Le prix
  // de la commune est la moyenne des médianes, pondérée par les ventes.
  for (const [re, commune] of ARRONDISSEMENTS) {
    const parts = [...rows].filter(([code]) => re.test(code)).map(([, r]) => r);
    if (!parts.length) continue;
    const combine = (type) => {
      const withPrice = parts.filter((p) => p[type].prix != null && p[type].ventes > 0);
      const ventes = parts.reduce((s, p) => s + p[type].ventes, 0);
      const w = withPrice.reduce((s, p) => s + p[type].ventes, 0);
      const prix = w ? withPrice.reduce((s, p) => s + p[type].prix * p[type].ventes, 0) / w : null;
      return { prix: prix == null ? null : Math.round(prix), ventes };
    };
    rows.set(commune, { maison: combine('maison'), appartement: combine('appartement') });
    for (const code of [...rows.keys()]) if (re.test(code)) rows.delete(code);
    console.log(`${commune} : agrégé depuis ${parts.length} arrondissements`);
  }

  const data = {};
  for (const [code, r] of rows) {
    if (!r.maison.ventes && !r.appartement.ventes) continue;
    data[code] = [r.maison.prix, r.maison.ventes, r.appartement.prix, r.appartement.ventes];
  }

  const year = (ym) => ym?.slice(0, 4);
  const meta = {
    source: 'DVF (DGFiP), statistiques agrégées Etalab — data.gouv.fr',
    url: DATASET_PAGE,
    debut: dates?.debut ?? null,
    fin: dates?.fin ?? null,
    periode: dates ? (year(dates.debut) === year(dates.fin) ? year(dates.fin) : `${year(dates.debut)}–${year(dates.fin)}`) : null,
    generated: new Date().toISOString().slice(0, 10),
    note: 'Paris, Lyon et Marseille : moyenne des médianes des arrondissements pondérée par le nombre de ventes.',
  };
  const body = Object.entries(data)
    .map(([code, v]) => `${JSON.stringify(code)}:${JSON.stringify(v)}`)
    .join(',\n');
  const json = `{"meta":${JSON.stringify(meta)},"fields":${JSON.stringify(FIELDS)},"data":{\n${body}\n}}\n`;
  await writeFile(join(DATA_DIR, 'prix.json'), json);
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;
  console.log(`Période : ${meta.periode ?? 'inconnue'} (${meta.debut} → ${meta.fin})`);
  console.log(`${Object.keys(data).length} communes écrites dans data/prix.json`);
  console.log(`Taille : ${mb(Buffer.byteLength(json))} brut, ${mb(gzipSync(json).length)} gzip`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
