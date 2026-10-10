// Arrondissements municipaux de Paris, Lyon et Marseille → code INSEE de la
// commune. Certaines sources ne donnent que les arrondissements.
export const ARRONDISSEMENTS = [
  [/^751(0[1-9]|1[0-9]|20)$/, '75056'],
  [/^6938[1-9]$/, '69123'],
  [/^132(0[1-9]|1[0-6])$/, '13055'],
];

export const isArrondissement = (code) => ARRONDISSEMENTS.some(([re]) => re.test(code));
