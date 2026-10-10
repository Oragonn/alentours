// Accès à localStorage protégé : le site fonctionne même si le stockage est
// indisponible (navigation privée, stockage plein ou bloqué).

export function load(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadJson(key, fallback = null) {
  const raw = load(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  return save(key, JSON.stringify(value));
}
