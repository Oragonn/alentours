// Lecture minimale d'un classeur .xlsx, sans dépendance : décompression ZIP
// (zlib de Node) et extraction des cellules d'une feuille.

import { inflateRawSync } from 'node:zlib';

/** Renvoie Map(nom de fichier → Buffer) pour une archive ZIP. */
export function unzip(buffer) {
  // Fin du répertoire central (EOCD), cherchée depuis la fin
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archive ZIP invalide');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Répertoire ZIP invalide');
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.subarray(start, start + compSize);
    files.set(name, method === 0 ? data : method === 8 ? inflateRawSync(data) : null);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

function columnIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Lit la feuille `sheetPath` (ex. 'xl/worksheets/sheet1.xml') et renvoie un
 * tableau de lignes (tableaux de valeurs : nombre, texte ou null).
 */
export function readSheet(files, sheetPath) {
  const sharedXml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = [];
  for (const m of sharedXml.matchAll(/<si>(.*?)<\/si>/gs)) {
    const text = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join('');
    shared.push(decodeXml(text));
  }
  const xml = files.get(sheetPath)?.toString('utf8');
  if (!xml) throw new Error(`Feuille absente : ${sheetPath}`);
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
    const row = [];
    for (const c of rowMatch[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const [, col, attrs, inner = ''] = c;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = null;
      if (type === 'inlineStr') {
        value = decodeXml(/<t[^>]*>(.*?)<\/t>/s.exec(inner)?.[1] ?? '');
      } else {
        const v = /<v>(.*?)<\/v>/s.exec(inner)?.[1];
        if (v != null) {
          if (type === 's') value = shared[Number(v)];
          else if (type === 'str' || type === 'e') value = decodeXml(v);
          else value = Number(v);
        }
      }
      row[columnIndex(col)] = value;
    }
    rows.push(Array.from(row, (v) => (v === undefined ? null : v)));
  }
  return rows;
}
