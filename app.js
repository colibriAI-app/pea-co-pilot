
// PEA Co-Pilot — bundle généré automatiquement depuis le canvas React.
// React 18 + recharts sont chargés via CDN (UMD) dans index.html.
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useMemo, useEffect } = React;
const {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, RadialBarChart, RadialBar, PolarAngleAxis,
} = window.Recharts;
const localStorage = window.localStorage;
// ================= MOTEUR =================
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simulate(p, nSims) {
  const months = p.years * 12;
  const paths = [];
  for (let s = 0; s < nSims; s++) {
    const rnd = mulberry32(1234 + s * 7919);
    let eq = p.capital0 * (p.targetEquity / 100);
    let bd = p.capital0 * (1 - p.targetEquity / 100);
    const traj = [eq + bd];
    const em = p.equityMu / 100 / 12;
    const ev = p.equityVol / 100 / Math.sqrt(12);
    const bm = p.bondMu / 100 / 12;
    const bv = p.bondVol / 100 / Math.sqrt(12);
    const fee = Math.pow(1 - p.frais / 100, 1 / 12);
    for (let m = 1; m <= months; m++) {
      const t = (m / 12) / p.years;
      let target = p.targetEquity + (p.glideTo - p.targetEquity) * t;
      if (p.tactical) {
        const signal = gauss(rnd);
        target += Math.max(-10, Math.min(10, -signal * 6));
      }
      target = Math.max(0, Math.min(100, target));
      eq = eq * Math.exp(em + ev * gauss(rnd)) * fee + p.monthly * (target / 100);
      bd = bd * Math.exp(bm + bv * gauss(rnd)) * fee + p.monthly * (1 - target / 100);
      const total = eq + bd;
      const eqPct = total > 0 ? (eq / total) * 100 : target;
      if (Math.abs(eqPct - target) > p.band) {
        eq = total * (target / 100);
        bd = total * (1 - target / 100);
      }
      traj.push(total);
    }
    paths.push(traj);
  }
  return paths;
}

function percentiles(paths) {
  const out = [];
  for (let m = 0; m < paths[0].length; m++) {
    const vals = paths.map((p) => p[m]).sort((a, b) => a - b);
    const q = (x) => vals[Math.min(vals.length - 1, Math.floor(x * vals.length))];
    out.push({ month: m, annee: m / 12, p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) });
  }
  return out;
}

const fmt = (v) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const fmtK = (v) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €";

// ================= TAUX DE RÉFÉRENCE (mis à jour le 19/10/2026) =================
// Sources : communiqué BCE 10/09/2026 (effectif 16/09) ; OAT 10 ans au 15/10/2026.
// Prochaine réunion BCE : 29 octobre 2026 (consensus : statu quo, hausse possible en décembre).
const RATES = {
  bce: 2.50,        // taux de dépôt BCE (court terme)
  bceRefi: 2.65,    // refinancement principal
  oat10: 4.74,      // OAT France 10 ans (taux long)
  bund10: 3.39,     // Bund 10 ans (référence zone euro)
  spreadOatBund: 135, // points de base — prime de risque France
  maj: "19/10/2026",
  prochaineBCE: "29/10/2026",
};

// ---- Inflation & rendement obligataire : calculés automatiquement sur tendances de marché ----
// Inflation : IPCH France sept. 2026 = 3,4 %, pondérée avec la cible BCE 2 % (convergence sur l'horizon).
const INFLATION_MKT = { spot: 3.4, cibleBCE: 2.0 };
const inflationAuto = Math.round((INFLATION_MKT.spot * 0.6 + INFLATION_MKT.cibleBCE * 0.4) * 10) / 10;
// Poche obligataire PEA (monétaire € CT) : 60 % court terme (dépôt BCE + ~30 pb) + 40 % taux longs (OAT 10 ans).
const bondMuAuto = Math.round(((RATES.bce + 0.3) * 0.6 + RATES.oat10 * 0.4) * 10) / 10;

// ================= ANALYSTES =================
// 16 sources — positions vérifiées en oct. 2026, orientées vers les 24 PROCHAINS mois :
// le consensus doit capter les tendances structurelles, pas rejouer le passé.
const ANALYSTS = [
  { nom: "Berkshire / école value", avatar: "🧓", etat: "neutre", poids: 3,
    note: "Succession actée (18/09/2026) : Abel CEO déploie la trésorerie record (397 → 365 Md$ au T2, fin de 14 trimestres de ventes nettes) — des opportunités redeviennent achetables, sans euphorie.",
    citation: "« Sois peureux quand les autres sont avides, avide quand les autres sont peureux. »" },
  { nom: "Buffett Indicator (macro)", avatar: "📊", etat: "baissier", poids: 2,
    note: "Capitalisation/PIB US ~227 %, au-dessus de 2000 et 2008 — prudence structurelle, surtout actions US." },
  { nom: "Julien Flot — tendance", avatar: "🛡️", etat: "neutre", poids: 3,
    note: "Sortie par le haut du biseau descendant (août 2026) : scénario technique positif tant que les signaux tiennent — accumuler, protéger si la tendance casse." },
  { nom: "Finary / DCA long terme", avatar: "🔄", etat: "haussier", poids: 2,
    note: "DCA mensuel + horizon : la régularité et les frais bas comptent plus que le timing — structurellement gagnant." },
  { nom: "Macro BCE / taux", avatar: "🏦", etat: "neutre", poids: 2,
    note: `Dépôt BCE ${RATES.bce.toFixed(2).replace(".", ",")} %, statu quo attendu le 29/10 ; inflation FR 3,4 % (plus haut depuis janv. 2024) → taux longs élevés : OAT 10 ans ~${RATES.oat10.toFixed(1).replace(".", ",")} % — la poche monétaire PEA (~3 %) est un vrai coussin.` },
  { nom: "Momentum Europe", avatar: "📈", etat: "haussier", poids: 2,
    note: "Décote vs US, rebond du luxe (importations chinoises +31 % en sept.), plans actionnaires (Air Liquide : rachat 4 Md€ + activiste Elliott) — flux de retour zone euro." },
  { nom: "Bulle IA / concentration", avatar: "🫧", etat: "baissier", poids: 2,
    note: "Mag 7 ≈ 30 % du S&P 500 (HHI 185 vs 142 historique), la BCE s'inquiète publiquement de l'euphorie — diluer la concentration tech US." },
  { nom: "GMO / Grantham — prévisions 7 ans", avatar: "📉", etat: "baissier", poids: 2,
    note: "Forecast 7 ans GMO (2026) : presque toutes les classes sous-performent en valeur réelle ; seules la deep value et les émergents surnagent." },
  { nom: "Shiller CAPE (valorisation US)", avatar: "📐", etat: "baissier", poids: 1,
    note: "CAPE 40,7 (oct. 2026) : 98,9e percentile depuis 1881 — seuls 19 mois plus hauts, tous en 1999-2000 et 2026. Rendements US 10 ans attendus faibles." },
  { nom: "Vanguard / VCMM — 10 ans", avatar: "🧮", etat: "neutre", poids: 2,
    note: "Outlook 2026 : rendements actions US contenus ; surpondérer les actions hors US et les obligations rémunérées — soutient Europe + poche monétaire." },
  { nom: "Ray Dalio — cycles de dette", avatar: "🌊", etat: "baissier", poids: 1,
    note: "Dette US record + avertissement sur la bulle IA : « la diversification est la seule protection gratuite » — l'or se gère hors PEA (AV/CTO)." },
  { nom: "BofA FMS — positioning", avatar: "📋", etat: "neutre", poids: 1,
    note: "Enquête oct. 2026 : le sentiment retombe (6,4, plus bas depuis juin) mais la tech reste la plus surpondérée depuis août 2020 (net +37 %) — positioning tendu, sélectivité." },
  { nom: "Stratégistes Wall Street", avatar: "🗽", etat: "haussier", poids: 1,
    note: "Cibles S&P 500 relevées au-delà de 8 000 (médiane ~7 900) vs ~7 530 actuel : les earnings portent, mais prudence sur les valeurs IA." },
  { nom: "Le Revenu (presse finance)", avatar: "📰", etat: "haussier", poids: 2,
    note: "Ligne éditoriale rendement/dividendes : ~73 Md€ distribués par le CAC 40 en 2026, banques et énergéticiens > 5-7 % de rendement — le dividende reste le socle du rendement long terme en PEA." },
  { nom: "Mieux vivre votre argent", avatar: "📖", etat: "neutre", poids: 2,
    note: "Approche patrimoine équilibrée : diversification multi-classes, décote de l'Europe comme opportunité, mais prudence sur les valorisations US — cohérent avec un DCA régulier sans pari de timing." },
  { nom: "Or / banques centrales", avatar: "🪙", etat: "haussier", poids: 1,
    note: "Record WGC 2026 : 45 % des banques centrales prévoient d'augmenter leurs réserves d'or — actif hors PEA, à piloter dans une autre enveloppe." },
];
const sigOf = (a) => a.reduce((s, x) => s + (x.etat === "haussier" ? x.poids : x.etat === "baissier" ? -x.poids : 0), 0);
const maxSig = (a) => a.reduce((s, x) => s + x.poids, 0);

// ================= PROFILS =================
const PROFILES = {
  prudent: { label: "Prudent", eq: 40, glideTo: 25, eqMu: 6, eqVol: 12 },
  equilibre: { label: "Équilibré", eq: 60, glideTo: 45, eqVol: 16, eqMu: 7.5 },
  dynamique: { label: "Dynamique", eq: 80, glideTo: 60, eqVol: 19, eqMu: 8.5 },
};

// ================= CLASSES D'ACTIFS (contrainte PEA) =================
// Répartition du portefeuille par classe, en replaçant les classes non éligibles PEA
// par leurs équivalents PEA (ou en signalant l'incompatibilité).
// - Actions "agressives" = croissance/tech/émergents ; "défensives" = rendement, utilities, santé, luxe qualité
// - Obligations : non éligibles PEA → équivalent = monétaire € CT (fonds € court terme)
// - Matières premières : non éligibles PEA → pas d'équivalent direct dans l'enveloppe (à faire hors PEA)
// - Or : non éligible PEA → hors enveloppe (or papier/AV), ou actions minières cotées EU (éligibles)
const ASSET_CLASSES = [
  { id: "aggro", label: "Actions agressives", icon: "🚀", desc: "Croissance, tech, émergents, small caps",
    eligible: true, target: { prudent: 10, equilibre: 20, dynamique: 35 } },
  { id: "def", label: "Actions défensives / rendement", icon: "🛡️", desc: "Dividendes, utilities, santé, qualité EU",
    eligible: true, target: { prudent: 30, equilibre: 40, dynamique: 45 } },
  { id: "monet", label: "Obligations / monétaire (équivalent PEA)", icon: "💰", desc: "Obligations non éligibles PEA → fonds monétaire € CT",
    eligible: true, target: { prudent: 60, equilibre: 40, dynamique: 20 } },
  { id: "or", label: "Or / matières premières", icon: "🪙", desc: "Non éligible PEA : hors enveloppe (or papier, AV) ou minières cotées EU",
    eligible: false, target: { prudent: 0, equilibre: 0, dynamique: 0 } },
];

// Classification des supports du catalogue par classe d'actif
const CAT_CLASS = {
  "Amundi PEA Monde": "def", "iShares MSCI World Swap PEA": "def", "Amundi MSCI World UCITS ETF (C)": "def",
  "Amundi PEA Global (MSCI ACWI)": "aggro", "Amundi ETF PEA MSCI Europe": "def",
  "Amundi PEA MSCI Emerging Markets": "aggro", "ETF dividendes Europe PEA (D)": "def",
  "Amundi ETF MSCI Europe Value Factor": "def", "Fonds monétaire € court terme": "monet",
  "iShares MSCI Europe SRI PEA": "def", "Amundi ETF CAC 40": "def", "BNP Paribas Easy S&P 500": "aggro",
  "Schneider Electric": "def", "LVMH": "def", "TotalEnergies": "def", "Sanofi": "def",
  "L'Oréal": "def", "Legrand": "def", "Air Liquide": "def", "BNP Paribas": "def",
};

// Indices actions large : un ETF "diversifié" contient des centaines de valeurs
// → il ne doit JAMAIS déclencher de règle de concentration ni être pénalisé en
// risque comme une ligne individuelle. (Évolution modèle après tests P1/P3/P4/P6.)
const BROAD_IDX = ["MSCI World", "MSCI ACWI", "MSCI Europe", "MSCI EM", "S&P 500", "CAC 40 GR", "Dividendes Europe", "MSCI Europe Value", "MSCI Europe SRI"];
function isDiversified(r) {
  return !!(r.ref && r.ref.type === "ETF" && BROAD_IDX.includes(r.ref.indice));
}

// ================= CATALOGUE — vraies infos (oct. 2026) =================
// Poids/secteur = approximations documentées ; ISIN/ticker = données de fiche produit.
const CATALOG = {
  "Amundi PEA Monde": { isin: "FR001400U5Q4", ticker: "DCAM", type: "ETF", indice: "MSCI World", ter: 0.20, pays: "Monde (70% US)", notes: "Capitalisant, ~1500 valeurs, cœur du DCA" },
  "iShares MSCI World Swap PEA": { isin: "IE0002XZSHO1", ticker: "WPEA", type: "ETF", indice: "MSCI World", ter: 0.20, pays: "Monde (70% US)", notes: "Réplication synthétique, capitalisant" },
  "Amundi MSCI World UCITS ETF (C)": { isin: "FR0011869353", ticker: "CW8", type: "ETF", indice: "MSCI World", ter: 0.38, pays: "Monde (70% US)", notes: "Le plus ancien MSCI World PEA" },
  "Amundi PEA Global (MSCI ACWI)": { isin: "FR0014017NX3", ticker: "PAAC", type: "ETF", indice: "MSCI ACWI", ter: 0.30, pays: "Monde + émergents", notes: "Nouveau juillet 2026, couvre ~2500 valeurs" },
  "Amundi ETF PEA MSCI Europe": { isin: "FR0011781145", ticker: "PAEU", type: "ETF", indice: "MSCI Europe", ter: 0.20, pays: "Europe", notes: "Diversifie l'exposition US du World" },
  "Amundi PEA MSCI Emerging Markets": { isin: "FR0011889843", ticker: "PAEEM", type: "ETF", indice: "MSCI EM", ter: 0.25, pays: "Émergents", notes: "Chine, Inde, Taïwan — volatilité élevée" },
  "ETF dividendes Europe PEA (D)": { isin: "FR0013538885", ticker: "PAEDI", type: "ETF", indice: "Dividendes Europe", ter: 0.25, pays: "Europe", notes: "Distribuant, sociétés qualité à rendement" },
  "Amundi ETF MSCI Europe Value Factor": { isin: "FR0013532766", ticker: "PE500", type: "ETF", indice: "MSCI Europe Value", ter: 0.25, pays: "Europe", notes: "Tilt value — décote vs croissance" },
  "Fonds monétaire € court terme": { isin: "FR0010510800", ticker: "MONEA", type: "Monétaire", indice: "€STR +", ter: 0.10, pays: "Zone euro", notes: "Poche sécurité du PEA, quasi-zéro vol" },
  "iShares MSCI Europe SRI PEA": { isin: "FR0013475228", ticker: "EUSRI", type: "ETF", indice: "MSCI Europe SRI", ter: 0.20, pays: "Europe", notes: "Version ISR/ESG" },
  "Amundi ETF CAC 40": { isin: "FR0007052782", ticker: "C40", type: "ETF", indice: "CAC 40 GR", ter: 0.25, pays: "France", notes: "Exposition large France" },
  "BNP Paribas Easy S&P 500": { isin: "FR0007071350", ticker: "ESE", type: "ETF", indice: "S&P 500", ter: 0.15, pays: "États-Unis", notes: "500 plus grandes sociétés US" },
  "Schneider Electric": { isin: "FR0000121972", ticker: "SU", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Électrification, data centers, transition énergétique" },
  "LVMH": { isin: "FR0000121014", ticker: "MC", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Luxe mondial — décote vs US, tête du CAC" },
  "TotalEnergies": { isin: "FR0000120271", ticker: "TTE", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Énergie — rendement dividende ~5 %" },
  "Sanofi": { isin: "FR0000120578", ticker: "SAN", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Pharma — pipeline phase III, rendement stable" },
  "L'Oréal": { isin: "FR0000120321", ticker: "OR", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "1re capi de Paris devant LVMH (sept. 2026), marge record 21,3 %" },
  "Legrand": { isin: "FR0010307819", ticker: "LR", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Bénéficiaire data centers/IA, range 132-146 € depuis août" },
  "Air Liquide": { isin: "FR0000120073", ticker: "AI", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Gaz industriels, défensif, dividende régulier" },
  "BNP Paribas": { isin: "FR0000131104", ticker: "BNP", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Banque — rendement élevé, décote valorisation" },
};
// ================= BANQUES & COMPATIBILITÉ PEA =================
// Banques proposant un PEA avec offre zéro/ bas frais sur ETF.
const BANKS = {
  fortuneo: { label: "Fortuneo", note: "Offre PEA 0 frais de courtage sur une liste d'ETF éligibles (Amundi, BNP, etc.)" },
  boursedirect: { label: "Bourse Direct", note: "Large catalogue ETF PEA, frais réduits" },
  boursobank: { label: "BoursoBank", note: "Catalogue ETF PEA complet via Boursorama" },
  saxo: { label: "Saxo Banque", note: "Catalogue international très large, frais par ordre" },
  traderepublic: { label: "Trade Republic", note: "ETF PEA via saveback, catalogue restreint" },
};
// Compatibilité PEA par banque (oct. 2026) — supports du catalogue référencés/éligibles.
// "ok" = référencé et éligible PEA ; "check" = éligible PEA en principe mais référencement à vérifier dans l'app.
const BANK_COMPAT = {
  fortuneo: {
    "Amundi PEA Monde": "ok", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "ok",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "ok",
    "Amundi ETF MSCI Europe Value Factor": "check", "Fonds monétaire € court terme": "ok",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "ok",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  boursedirect: {
    "Amundi PEA Monde": "ok", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "ok",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "ok",
    "Amundi ETF MSCI Europe Value Factor": "check", "Fonds monétaire € court terme": "ok",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "ok",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  boursobank: {
    "Amundi PEA Monde": "ok", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "ok",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "ok",
    "Amundi ETF MSCI Europe Value Factor": "check", "Fonds monétaire € court terme": "ok",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "check",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  saxo: {
    "Amundi PEA Monde": "check", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "check",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "check",
    "Amundi ETF MSCI Europe Value Factor": "check", "Fonds monétaire € court terme": "check",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "check",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  traderepublic: {
    "Amundi PEA Monde": "check", "iShares MSCI World Swap PEA": "check", "Amundi MSCI World UCITS ETF (C)": "check",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "check",
    "Amundi PEA MSCI Emerging Markets": "check", "ETF dividendes Europe PEA (D)": "check",
    "Amundi ETF MSCI Europe Value Factor": "check", "Fonds monétaire € court terme": "check",
    "iShares MSCI Europe SRI PEA": "check", "Amundi ETF CAC 40": "check", "BNP Paribas Easy S&P 500": "check",
    "Schneider Electric": "check", "LVMH": "check", "TotalEnergies": "check", "Sanofi": "check",
    "L'Oréal": "check", "Legrand": "check", "Air Liquide": "check", "BNP Paribas": "check",
  },
};
// Compat PEA : "ok" (éligible et référencé), "check" (à vérifier), null (pas référencé)
function peaCompat(bank, name) {
  const map = BANK_COMPAT[bank] || {};
  if (!(name in map)) return null;
  return map[name];
}

// Frais de courtage par banque (PEA, oct. 2026, approximations documentées)
// etf* = ordres ETF/fonds éligibles ; stock* = actions individuelles. pct en % du montant, min en €/ordre.
const BANK_FEES = {
  fortuneo: { etfPct: 0, etfMin: 0, stockPct: 0.5, stockMin: 5.9, note: "ETF éligibles PEA : 0 € · actions 0,50 % (min 5,90 €)" },
  boursedirect: { etfPct: 0, etfMin: 0, stockPct: 0.5, stockMin: 1, note: "ETF : 0 € · actions 0,50 % (min 1 €)" },
  boursobank: { etfPct: 0.5, etfMin: 0.5, stockPct: 0.5, stockMin: 0.5, note: "Ordres 0,50 % (min 0,50 €)" },
  saxo: { etfPct: 0.05, etfMin: 1.5, stockPct: 0.1, stockMin: 1.5, note: "ETF 0,05 % · actions FR 0,10 % (min 1,50 €)" },
  traderepublic: { etfPct: 0, etfMin: 1, stockPct: 0, stockMin: 1, note: "1 € par ordre (flat)" },
};

// Résolution souple : normalise et cherche par mots-clés
// ================= DIVIDENDES, COURS & EXPOSITIONS (données au 19/10/2026) =================
// Cours de référence indicatifs et rendements dividende estimés 2026 (AG, publications résultats).
// Actualisables en chat : « mets à jour les cours et les dividendes ».
const PRICES = {
  "Schneider Electric": 254, "LVMH": 355, "TotalEnergies": 74, "Sanofi": 82,
  "L'Oréal": 354, "Legrand": 140, "Air Liquide": 171, "BNP Paribas": 86,
};
// Rendement dividende estimé 2026, en % de la valeur détenue.
const DIV_YIELD = {
  "Amundi PEA Monde": 1.2, "iShares MSCI World Swap PEA": 1.2, "Amundi MSCI World UCITS ETF (C)": 1.2,
  "Amundi PEA Global (MSCI ACWI)": 1.5, "Amundi ETF PEA MSCI Europe": 3.0,
  "Amundi PEA MSCI Emerging Markets": 2.5, "ETF dividendes Europe PEA (D)": 3.8,
  "Amundi ETF MSCI Europe Value Factor": 4.0, "Fonds monétaire € court terme": 2.2,
  "iShares MSCI Europe SRI PEA": 2.5, "Amundi ETF CAC 40": 3.3, "BNP Paribas Easy S&P 500": 1.2,
  "Schneider Electric": 1.6, "LVMH": 3.5, "TotalEnergies": 4.9, "Sanofi": 5.0,
  "L'Oréal": 1.9, "Legrand": 1.6, "Air Liquide": 2.2, "BNP Paribas": 6.0,
};
// Politique de distribution : "cap" = capitalisant (dividendes réinvestis, aucun flux),
// "mai" = détachement annuel début mai (est.), "lvmh" = acompte début déc. + solde fin avril,
// "trim" = trimestriel (est.).
const DIV_DIST = {
  "ETF dividendes Europe PEA (D)": "trim", "Amundi ETF CAC 40": "mai",
  "Schneider Electric": "mai", "LVMH": "lvmh", "TotalEnergies": "mai", "Sanofi": "mai",
  "L'Oréal": "mai", "Legrand": "mai", "Air Liquide": "mai", "BNP Paribas": "mai",
};
// Exposition géographique du sous-jacent (%, approx. oct. 2026) — fr = part France dans l'exposition Europe.
const G_WLD = { us: 70, eu: 15, asie: 10, em: 2, autres: 3, fr: 2 };
const G_ACWI = { us: 62, eu: 15, asie: 9, em: 13, autres: 1, fr: 2 };
const G_EUR = { eu: 100, fr: 18 };
const G_EM = { em: 100 };
const G_US = { us: 100 };
const G_FR = { eu: 100, fr: 100 };
const G_MON = { monet: 100 };
const GEO_MAP = {
  "Amundi PEA Monde": G_WLD, "iShares MSCI World Swap PEA": G_WLD, "Amundi MSCI World UCITS ETF (C)": G_WLD,
  "Amundi PEA Global (MSCI ACWI)": G_ACWI, "Amundi ETF PEA MSCI Europe": G_EUR,
  "Amundi PEA MSCI Emerging Markets": G_EM, "ETF dividendes Europe PEA (D)": G_EUR,
  "Amundi ETF MSCI Europe Value Factor": G_EUR, "Fonds monétaire € court terme": G_MON,
  "iShares MSCI Europe SRI PEA": G_EUR, "Amundi ETF CAC 40": G_FR, "BNP Paribas Easy S&P 500": G_US,
  "Schneider Electric": G_FR, "LVMH": G_FR, "TotalEnergies": G_FR, "Sanofi": G_FR,
  "L'Oréal": G_FR, "Legrand": G_FR, "Air Liquide": G_FR, "BNP Paribas": G_FR,
};
// Exposition sectorielle du sous-jacent (%, approx. oct. 2026)
const S_WLD = { tech: 25, finance: 15, industrie: 11, conso: 20, sante: 10, energie: 3, autres: 16 };
const S_ACWI = { tech: 24, finance: 15, industrie: 10, conso: 19, sante: 10, energie: 3, autres: 19 };
const S_EUR = { tech: 8, finance: 20, industrie: 17, conso: 17, sante: 12, energie: 5, autres: 21 };
const S_SRI = { tech: 10, finance: 15, industrie: 20, conso: 17, sante: 12, energie: 4, autres: 22 };
const S_VAL = { tech: 5, finance: 25, industrie: 15, conso: 15, sante: 10, energie: 10, autres: 20 };
const S_DIV = { tech: 5, finance: 25, industrie: 15, conso: 15, sante: 10, energie: 8, autres: 22 };
const S_EM = { tech: 28, finance: 18, industrie: 8, conso: 13, sante: 6, energie: 3, autres: 24 };
const S_SPX = { tech: 32, finance: 13, industrie: 9, conso: 19, sante: 10, energie: 2, autres: 15 };
const S_CAC = { tech: 6, finance: 13, industrie: 22, conso: 22, sante: 10, energie: 9, autres: 18 };
const SECTOR_MAP = {
  "Amundi PEA Monde": S_WLD, "iShares MSCI World Swap PEA": S_WLD, "Amundi MSCI World UCITS ETF (C)": S_WLD,
  "Amundi PEA Global (MSCI ACWI)": S_ACWI, "Amundi ETF PEA MSCI Europe": S_EUR,
  "Amundi PEA MSCI Emerging Markets": S_EM, "ETF dividendes Europe PEA (D)": S_DIV,
  "Amundi ETF MSCI Europe Value Factor": S_VAL, "Fonds monétaire € court terme": { monet: 100 },
  "iShares MSCI Europe SRI PEA": S_SRI, "Amundi ETF CAC 40": S_CAC, "BNP Paribas Easy S&P 500": S_SPX,
  "Schneider Electric": { industrie: 100 }, "LVMH": { conso: 100 }, "TotalEnergies": { energie: 100 },
  "Sanofi": { sante: 100 }, "L'Oréal": { conso: 100 }, "Legrand": { industrie: 100 },
  "Air Liquide": { industrie: 100 }, "BNP Paribas": { finance: 100 },
};

const norm = (s) => (s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function resolveHolding(name) {
  if (!name) return null;
  const n = norm(name);
  // 1) correspondance exacte
  for (const [k, v] of Object.entries(CATALOG)) if (norm(k) === n) return { name: k, ...v };
  // 2) correspondance par ticker ou ISIN
  for (const [k, v] of Object.entries(CATALOG)) {
    if (v.ticker.toLowerCase() === n || v.isin.toLowerCase() === n) return { name: k, ...v };
  }
  // 3) correspondance par mots-clés contenus (le plus long match gagne)
  let best = null, bestLen = 0;
  for (const [k, v] of Object.entries(CATALOG)) {
    const nk = norm(k);
    const words = nk.split(" ").filter((w) => w.length >= 3 && !["pea", "etf", "ucits", "amundi", "ishares", "msci", "bnp", "paribas", "easy"].includes(w));
    for (const w of words) {
      if (n.includes(w) && w.length > bestLen) { best = { name: k, ...v }; bestLen = w.length; }
    }
    if (n.includes(nk)) return { name: k, ...v };
  }
  return best;
}

// ================= UI PRIMITIVES =================
function Card({ title, icon, children, className = "" }) {
  return (
    (React.createElement("div", {"className": ("rounded-2xl border border-slate-700/60 bg-slate-800/60 p-4 shadow-lg shadow-black/20 " + className)}, (title && (
        (React.createElement("div", {"className": "mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"}, (icon && (React.createElement("span", {"className": "text-base"}, (icon)))), (title)))
      )), (children)))
  );
}

function Kpi({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "bg-slate-900/60 border-slate-700/60",
    good: "bg-emerald-900/30 border-emerald-700/40",
    warn: "bg-amber-900/20 border-amber-700/40",
    bad: "bg-rose-900/30 border-rose-700/40",
    accent: "bg-indigo-900/30 border-indigo-700/40",
  };
  return (
    (React.createElement("div", {"className": ("rounded-xl border p-3 " + tones[tone])}, (React.createElement("div", {"className": "text-[11px] uppercase tracking-wider text-slate-400"}, (label))), (React.createElement("div", {"className": "mt-0.5 text-lg font-bold text-slate-50"}, (value))), (sub && (React.createElement("div", {"className": "mt-0.5 text-[11px] text-slate-400"}, (sub))))))
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }) {
  return (
    (React.createElement("div", null, (React.createElement("div", {"className": "mb-1 flex justify-between text-xs"}, (React.createElement("span", {"className": "text-slate-400"}, (label))), (React.createElement("span", {"className": "font-semibold text-indigo-300"}, (value), (suffix))))), (React.createElement("input", {"type": "range", "min": (min), "max": (max), "step": (step), "value": (value), "onChange": ((e) => onChange(Number(e.target.value))), "className": "w-full accent-indigo-500"}))))
  );
}

function Bar({ pct, tone }) {
  const colors = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500", accent: "bg-indigo-500" };
  return (
    (React.createElement("div", {"className": "h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700/70"}, (React.createElement("div", {"className": ("h-full rounded-full transition-all " + (colors[tone] || colors.accent)), "style": ({ width: Math.max(0, Math.min(100, pct)) + "%" })}))))
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    good: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    bad: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    neutral: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    accent: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  };
  return (React.createElement("span", {"className": ("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " + tones[tone])}, (children)));
}

// Autocomplete simple pour la saisie des lignes
function LinePicker({ allKeys, value, onPick }) {
  const [q, setQ] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const filtered = useMemo(() => {
    if (!q.trim()) return allKeys.slice(0, 8);
    const nq = norm(q);
    return allKeys.filter((k) => norm(k).includes(nq) || (CATALOG[k].ticker || "").toLowerCase().includes(nq) || CATALOG[k].isin.toLowerCase().includes(nq)).slice(0, 8);
  }, [q, allKeys]);
  useEffect(() => { setQ(value || ""); }, [value]);
  const pick = (k) => { onPick(k); setQ(k); setOpen(false); };
  return (
    (React.createElement("div", {"className": "relative min-w-0 flex-1"}, (React.createElement("input", {"value": (q), "onChange": ((e) => { setQ(e.target.value); onPick(e.target.value); setOpen(true); setHi(0); }), "onFocus": (() => setOpen(true)), "onBlur": (() => setTimeout(() => setOpen(false), 150)), "onKeyDown": ((e) => {
          if (open && e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
          if (open && e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (open && e.key === "Enter" && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); }
        }), "placeholder": "Nom, ticker ou ISIN\u2026 (ex : amundi monde, SU, FR001400U5Q4)", "className": "w-full rounded-lg border border-slate-600/70 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"})), (open && filtered.length > 0 && (
        (React.createElement("div", {"className": "absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-2xl"}, (filtered.map((k, i) => (
            (React.createElement("button", {"key": (k), "type": "button", "onMouseDown": ((e) => { e.preventDefault(); pick(k); }), "className": ("block w-full px-3 py-2 text-left text-sm " + (i === hi ? "bg-indigo-500/30 text-slate-50" : "text-slate-300 hover:bg-slate-700/60"))}, (React.createElement("span", {"className": "font-semibold"}, (k))), (React.createElement("span", {"className": "ml-2 text-xs text-slate-400"}, (CATALOG[k].isin), "\u00b7", (CATALOG[k].ticker)))))
          )))))
      ))))
  );
}

// ================= APP =================
function App() {
  const [tab, setTab] = useState("sim");
  const [monthly, setMonthly] = useState(550);
  const [capital0, setCapital0] = useState(2000);
  const [years, setYears] = useState(5);
  const [profile, setProfile] = useState("equilibre");
  const [band, setBand] = useState(10);
  const [tactical, setTactical] = useState(true);
  const [goal, setGoal] = useState(50000);
  const [bank, setBank] = useState("fortuneo");
  const [photo, setPhoto] = useState(null);
  const [top3, setTop3] = useState(null);
  const [invDay, setInvDay] = useState(5);
  const [majISO, setMajISO] = useState("2026-10-19");
  const [peaOpenISO, setPeaOpenISO] = useState("2023-03-01"); // ouverture du PEA — pilote l'anniversaire des 5 ans
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("peaHist") || "[]"); } catch (e) { return []; }
  });
  const [lines, setLines] = useState([
    { id: 1, nom: "Amundi PEA Monde (MSCI World)", type: "action", valeur: 1500, pv: 111 },
  ]);
  const addLine = () => setLines([...lines, { id: Date.now(), nom: "", type: "action", valeur: 0, pv: 0 }]);
  const upLine = (id, field, v) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: v } : l)));
  const rmLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const onPhoto = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(f);
  };

  const pf = PROFILES[profile];

  // ---- Consensus ----
  const sig = sigOf(ANALYSTS);
  const sigMax = maxSig(ANALYSTS);
  const sigPct = Math.round((sig / sigMax) * 100);
  const consensusLabel = sigPct > 25 ? "Acheteur" : sigPct > -25 ? "Neutre / sélectif" : "Défensif";

  // ---- Portefeuille + résolution catalogue ----
  // Saisie utilisateur : valeur actuelle (€) + plus/moins-value (± €) — le % est déduit automatiquement.
  const valLines = lines.map((l) => {
    const valeur = Number(l.valeur) || 0;
    const pv = Number(l.pv) || 0;
    const invested = Math.max(0, valeur - pv);
    const valo = invested > 0 ? Math.round((pv / invested) * 1000) / 10 : 0;
    return { ...l, valeur, pv, invested, valo, ref: resolveHolding(l.nom) };
  });
  const holdEq = valLines.filter((l) => l.type === "action").reduce((a, l) => a + l.valeur, 0);
  const holdBd = valLines.filter((l) => l.type === "monet").reduce((a, l) => a + l.valeur, 0);
  const holdTotal = holdEq + holdBd;
  const allKeys = Object.keys(CATALOG);

  const analysis = useMemo(() => {
    const total = holdEq + holdBd;
    const rows = valLines.map((l) => {
      return { ...l, invested: l.invested, pnl: l.valeur - l.invested, pnlPct: l.valo, weight: total > 0 ? (l.valeur / total) * 100 : 0 };
    });
    const invested = rows.reduce((a, r) => a + r.invested, 0);
    const pnl = total - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const hhi = rows.reduce((a, r) => a + r.weight * r.weight, 0);
    const maxWeight = rows.length ? Math.max(...rows.map((r) => r.weight)) : 0;
    // Concentration réelle : uniquement les lignes NON diversifiées (actions individuelles).
    // Un ETF World à 100 % du portefeuille n'est PAS une concentration.
    const singles = rows.filter((r) => !isDiversified(r));
    const maxSingle = singles.length ? Math.max(...singles.map((r) => r.weight)) : 0;
    // nEff effectif : un ETF diversifié ≈ 8 lignes internes (proxy), une action = 1.
    const nEff = rows.length
      ? 1 / rows.reduce((a, r) => a + Math.pow(r.weight / 100, 2) / (isDiversified(r) ? 8 : 1), 0)
      : 0;
    const eqPct = total > 0 ? (holdEq / total) * 100 : 0;
    const vol = total > 0 ? (eqPct / 100) * pf.eqVol * 0.9 : 0;
    const stressLoss = holdEq * 0.3 + holdBd * 0.02;
    const divScore = Math.min(100, (nEff / 8) * 100);
    const concPen = Math.max(0, maxSingle - 40) * 1.5;
    const allocScore = Math.max(0, 100 - Math.abs(eqPct - pf.eq) * 2);
    const resilience = Math.max(0, Math.min(100, 0.4 * divScore + 0.4 * allocScore + 20 - concPen * 0.4));
    const worst = [...rows].sort((a, b) => a.pnlPct - b.pnlPct)[0];
    const best = [...rows].sort((a, b) => b.pnlPct - a.pnlPct)[0];
    return { rows, total, invested, pnl, pnlPct, hhi, nEff, maxWeight, maxSingle, eqPct, vol, stressLoss, resilience, worst, best };
  }, [lines, pf, holdEq, holdBd]);

  // ---- Objectif & plan DCA ----
  const monthly2 = Math.min(Math.max(monthly, 100), 1000);

  // ---- Frais réels : TER des supports détenus + courtage de la banque choisie ----
  const fraisModel = useMemo(() => {
    const bf = BANK_FEES[bank] || BANK_FEES.fortuneo;
    const rows = analysis.rows;
    const total = analysis.total;
    const terPond = total > 0
      ? rows.reduce((a, r) => a + (r.weight / 100) * ((r.ref && r.ref.ter) || 0), 0)
      : 0.25; // portefeuille vide : hypothèse ETF cœur ~0,25 %
    let courtageAn = 0;
    const perLine = rows.map((r) => {
      const isEtf = !!(r.ref && r.ref.type !== "Action");
      const pct = isEtf ? bf.etfPct : bf.stockPct;
      const min = isEtf ? bf.etfMin : bf.stockMin;
      // versement mensuel réparti au prorata des lignes existantes (hypothèse DCA)
      const part = total > 0 ? (r.weight / 100) * monthly2 : monthly2 / Math.max(1, rows.length);
      const courtM = Math.max(min, (part * pct) / 100);
      courtageAn += courtM * 12;
      return { id: r.id, nom: r.nom, valeur: r.valeur, weight: r.weight, ter: (r.ref && r.ref.ter) || 0, isEtf, pct, min, courtM };
    });
    if (rows.length === 0) courtageAn = Math.max(bf.etfMin, (monthly2 * bf.etfPct) / 100) * 12;
    const terAn = (total * terPond) / 100;
    const fraisAn = terAn + courtageAn;
    const fraisPct = total > 0 ? (fraisAn / total) * 100 : (courtageAn / (monthly2 * 12)) * 100 + terPond;
    return { bf, terPond, terAn, courtageAn, fraisAn, fraisPct, perLine };
  }, [analysis, bank, monthly2]);

  const blendedMu = (pf.eqMu * pf.eq + bondMuAuto * (100 - pf.eq)) / 100 / 100;
  const netMu = blendedMu - fraisModel.fraisPct / 100;
  const rm = Math.pow(1 + netMu, 1 / 12) - 1;
  const n = years * 12;
  const fvCapital = holdTotal * Math.pow(1 + rm, n);
  const annuity = ((Math.pow(1 + rm, n) - 1) / rm);
  const requiredMonthly = rm === 0 ? (goal - fvCapital) / n : Math.max(0, (goal - fvCapital) / annuity);
  const goalOk = monthly >= requiredMonthly - 0.5;

  // ---- Impact des frais sur l'horizon : même projection avec vs sans frais ----
  const rmBrut = Math.pow(1 + blendedMu, 1 / 12) - 1;
  const fvBrut = holdTotal * Math.pow(1 + rmBrut, n) + monthly2 * (rmBrut === 0 ? n : (Math.pow(1 + rmBrut, n) - 1) / rmBrut);
  const fvNet = fvCapital + monthly2 * annuity;
  const coutFraisHorizon = Math.max(0, fvBrut - fvNet);

  // ---- Simulation Monte Carlo, avec les frais réels calculés ----
  const params = {
    monthly, capital0, years,
    equityMu: pf.eqMu, equityVol: pf.eqVol,
    bondMu: bondMuAuto, bondVol: 5,
    targetEquity: pf.eq, glideTo: pf.glideTo,
    band, tactical, inflation: inflationAuto, frais: fraisModel.fraisPct,
  };
  const stats = useMemo(() => {
    const paths = simulate(params, 400);
    const pct = percentiles(paths);
    const final = paths.map((p) => p[p.length - 1]).sort((a, b) => a - b);
    const q = (x) => final[Math.floor(x * final.length)];
    const verse = capital0 + monthly * years * 12;
    const med = q(0.5);
    const probaGain = final.filter((v) => v > verse).length / final.length;
    const medReel = med / Math.pow(1 + inflationAuto / 100, years);
    return { pct, verse, med, p5: q(0.05), p95: q(0.95), probaGain, medReel };
  }, [monthly, capital0, years, profile, band, tactical, fraisModel]);

  const dcaPlan = useMemo(() => {
    let eq = Number(holdEq) || 0;
    let bd = Number(holdBd) || 0;
    const rows = [];
    for (let m = 1; m <= 12; m++) {
      const t = m / (years * 12);
      const target = pf.eq + (pf.glideTo - pf.eq) * t;
      const total = eq + bd;
      const eqPct = total > 0 ? (eq / total) * 100 : target;
      const gapEq = target - eqPct;
      const wEq = Math.max(0, Math.min(1, 0.5 + gapEq / (2 * band)));
      const dEq = monthly2 * wEq;
      const dBd = monthly2 - dEq;
      eq += dEq;
      bd += dBd;
      const d = new Date();
      const dd = new Date(d.getFullYear(), d.getMonth() + m, invDay);
      rows.push({
        date: dd.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }),
        actions: dEq, oblig: dBd,
        eqPct: ((eq / (eq + bd)) * 100).toFixed(1),
        target: target.toFixed(0),
      });
    }
    return rows;
  }, [holdEq, holdBd, monthly2, years, profile, band, invDay]);

  // ---- Réajustements ----
  const adjustments = useMemo(() => {
    const total = analysis.total;
    if (total <= 0) return [];
    const rows = [];
    const eqPct = analysis.eqPct;
    const targetEq = pf.eq;
    const excessEq = eqPct - targetEq;
    const horizonFactor = years <= 2 ? 0.6 : years === 3 ? 0.8 : 1;
    const baseCap = profile === "prudent" ? 30 : profile === "dynamique" ? 50 : 40;
    const maxWeightLine = baseCap * horizonFactor;
    const rebalanceAmount = excessEq > band ? (total * (eqPct - targetEq) / 100) : 0;
    for (const r of analysis.rows) {
      const actions = [];
      const div = isDiversified(r); // ETF large → jamais de vente pour concentration ni take-profit
      if (r.weight > maxWeightLine && r.type === "action" && !div) {
        const cap = excessEq > band ? maxWeightLine * 0.9 : maxWeightLine;
        actions.push({ type: "vente",
          label: `Concentration ${r.weight.toFixed(0)} % (plafond ${profile} : ${maxWeightLine.toFixed(0)} %)`,
          montant: r.valeur - (total * cap / 100), vers: "monétaire + lignes sous-pondérées" });
      }
      if (r.valo >= 25 && r.weight > 20 && r.type === "action" && !div) {
        const takePct = profile === "prudent" ? 0.25 : profile === "equilibre" ? 0.15 : 0.1;
        actions.push({ type: "take-profit",
          label: `Prendre des gains : +${r.valo} % · ${r.weight.toFixed(0)} % du total`,
          montant: r.valeur * takePct, vers: "monétaire ou ligne en retard" });
      }
      if (r.valo <= -20 && r.weight < 5) {
        actions.push({ type: "arbitrage",
          label: `Ligne défaillante : ${r.valo} %, marginalisée (${r.weight.toFixed(0)} %)`,
          montant: r.valeur, vers: "ETF cœur ou monétaire selon consensus" });
      }
      if (excessEq > band && r.type === "action" && r.weight > 15) {
        const share = rebalanceAmount * (r.valeur / Math.max(1, holdEq));
        if (share > 20) {
          actions.push({ type: "rebalance",
            label: `Sur-exposition actions : ${eqPct.toFixed(0)} % vs cible ${targetEq.toFixed(0)} %`,
            montant: share, vers: "poche monétaire du PEA" });
        }
      }
      if (r.type === "action" && years <= 2) {
        actions.push({ type: "derisk",
          label: `Horizon ≤ ${years} ans : sécuriser 30 % de la ligne`,
          montant: r.valeur * 0.3, vers: `poche monétaire (cible finale ${pf.glideTo} %)` });
      }
      if (actions.length) rows.push({ ...r, actions });
    }
    // Règle 6 — SOUS-EXPOSITION actions : aucune vente, on oriente le DCA.
    // Un portefeuille trop prudent (cash dominant) doit être alerté vs sa cible profil.
    if (eqPct < targetEq - band) {
      const miss = total * (targetEq - eqPct) / 100;
      const monthsToFill = Math.max(1, Math.ceil(miss / Math.max(1, monthly2)));
      rows.push({ id: "dca-rule", nom: "Poche actions globale", type: "action", weight: eqPct, valo: 0, valeur: holdEq,
        actions: [{ type: "dca",
          label: `Sous-exposition : ${eqPct.toFixed(0)} % actions vs cible ${targetEq.toFixed(0)} % — deficit ≈ ${fmt(Math.round(miss))} €`,
          montant: 0, vers: `orienter 100 % du DCA (~${monthsToFill} mois) vers la poche actions` }] });
    }
    return rows;
  }, [analysis, profile, years, band, pf, holdEq, monthly2]);

  const adjustTotal = adjustments.reduce((a, r) => a + r.actions.reduce((b, x) => b + x.montant, 0), 0);

  // ---- Risque & posture ----
  // ---- Répartition par classe d'actifs (contrainte PEA) ----
  const classBreakdown = useMemo(() => {
    const total = analysis.total;
    const byClass = {};
    for (const c of ASSET_CLASSES) byClass[c.id] = 0;
    for (const r of analysis.rows) {
      const cid = r.ref ? (CAT_CLASS[r.ref.name] || (r.type === "monet" ? "monet" : "def")) : (r.type === "monet" ? "monet" : "def");
      byClass[cid] += r.valeur;
    }
    return ASSET_CLASSES.map((c) => {
      const value = byClass[c.id];
      const weight = total > 0 ? (value / total) * 100 : 0;
      const target = c.target[profile] || 0;
      const gap = weight - target;
      // Tolérance par classe = bande utilisateur, min ±15 pts (une classe n'est
      // pas une ligne : inutile de déclencher une alerte pour 10 pts d'écart).
      const outOfRange = Math.abs(gap) > Math.max(band, 15);
      return { ...c, value, weight, target, gap, outOfRange };
    });
  }, [analysis, profile, band]);

  const hasIneligible = useMemo(() => {
    // Ligne saisie en "monet" = OK (équivalent obligataire PEA) ;
    // on signale les classes non éligibles si l'utilisateur les possédait hors PEA (info pédagogique)
    return classBreakdown.filter((c) => !c.eligible).map((c) => ({ ...c }));
  }, [classBreakdown]);

  const riskPosture = useMemo(() => {
    const eqScore = analysis.eqPct;
    const volScore = Math.min(100, analysis.vol * 5);
    const concScore = Math.min(100, analysis.maxSingle * 1.6);
    const riskLevel = Math.round(Math.max(0, Math.min(100, 0.45 * eqScore + 0.35 * volScore + 0.20 * concScore)));
    const riskLabel = riskLevel < 30 ? "Prudent" : riskLevel < 50 ? "Modéré" : riskLevel < 70 ? "Équilibré+" : "Dynamique";
    const pfTarget = { prudent: 25, equilibre: 50, dynamique: 75 }[profile] || 50;
    const alignment = riskLevel >= pfTarget - 15 && riskLevel <= pfTarget + 15;
    let posture, postureWhy;
    if (sigPct > 25) {
      posture = "Offensive";
      postureWhy = "Tendance favorable : maximiser l'accumulation, DCA à plein rythme, aucun besoin de vendre.";
    } else if (sigPct < -25) {
      posture = "Défensive";
      postureWhy = "Tendance défavorable : orienter le versement vers la poche sécuritaire — sans stopper le DCA ni vendre en panique.";
    } else {
      posture = "Neutre";
      postureWhy = "Tendance incertaine : rester sur la cible du profil, laisser le DCA et le glide path travailler.";
    }
    const nMoves = adjustments.reduce((a, r) => a + r.actions.filter((x) => x.type !== "dca").length, 0);
    const turnover = adjustTotal / Math.max(1, analysis.total);
    const efficiency = turnover < 0.05 ? "Optimale" : turnover < 0.15 ? "Bonne" : turnover < 0.3 ? "Acceptable" : "Excessive";
    return { riskLevel, riskLabel, alignment, pfTarget, posture, postureWhy, nMoves, turnover, efficiency };
  }, [analysis, profile, sigPct, adjustments, adjustTotal]);

  // ---- Top 3 ----
  const computeTop3 = () => {
    const total = holdEq + holdBd;
    const eqPct = total > 0 ? (holdEq / total) * 100 : 0;
    const aggressive = Math.max(0, goal - fvCapital) > goal * 0.3 || requiredMonthly > monthly2;
    const scored = Object.entries(CATALOG).map(([k, c]) => {
      const cat = c.type === "Monétaire" ? "monet" : c.indice.includes("World") || c.indice.includes("ACWI") ? "action-monde"
        : c.indice.includes("Europe") ? "action-europe" : c.indice.includes("EM") ? "action-em" : "action";
      const mu = c.type === "Monétaire" ? 3 : cat === "action-em" ? 8 : cat === "action-europe" ? 7 : c.indice.includes("S&P") || c.indice.includes("World") || c.indice.includes("ACWI") ? 7.5 : 6.5;
      const vol = c.type === "Monétaire" ? 0.5 : cat === "action-em" ? 20 : cat === "action-europe" ? 15 : c.type === "Action" ? 18 : 16;
      let s = 50;
      s += aggressive ? (cat.startsWith("action") ? 15 : -15) : cat === "monet" ? 10 : 0;
      if (eqPct > pf.eq + band && cat !== "monet") s -= 20;
      if (eqPct < pf.eq - band && cat === "monet") s -= 15;
      const names = lines.map((l) => norm(l.nom));
      const nK = norm(k);
      if (names.some((nm) => nm && (nK.includes(nm) || nm.includes(nK)))) s -= 15; // doublon avec ligne existante
      s += (20 - vol) * (profile === "prudent" ? 1.5 : profile === "equilibre" ? 0.7 : 0.2);
      if (cat === "monet") s += sigPct < -25 ? 10 : sigPct > 25 ? -8 : 0;
      if (cat.startsWith("action")) s += sigPct > 25 ? 8 : sigPct < -25 ? -8 : 0;
      if (cat === "action-europe") s += 5;
      // 8) COMPATIBILITÉ PEA de la banque choisie — exigence absolue :
      //    non référencé = exclu ; "à vérifier" = forte pénalité
      const compat = peaCompat(bank, k);
      if (compat === null) s -= 100;      // exclu : pas éligible PEA chez cette banque
      else if (compat === "check") s -= 15; // pénalité : référencement incertain
      else s += 10;                          // bonus : éligible et référencé
      return { nom: k, isin: c.isin, ticker: c.ticker, cat, mu, vol, compat, score: Math.round(s),
        why: c.notes + (c.ter ? ` · TER ${c.ter} %` : "") };
    }).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);
    const sum = top.reduce((a, c) => a + c.score, 0);
    setTop3(top.map((c, i) => ({ ...c, montant: Math.round((monthly2 * c.score) / sum / 5) * 5, label: ["🥇", "🥈", "🥉"][i] })));
  };

  // ---- Mise à jour de l'analyse marché (ancrée sur le jour d'investissement choisi) ----
  const frDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR");
  const majAge = Math.max(0, Math.round((Date.now() - new Date(majISO + "T12:00:00").getTime()) / 86400000));
  const freshTone = majAge <= 30 ? "good" : majAge <= 60 ? "warn" : "bad";
  const freshLabel = majAge <= 30 ? "À jour" : majAge <= 60 ? "À surveiller" : "Périmée — demandez la mise à jour en chat";
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  let nextInv = new Date(today0.getFullYear(), today0.getMonth(), invDay);
  if (nextInv < today0) nextInv = new Date(today0.getFullYear(), today0.getMonth() + 1, invDay);
  const updateAnalysis = () => {
    setMajISO(new Date().toISOString().slice(0, 10));
    computeTop3();
  };

  // ---- Split du versement du mois : rééquilibrage × exposition pour tenir l'objectif ----
  const splitPlan = useMemo(() => {
    const total = analysis.total;
    const eqPct = analysis.eqPct;
    const months = Math.max(1, years * 12);
    // 1) Cible profil au point courant du glide path
    const targetProfile = pf.eq + (pf.glideTo - pf.eq) / months;
    // 2) Exposition requise pour tenir l'objectif :
    //    rendement net annuel nécessaire, puis inversion du blend actions/monétaire.
    const need = Math.max(0, goal - fvCapital);
    const aReq = need / Math.max(1, monthly2); // annuité requise
    let muM = 0;
    if (need > 0) {
      let lo = 0, hi = 0.03;
      for (let i = 0; i < 60; i++) {
        muM = (lo + hi) / 2;
        const a = muM === 0 ? months : (Math.pow(1 + muM, months) - 1) / muM;
        if (a < aReq) lo = muM; else hi = muM;
      }
    }
    const muYearNeeded = Math.pow(1 + muM, 12) - 1;
    const netNeeded = muYearNeeded + fraisModel.fraisPct / 100;
    const eqNeeded = ((netNeeded - bondMuAuto / 100) / ((pf.eqMu - bondMuAuto) / 100)) * 100;
    const reachable = need <= 0 || requiredMonthly <= monthly2 + 0.5;
    // 3) Expo cible du mois = max(cible profil, expo requise), bornée par le profil + 15 pts
    const capEq = Math.min(100, pf.eq + 15);
    const targetEq = Math.max(0, Math.min(capEq, reachable ? targetProfile : Math.max(targetProfile, eqNeeded)));
    // 4) Pondération du versement : logique bande autour de l'expo cible
    const gapEq = targetEq - eqPct;
    const wEq = Math.max(0, Math.min(1, 0.5 + gapEq / (2 * band)));
    let dEq = Math.round((monthly2 * wEq) / 5) * 5;
    dEq = Math.max(0, Math.min(monthly2, dEq));
    const dBd = monthly2 - dEq;
    // 5) Répartition par ligne : priorité aux lignes sous-pondérées, plafond profil
    const horizonFactor = years <= 2 ? 0.6 : years === 3 ? 0.8 : 1;
    const baseCap = profile === "prudent" ? 30 : profile === "dynamique" ? 50 : 40;
    const maxW = baseCap * horizonFactor;
    const eqLines = analysis.rows.filter((r) => r.type === "action");
    const bdLines = analysis.rows.filter((r) => r.type === "monet");
    const belowCap = eqLines.filter((r) => r.weight < maxW);
    const pool = belowCap.length ? belowCap : eqLines;
    const prio = pool.map((r) => (isDiversified(r) ? 1.2 : 0.6) * Math.max(1, maxW - r.weight));
    const wsum = prio.reduce((a, b) => a + b, 0) || 1;
    let eqAmounts = prio.map((w) => Math.round((dEq * w) / wsum / 5) * 5);
    let diff = dEq - eqAmounts.reduce((a, b) => a + b, 0);
    if (eqAmounts.length) eqAmounts[eqAmounts.indexOf(Math.max(...eqAmounts))] += diff;
    const eqSplit = pool.map((r, i) => ({
      nom: r.nom || "(ligne sans nom)", montant: eqAmounts[i] || 0, weight: r.weight,
      compat: r.ref ? peaCompat(bank, r.ref.name) : null,
      note: r.weight >= maxW ? "au plafond — renforce les autres" : isDiversified(r) ? "ETF cœur · prioritaire" : "ligne unique · capée",
    }));
    const bdSplit = bdLines.map((r) => ({ nom: r.nom || "(ligne sans nom)", montant: 0, weight: r.weight, compat: null, note: "poche sécuritaire" }));
    if (bdLines.length === 1) bdSplit[0].montant = dBd;
    return { targetEq, targetProfile, eqNeeded: Math.max(0, Math.min(100, eqNeeded)), reachable, dEq, dBd, eqSplit, bdSplit, capEq, maxW };
  }, [analysis, pf, band, monthly2, goal, fvCapital, years, profile, fraisModel, bank, requiredMonthly]);

  // ---- Allocation optimale PEA : rentabilité maximale sous contrainte de risque ----
  // Blocs éligibles PEA (hyp. rendement/vol annualisés oct. 2026) :
  // pas d'obligations directes en PEA — le monétaire € court terme en est l'équivalent.
  const maxAlloc = useMemo(() => {
    const blocs = [
      { id: "etf-monde", label: "ETF monde (cœur)", icon: "🌍", mu: 7.5, vol: 16 },
      { id: "etf-europe", label: "ETF Europe / zone euro", icon: "🇪🇺", mu: 7, vol: 15 },
      { id: "etf-em", label: "ETF émergents", icon: "🌏", mu: 8, vol: 20 },
      { id: "picking", label: "Picking actions (satellite)", icon: "🎯", mu: 9, vol: 22 },
      { id: "monet", label: "Monétaire € (l'obligataire du PEA)", icon: "💰", mu: bondMuAuto, vol: 0.5 },
    ];
    // Budget actions total = expo cible du mois (stratégie × objectif), le reste en monétaire
    const eqBudget = splitPlan.targetEq;
    // Part satellite picking selon profil (le picking : plus rentable mais non diversifié)
    const sat = profile === "prudent" ? 10 : profile === "dynamique" ? 35 : 20;
    const pickT = eqBudget * sat / 100;
    const restE = Math.max(0, eqBudget - pickT);
    const tgt = {
      picking: pickT,
      "etf-em": restE * 0.12,
      "etf-europe": restE * 0.25,
      "etf-monde": restE * 0.63,
      monet: 100 - eqBudget,
    };
    // Poids actuels par bloc (look-through simplifié : ETF diversifié vs action seule)
    const cur = { "etf-monde": 0, "etf-europe": 0, "etf-em": 0, picking: 0, monet: 0 };
    for (const r of analysis.rows) {
      if (r.type === "monet") { cur.monet += r.weight; continue; }
      if (!isDiversified(r)) { cur.picking += r.weight; continue; }
      const nm = norm(r.nom);
      if (nm.includes("em") || nm.includes("émerg")) cur["etf-em"] += r.weight;
      else if (nm.includes("europe") || nm.includes("cac") || nm.includes("stoxx")) cur["etf-europe"] += r.weight;
      else cur["etf-monde"] += r.weight;
    }
    // Rendement pondéré net de frais + projection horizon vs objectif
    const muBrut = blocs.reduce((a, b) => a + (b.mu * tgt[b.id]) / 100, 0);
    const muNet = muBrut - fraisModel.fraisPct;
    const rn = Math.pow(1 + muNet / 100, 1 / 12) - 1;
    const nM = Math.max(1, years * 12);
    const fvOpt = holdTotal * Math.pow(1 + rn, nM) + monthly2 * ((Math.pow(1 + rn, nM) - 1) / rn);
    const beyond = fvOpt - goal;
    const rows = blocs.map((b) => ({
      ...b, target: tgt[b.id], current: cur[b.id],
      gap: tgt[b.id] - cur[b.id],
    }));
    return { rows, eqBudget, sat, muBrut, muNet, fvOpt, beyond, reachable: splitPlan.reachable };
  }, [splitPlan, profile, analysis.rows, fraisModel, years, monthly2, holdTotal, goal, bondMuAuto]);

  // ---- Dividendes & revenus (estimations 2026) ----
  const divModel = useMemo(() => {
    const perLine = analysis.rows.map((r) => {
      const yld = r.ref ? (DIV_YIELD[r.ref.name] || 0) : 0;
      const dist = r.ref ? (DIV_DIST[r.ref.name] || "cap") : "cap";
      const montant = (r.valeur * yld) / 100;
      return { id: r.id, nom: r.nom, weight: r.weight, valeur: r.valeur, yld, dist, montant };
    });
    const payTotal = perLine.reduce((a, r) => a + r.montant, 0);
    const yldPond = analysis.total > 0 ? (payTotal / analysis.total) * 100 : 0;
    // Calendrier estimé des détachements sur les 12 prochains mois (dates réelles fixées par AG/prospectus)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mk = (y, m, d) => new Date(y, m - 1, d);
    const events = [];
    const inHorizon = (dt) => dt >= today && dt <= new Date(today.getFullYear() + 1, today.getMonth(), Math.min(28, today.getDate()));
    for (const r of perLine) {
      if (r.montant <= 0) continue;
      if (r.dist === "mai") {
        let d = mk(today.getFullYear(), 5, 4);
        if (d < today) d = mk(today.getFullYear() + 1, 5, 4);
        if (inHorizon(d)) events.push({ date: d, nom: r.nom, montant: r.montant, kind: "détachement" });
      } else if (r.dist === "lvmh") {
        let dec = mk(today.getFullYear(), 12, 3);
        if (dec < today) dec = mk(today.getFullYear() + 1, 12, 3);
        let avr = mk(today.getFullYear(), 4, 30);
        if (avr < today) avr = mk(today.getFullYear() + 1, 4, 30);
        if (inHorizon(dec)) events.push({ date: dec, nom: r.nom, montant: r.montant * 0.42, kind: "acompte" });
        if (inHorizon(avr)) events.push({ date: avr, nom: r.nom, montant: r.montant * 0.58, kind: "solde" });
      } else if (r.dist === "trim") {
        for (let i = 1; i <= 4; i++) {
          const q = new Date(today.getFullYear(), today.getMonth() + i, 8);
          if (inHorizon(q)) events.push({ date: q, nom: r.nom, montant: r.montant / 4, kind: "trimestre" });
        }
      }
    }
    events.sort((a, b) => a.date - b.date);
    return { perLine, payTotal, yldPond, events };
  }, [analysis.rows, analysis.total]);

  // ---- Exposition réelle (look-through des ETF) : géographie & secteurs ----
  const expoModel = useMemo(() => {
    const total = analysis.total;
    const geo = { us: 0, eu: 0, asie: 0, em: 0, autres: 0, monet: 0 };
    const sec = { tech: 0, finance: 0, industrie: 0, conso: 0, sante: 0, energie: 0, autres: 0, monet: 0 };
    let fr = 0;
    for (const r of analysis.rows) {
      const g = r.ref ? GEO_MAP[r.ref.name] : (r.type === "monet" ? G_MON : { eu: 100, fr: 60 });
      const s = r.ref ? SECTOR_MAP[r.ref.name] : (r.type === "monet" ? { monet: 100 } : { autres: 100 });
      for (const k of ["us", "eu", "asie", "em", "autres", "monet"]) if (g[k]) geo[k] += (r.valeur * g[k]) / 100;
      for (const k of ["tech", "finance", "industrie", "conso", "sante", "energie", "autres", "monet"]) if (s[k]) sec[k] += (r.valeur * s[k]) / 100;
      if (g.fr) fr += (r.valeur * g.fr) / 100;
    }
    const pct = (x) => (total > 0 ? (x / total) * 100 : 0);
    const geoList = [
      { label: "🇺🇸 États-Unis", pct: pct(geo.us) },
      { label: "🇪🇺 Europe", pct: pct(geo.eu) },
      { label: "🌏 Asie développée", pct: pct(geo.asie) },
      { label: "🌍 Émergents", pct: pct(geo.em) },
      { label: "💰 Monétaire €", pct: pct(geo.monet) },
      { label: "🗺️ Autres", pct: pct(geo.autres) },
    ].filter((x) => x.pct > 0.5);
    const secList = [
      { label: "🖥️ Tech & comms", pct: pct(sec.tech) },
      { label: "🏦 Finance", pct: pct(sec.finance) },
      { label: "🏭 Industrie", pct: pct(sec.industrie) },
      { label: "🛍️ Consommation & luxe", pct: pct(sec.conso) },
      { label: "💊 Santé", pct: pct(sec.sante) },
      { label: "⚡ Énergie", pct: pct(sec.energie) },
      { label: "💰 Monétaire €", pct: pct(sec.monet) },
      { label: "🗺️ Autres", pct: pct(sec.autres) },
    ].filter((x) => x.pct > 0.5);
    return { geoList, secList, usPct: pct(geo.us), frPct: pct(fr) };
  }, [analysis.rows, analysis.total]);

  // ---- Historique de performance : relevés locaux (1 point/jour max) ----
  const saveHist = (h) => { setHistory(h); try { localStorage.setItem("peaHist", JSON.stringify(h)); } catch (e) {} };
  const snapshot = () => {
    const d = new Date();
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    saveHist([...history.filter((x) => x.d !== iso),
      { d: iso, total: Math.round(analysis.total), invested: Math.round(analysis.invested), pnl: Math.round(analysis.pnl) },
    ].sort((a, b) => (a.d < b.d ? -1 : 1)));
  };
  const histData = history.map((h) => ({
    ...h,
    label: new Date(h.d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
  }));

  // ---- Alertes actives ----
  const alerts = useMemo(() => {
    const list = [];
    const push = (sev, icon, text) => list.push({ sev, icon, text });
    // Anniversaire des 5 ans du PEA (exonération d'impôt sur le revenu)
    const opened = peaOpenISO ? new Date(peaOpenISO + "T12:00:00") : null;
    if (opened && !isNaN(opened.getTime())) {
      const anniv = new Date(opened.getTime()); anniv.setFullYear(anniv.getFullYear() + 5);
      const days = Math.round((anniv - today0) / 86400000);
      if (days > 90) push("info", "🎂", `PEA ouvert le ${frDate(peaOpenISO)} — exonération d'IR dans ${days} j (5 ans le ${frDate(anniv.toISOString().slice(0, 10))}).`);
      else if (days > 0) push("warn", "🎂", `Anniversaire des 5 ans du PEA dans ${days} j (${frDate(anniv.toISOString().slice(0, 10))}) — au-delà, les retraits ne supportent plus l'IR (PS 17,2 % seuls).`);
      else push("good", "🎂", "PEA de plus de 5 ans : retraits exonérés d'impôt sur le revenu (prélèvements sociaux 17,2 % seuls).");
    }
    // Dérive d'allocation vs bande
    if (analysis.total > 0 && Math.abs(analysis.eqPct - pf.eq) > band)
      push("warn", "⚖️", `Dérive d'allocation : ${analysis.eqPct.toFixed(0)} % d'actions vs cible ${pf.eq} % (bande ±${band} pts) — ${analysis.eqPct > pf.eq ? "orientez le DCA vers la poche sécuritaire" : "orientez 100 % du DCA vers les actions"}.`);
    // Concentration d'une action seule
    if (analysis.maxSingle > 40)
      push("bad", "🎯", `Concentration excessive : une action seule pèse ${analysis.maxSingle.toFixed(0)} % du portefeuille — un plan de réduction est proposé dans les réajustements.`);
    // Frais
    if (analysis.total > 0 && fraisModel.fraisPct > 1)
      push("warn", "💶", `Frais élevés : ${fraisModel.fraisPct.toFixed(2)} %/an (${fmt(fraisModel.fraisAn)}) — TER et courtage à optimiser.`);
    // Fraîcheur des données marché
    if (majAge > 60) push("warn", "🔄", `Analyse marché périmée (${majAge} j) — demandez « mets à jour les données de marché » en chat.`);
    // Versement DCA à venir
    const invDays = Math.round((nextInv - today0) / 86400000);
    if (invDays <= 3) push("info", "📅", `Versement DCA à venir le ${nextInv.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — ${fmt(monthly2)} à répartir selon le plan.`);
    // Détachement de dividende à venir ≤ 60 j
    for (const ev of divModel.events) {
      const d = Math.round((ev.date - today0) / 86400000);
      if (d >= 0 && d <= 60) {
        push("good", "💸", `${ev.nom || "(ligne sans nom)"} : ${ev.kind} estimé ≈ ${fmt(ev.montant)} vers le ${ev.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — versé dans le PEA, à réinvestir.`);
        break;
      }
    }
    // Objectif hors trajectoire
    if (analysis.total > 0 && !goalOk)
      push("warn", "🎯", `Objectif ${fmt(goal)} hors trajectoire : versement requis ≈ ${fmt(requiredMonthly)}/mois (vs ${fmt(monthly2)}).`);
    const rank = { bad: 0, warn: 1, info: 2, good: 3 };
    return list.sort((a, b) => rank[a.sev] - rank[b.sev]);
  }, [peaOpenISO, analysis, pf, band, fraisModel, majAge, nextInv, today0, divModel, goalOk, goal, requiredMonthly, monthly2]);

  // ---- Réponse PEA ----
  const peaAnswer = useMemo(() => {
    const eqPct = analysis.eqPct;
    const gapEq = pf.eq - eqPct;
    const wEq = Math.max(0, Math.min(1, 0.5 + gapEq / (2 * band)));
    const dEq = Math.round(monthly2 * wEq / 5) * 5;
    const dBd = monthly2 - dEq;
    const parts = [];
    parts.push(`Contexte (oct. 2026) : consensus ${consensusLabel.toLowerCase()} (${sigPct >= 0 ? "+" : ""}${sigPct}/100 sur 16 sources). CAPE US et Buffett Indicator chers (GMO, Shiller prudents), mais Berkshire redéploie, l'Europe garde sa décote et le DCA lisse vos points d'entrée.`);
    parts.push(`Versement ${fmt(monthly2)} → ${fmt(dEq)} sur la poche actions et ${fmt(dBd)} sur la poche sécuritaire${eqPct > pf.eq ? " (réduit car vous êtes déjà sur-pondéré en actions)" : ""}.`);
    if (goalOk) parts.push(`Objectif ${fmt(goal)} en ${years} ans : sur la bonne trajectoire (requis ≈ ${fmt(requiredMonthly)}/mois).`);
    else parts.push(`Objectif ${fmt(goal)} : avec ${fmt(monthly2)}/mois il manquera ~${fmt(Math.max(0, goal - fvCapital))} — visez ${fmt(fvCapital + monthly2 * annuity)} ou augmentez l'horizon.`);
    if (divModel.payTotal > 0) parts.push(`💸 Dividendes estimés ≈ ${fmt(Math.round(divModel.payTotal))}/an (${fmt(Math.round(divModel.payTotal / 12))}/mois) — versés dans l'enveloppe sans imposition, ils s'ajoutent au DCA et composent seuls.`);
    if (analysis.nEff < 3 && analysis.total > 0) parts.push(`⚠️ Résilience faible (${analysis.nEff.toFixed(1)} lignes effectives) : diversifiez plutôt que d'ajouter à la même ligne.`);
    if (eqPct < pf.eq - band && analysis.total > 0) parts.push(`📈 Sous-exposition actions (${eqPct.toFixed(0)} % vs cible ${pf.eq} %) : orientez 100 % du DCA vers la poche actions jusqu'à revenir dans la bande — aucune vente nécessaire.`);
    if (sigPct < -25) parts.push(`Signal baissier dominant : gardez le rythme DCA mais privilégiez la poche sécuritaire.`);
    else if (sigPct > 25) parts.push(`Signal acheteur dominant : DCA plus large sur les actions en respectant la cible ${pf.eq} %.`);
    parts.push(`Garde-fous : ±${band} pts max autour de la cible, le DCA comble les écarts sans vendre, glide path vers ${pf.glideTo} % actions à l'horizon.`);
    return parts;
  }, [monthly2, pf, band, goalOk, goal, years, requiredMonthly, analysis, sigPct, fvCapital, annuity, divModel]);

  const glide = Array.from({ length: years * 12 + 1 }, (_, m) => {
    const t = m / (years * 12);
    return {
      annee: +(m / 12).toFixed(2),
      actions: +(pf.eq + (pf.glideTo - pf.eq) * t).toFixed(1),
      oblig: +(100 - (pf.eq + (pf.glideTo - pf.eq) * t)).toFixed(1),
    };
  });

  const eqNow = tactical ? Math.max(0, Math.min(100, pf.eq + sigPct * 0.15)) : pf.eq;
  const tabs = [
    { id: "sim", label: "📈 Simulation" },
    { id: "pf", label: "💼 Portefeuille" },
    { id: "risk", label: "🧭 Analyse & risques" },
    { id: "reco", label: "💡 Recommandations" },
  ];
  const tabBtn = (t) =>
    "rounded-xl px-3 py-2 text-sm font-medium transition whitespace-nowrap " +
    (tab === t ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-slate-400 hover:bg-slate-700/60 hover:text-slate-200");

  const riskGauge = [{ name: "risque", value: riskPosture.riskLevel,
    fill: riskPosture.riskLevel < 50 ? "#34d399" : riskPosture.riskLevel < 70 ? "#fbbf24" : "#fb7185" }];

  return (
    (React.createElement("div", {"className": "min-h-screen bg-slate-900 p-3 font-sans text-slate-100 sm:p-4"}, (React.createElement("div", {"className": "mx-auto max-w-6xl space-y-4"}, (React.createElement("div", {"className": "rounded-2xl border border-slate-700/60 bg-slate-800/60 p-4 shadow-lg"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-3"}, (React.createElement("div", null, (React.createElement("h1", {"className": "text-xl font-black tracking-tight"}, "\ud83e\udd16", (React.createElement("span", {"className": "bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent"}, "PEA Co-Pilot")), (React.createElement("span", {"className": "mt-0.5 block text-[11px] font-medium text-slate-400 sm:ml-2 sm:inline sm:text-sm"}, "Horizon\u00A0", (years), "\u00A0ans")))), (React.createElement("p", {"className": "mt-0.5 text-xs text-slate-400"}, "DCA\u00A0", (monthly), "\u00A0\u20ac/mois \u00b7 Objectif\u00A0", (fmt(goal)), "\u00b7 Profil\u00A0", (pf.label))))), (React.createElement("div", {"className": "flex flex-wrap items-center gap-2"}, (React.createElement(Pill, {"tone": (sigPct > 25 ? "good" : sigPct < -25 ? "bad" : "warn")}, "\ud83d\udce1 Consensus\u00A0", (consensusLabel), (sigPct >= 0 ? "+" : ""), (sigPct), (React.createElement("span", {"className": "hidden opacity-70 sm:inline"}, "\u00A0\u00b7 16 sources, MAJ\u00A0", (frDate(majISO)))))), (React.createElement(Pill, {"tone": (riskPosture.alignment ? "good" : "warn")}, "\u2696\ufe0f Risque\u00A0", (riskPosture.riskLevel), "/100")), (React.createElement(Pill, {"tone": (riskPosture.efficiency === "Optimale" ? "good" : riskPosture.efficiency === "Excessive" ? "bad" : "warn")}, "\ud83d\udd01", (riskPosture.efficiency))), (alerts.length > 0 && (
                (React.createElement(Pill, {"tone": (alerts.some((a) => a.sev === "bad") ? "bad" : alerts.some((a) => a.sev === "warn") ? "warn" : "good")}, "\ud83d\udd14", (alerts.length), "\u00A0alerte", (alerts.length > 1 ? "s" : "")))
              )))))), (React.createElement("div", {"className": "mt-3 flex gap-1.5 overflow-x-auto pb-1"}, (tabs.map((t) => (
              (React.createElement("button", {"key": (t.id), "onClick": (() => setTab(t.id)), "className": (tabBtn(t.id))}, (t.label)))
            ))))))), (tab === "sim" && (
          (React.createElement("div", {"className": "grid gap-4 md:grid-cols-3"}, (React.createElement(Card, {"title": "Param\u00e8tres", "icon": "\u2699\ufe0f", "className": "space-y-3 md:col-span-1"}, (React.createElement(Slider, {"label": "Versement mensuel\u00A0", "value": (monthly), "min": (100), "max": (1000), "step": (25), "onChange": (setMonthly), "suffix": " \u20ac"})), (React.createElement(Slider, {"label": "Capital initial", "value": (capital0), "min": (0), "max": (50000), "step": (1000), "onChange": (setCapital0), "suffix": " \u20ac"})), (React.createElement(Slider, {"label": "Horizon", "value": (years), "min": (1), "max": (30), "step": (1), "onChange": (setYears), "suffix": " ans"})), (React.createElement(Slider, {"label": "Bande de rebalancement", "value": (band), "min": (3), "max": (25), "step": (1), "onChange": (setBand), "suffix": " pts"})), (React.createElement("div", {"className": "rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 py-2"}, (React.createElement("div", {"className": "flex items-center justify-between text-xs"}, (React.createElement("span", {"className": "text-slate-400"}, "\ud83c\udfe6 Rendement obligataire (auto)")), (React.createElement("b", {"className": "text-indigo-300"}, (String(bondMuAuto).replace(".", ",")), "%/an")))), (React.createElement("p", {"className": "mt-0.5 text-[10px] leading-snug text-slate-500"}, "60 % mon\u00e9taire (d\u00e9p\u00f4t BCE", (RATES.bce.toFixed(2).replace(".", ",")), "% + 30 pb) + 40 % taux longs (OAT", (RATES.oat10.toFixed(1).replace(".", ",")), "%) \u2014 recalcul\u00e9 \u00e0 chaque mise \u00e0 jour des taux.")))), (React.createElement("div", {"className": "rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 py-2"}, (React.createElement("div", {"className": "flex items-center justify-between text-xs"}, (React.createElement("span", {"className": "text-slate-400"}, "\ud83d\udcc9 Inflation (auto)")), (React.createElement("b", {"className": "text-indigo-300"}, (String(inflationAuto).replace(".", ",")), "%/an")))), (React.createElement("p", {"className": "mt-0.5 text-[10px] leading-snug text-slate-500"}, "IPCH France 3,4 % (sept. 2026) pond\u00e9r\u00e9e avec la cible BCE 2 % \u2014 d\u00e9flateur du m\u00e9dian r\u00e9el sur l'horizon.")))), (React.createElement("div", {"className": "rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 py-2"}, (React.createElement("div", {"className": "flex items-center justify-between text-xs"}, (React.createElement("span", {"className": "text-slate-400"}, "\ud83d\udcb6 Frais r\u00e9els (calcul\u00e9s)")), (React.createElement("b", {"className": "text-indigo-300"}, (fraisModel.fraisPct.toFixed(2)), "%/an")))), (React.createElement("p", {"className": "mt-0.5 text-[10px] leading-snug text-slate-500"}, "TER pond\u00e9r\u00e9", (fraisModel.terPond.toFixed(2)), "% + courtage", (BANKS[bank].label), (fmt(fraisModel.courtageAn)), "/an \u2014 d\u00e9tail par ligne et impact horizon dans l'onglet Portefeuille.")))), (React.createElement("div", null, (React.createElement("div", {"className": "mb-1.5 text-xs text-slate-400"}, "Profil de risque")), (React.createElement("div", {"className": "flex gap-1.5"}, (Object.entries(PROFILES).map(([k, v]) => (
                    (React.createElement("button", {"key": (k), "onClick": (() => setProfile(k)), "className": ("flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition " +
                        (profile === k ? "bg-indigo-500 text-white" : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"))}, (v.label)))
                  ))))))), (React.createElement("label", {"className": "flex items-center gap-2 text-xs text-slate-300"}, (React.createElement("input", {"type": "checkbox", "checked": (tactical), "onChange": ((e) => setTactical(e.target.checked)), "className": "h-4 w-4 accent-indigo-500"})), "Tilt tactique selon consensus analyste")))), (React.createElement(Card, {"title": "Projection Monte Carlo \u2014 400 sc\u00e9narios", "icon": "\ud83d\udcca", "className": "md:col-span-2"}, (React.createElement("div", {"className": "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"}, (React.createElement(Kpi, {"label": "Total vers\u00e9", "value": (fmt(stats.verse))})), (React.createElement(Kpi, {"label": "M\u00e9dian", "value": (fmt(stats.med)), "tone": "accent"})), (React.createElement(Kpi, {"label": "P95", "value": (fmt(stats.p95)), "tone": "good"})), (React.createElement(Kpi, {"label": "P5", "value": (fmt(stats.p5)), "tone": "bad"})))), (React.createElement("div", {"className": "h-64"}, (React.createElement(ResponsiveContainer, null, (React.createElement(AreaChart, {"data": (stats.pct)}, (React.createElement("defs", null, (React.createElement("linearGradient", {"id": "gmed", "x1": "0", "y1": "0", "x2": "0", "y2": "1"}, (React.createElement("stop", {"offset": "0%", "stopColor": "#6366f1", "stopOpacity": (0.45)})), (React.createElement("stop", {"offset": "100%", "stopColor": "#6366f1", "stopOpacity": (0.02)})))))), (React.createElement(CartesianGrid, {"strokeDasharray": "3 3", "stroke": "#334155"})), (React.createElement(XAxis, {"dataKey": "annee", "tickFormatter": ((v) => `${v.toFixed(1)}a`), "stroke": "#94a3b8", "fontSize": (11)})), (React.createElement(YAxis, {"tickFormatter": (fmtK), "stroke": "#94a3b8", "fontSize": (11)})), (React.createElement(Tooltip, {"contentStyle": ({ background: "#1e293b", border: "1px solid #475569", borderRadius: 12 }), "formatter": ((v) => fmt(Number(v))), "labelFormatter": ((l) => `Année ${Number(l).toFixed(1)}`)})), (React.createElement(ReferenceLine, {"y": (stats.verse), "stroke": "#94a3b8", "strokeDasharray": "5 5", "label": ({ value: "Total versé", fontSize: 11, fill: "#94a3b8", position: "insideTopLeft" })})), (React.createElement(Area, {"dataKey": "p95", "stroke": "#34d399", "fill": "none", "strokeWidth": (1.5), "name": "P95"})), (React.createElement(Area, {"dataKey": "p50", "stroke": "#818cf8", "fill": "url(#gmed)", "strokeWidth": (2.5), "name": "M\u00e9dian"})), (React.createElement(Area, {"dataKey": "p5", "stroke": "#fb7185", "fill": "none", "strokeWidth": (1.5), "name": "P5"})), (React.createElement(Legend, {"wrapperStyle": ({ fontSize: 12 })})))))))), (React.createElement("div", {"className": "mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2"}, (React.createElement("div", {"className": "rounded-xl border border-slate-700/60 bg-slate-900/60 p-2.5"}, "Probabilit\u00e9 de finir", (React.createElement("b", null, "au-dessus du vers\u00e9")), ":", (" "), (React.createElement("b", {"className": (stats.probaGain > 0.7 ? "text-emerald-400" : "text-amber-400")}, ((stats.probaGain * 100).toFixed(0)), "%")))), (React.createElement("div", {"className": "rounded-xl border border-slate-700/60 bg-slate-900/60 p-2.5"}, "M\u00e9dian en", (React.createElement("b", null, "euros r\u00e9els")), ":", (React.createElement("b", {"className": "text-indigo-300"}, (fmt(stats.medReel)))))))))), (React.createElement(Card, {"title": "March\u00e9 des taux (r\u00e9f\u00e9rence)", "icon": "\ud83c\udfe6", "className": "md:col-span-3"}, (React.createElement("div", {"className": "grid grid-cols-2 gap-2 sm:grid-cols-4"}, (React.createElement(Kpi, {"label": "BCE \u2014 d\u00e9p\u00f4t (CT)", "value": (`${RATES.bce.toFixed(2).replace(".", ",")} %`), "sub": "effectif depuis le 16/09/2026", "tone": "accent"})), (React.createElement(Kpi, {"label": "BCE \u2014 refinancement", "value": (`${RATES.bceRefi.toFixed(2).replace(".", ",")} %`), "sub": (`prêt marginal 2,90 %`)})), (React.createElement(Kpi, {"label": "OAT 10 ans (taux long)", "value": (`~${RATES.oat10.toFixed(1).replace(".", ",")} %`), "sub": (`Bund 10 ans ${RATES.bund10.toFixed(1).replace(".", ",")} %`), "tone": "warn"})), (React.createElement(Kpi, {"label": "Spread OAT/Bund", "value": (`${RATES.spreadOatBund} pb`), "sub": "prime de risque France \u2014 \u00e9lev\u00e9e", "tone": "bad"})))), (React.createElement("p", {"className": "mt-2 text-[10px] text-slate-500"}, "Donn\u00e9es au", (RATES.maj), "\u00b7 analyse re-valid\u00e9e le", (frDate(majISO)), "\u00b7 prochaine r\u00e9union BCE le", (RATES.prochaineBCE), "(consensus : statu quo, hausse possible en d\u00e9cembre face \u00e0 l'inflation ~3 %). Le rendement de la poche obligataire de vos simulations est calcul\u00e9 automatiquement : 60 % mon\u00e9taire (d\u00e9p\u00f4t BCE + 30 pb) + 40 % taux longs (OAT 10 ans) \u2248", (String(bondMuAuto).replace(".", ",")), "%/an \u2014 et l'inflation attendue (", (String(inflationAuto).replace(".", ",")), "%/an, IPCH FR vs cible BCE) d\u00e9flate le m\u00e9dian. Les deux suivent la carte des taux \u00e0 chaque mise \u00e0 jour mensuelle.")))), (React.createElement(Card, {"title": "Glide path \u2014 d\u00e9riskage vers l'horizon", "icon": "\ud83d\udeec", "className": "md:col-span-2"}, (React.createElement("div", {"className": "h-52"}, (React.createElement(ResponsiveContainer, null, (React.createElement(LineChart, {"data": (glide)}, (React.createElement(CartesianGrid, {"strokeDasharray": "3 3", "stroke": "#334155"})), (React.createElement(XAxis, {"dataKey": "annee", "tickFormatter": ((v) => `${v.toFixed(0)}a`), "stroke": "#94a3b8", "fontSize": (11)})), (React.createElement(YAxis, {"domain": ([0, 100]), "unit": "%", "stroke": "#94a3b8", "fontSize": (11)})), (React.createElement(Tooltip, {"contentStyle": ({ background: "#1e293b", border: "1px solid #475569", borderRadius: 12 }), "formatter": ((v) => `${Number(v).toFixed(0)} %`), "labelFormatter": ((l) => `Année ${Number(l).toFixed(1)}`)})), (React.createElement(Legend, {"wrapperStyle": ({ fontSize: 12 })})), (React.createElement(Line, {"dataKey": "actions", "stroke": "#818cf8", "strokeWidth": (2.5), "dot": (false), "name": "Actions"})), (React.createElement(Line, {"dataKey": "oblig", "stroke": "#38bdf8", "strokeWidth": (2), "dot": (false), "name": "Oblig. / mon\u00e9taire"})))))))))), (React.createElement(Card, {"title": "Consensus analystes", "icon": "\ud83e\udde0", "className": "md:col-span-1"}, (React.createElement("div", {"className": "mb-3 relative h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"}, (React.createElement("div", {"className": "absolute top-[-4px] h-[18px] w-1.5 rounded bg-white shadow", "style": ({ left: `calc(${(sigPct + 100) / 2}% - 3px)` })})))), (React.createElement("div", {"className": "max-h-[430px] space-y-1.5 overflow-auto pr-1"}, (ANALYSTS.map((a) => (
                  (React.createElement("div", {"key": (a.nom), "className": "rounded-xl border border-slate-700/50 bg-slate-900/50 p-2"}, (React.createElement("div", {"className": "flex items-center justify-between gap-1"}, (React.createElement("span", {"className": "text-xs font-semibold text-slate-200"}, (a.avatar), (a.nom))), (React.createElement(Pill, {"tone": (a.etat === "haussier" ? "good" : a.etat === "baissier" ? "bad" : "warn")}, (a.etat === "haussier" ? "▲" : a.etat === "baissier" ? "▼" : "="), "\u00d7", (a.poids))))), (React.createElement("p", {"className": "mt-0.5 text-[11px] leading-snug text-slate-400"}, (a.note)))))
                )))))))))
        )), (tab === "pf" && (
          (React.createElement("div", {"className": "space-y-4"}, (React.createElement("div", {"className": "grid gap-4 lg:grid-cols-2"}, (React.createElement(Card, {"title": "Mes lignes & objectif", "icon": "\ud83d\udccb", "className": "space-y-3"}, (React.createElement("div", {"className": "grid grid-cols-1 gap-2 sm:grid-cols-2"}, (React.createElement("div", null, (React.createElement("div", {"className": "mb-1 text-[11px] text-slate-400"}, "\ud83c\udfe6 Ma banque (compatibilit\u00e9 PEA)")), (React.createElement("select", {"value": (bank), "onChange": ((e) => setBank(e.target.value)), "className": "w-full rounded-lg border border-slate-600/70 bg-slate-900/70 px-2.5 py-2.5 text-sm text-slate-100"}, (Object.entries(BANKS).map(([k, b]) => (
                        (React.createElement("option", {"key": (k), "value": (k)}, (b.label)))
                      ))))), (React.createElement("p", {"className": "mt-1 text-[10px] leading-snug text-slate-500"}, (BANKS[bank].note))))), (React.createElement("div", {"className": "flex items-end"}, (React.createElement("div", {"className": "w-full"}, (React.createElement(Slider, {"label": "Objectif \u00e0 l'horizon", "value": (goal), "min": (10000), "max": (100000), "step": (1000), "onChange": (setGoal), "suffix": " \u20ac"})))))))), (React.createElement("div", {"className": ("rounded-xl border p-2.5 text-xs " +
                  (goalOk ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"))}, (goalOk
                    ? (React.createElement(React.Fragment, null, "\u2705 Objectif", (fmt(goal)), ": versement requis \u2248", (React.createElement("b", null, (fmt(requiredMonthly)), "/mois")), "\u2014 votre", (fmt(monthly2)), "suffit."))
                    : (React.createElement(React.Fragment, null, "\u26a0\ufe0f Pour", (fmt(goal)), ": il faudrait \u2248", (React.createElement("b", null, (fmt(requiredMonthly)), "/mois")), "(vs", (fmt(monthly2)), ")."))))), (React.createElement("div", {"className": "space-y-2"}, (valLines.map((l) => (
                    (React.createElement("div", {"key": (l.id), "className": "space-y-2 rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"}, (React.createElement("div", {"className": "flex items-center gap-2"}, (React.createElement(LinePicker, {"allKeys": (allKeys), "value": (l.nom), "onPick": ((v) => { upLine(l.id, "nom", v); const _r = resolveHolding(v); if (_r) upLine(l.id, "type", _r.type === "Mon\u00e9taire" ? "monet" : "action"); })})), (React.createElement("button", {"onClick": (() => rmLine(l.id)), "className": "shrink-0 rounded-lg px-2.5 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10"}, "\u2715")))), (React.createElement("div", {"className": "grid grid-cols-[1fr_1fr_auto] items-center gap-2"}, (React.createElement("div", {"className": "flex items-center"}, (React.createElement(Pill, {"tone": (l.type === "monet" ? "neutral" : "accent")}, (l.type === "monet" ? "\ud83d\udcb0 Oblig. / Mon\u00e9t. \u00b7 auto" : "\ud83d\udcc8 Action \u00b7 auto"))))), (React.createElement("input", {"type": "number", "value": (l.valeur), "onChange": ((e) => upLine(l.id, "valeur", Number(e.target.value) || 0)), "title": "Valeur actuelle \u20ac", "placeholder": "Valeur \u20ac", "className": "w-full rounded-lg border border-slate-600/70 bg-slate-900/70 px-2.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"})), (React.createElement("input", {"type": "number", "value": (l.pv), "onChange": ((e) => upLine(l.id, "pv", Number(e.target.value) || 0)), "title": "\u00b1 value en \u20ac (plus ou moins-value) \u2014 le % est calcul\u00e9 automatiquement", "placeholder": "\u00b1 \u20ac", "className": "w-20 rounded-lg border border-slate-600/70 bg-slate-900/70 px-2 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 sm:w-24 sm:px-2.5"})))), (l.valeur > 0 && (
                        (React.createElement("div", {"className": "flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500"}, (React.createElement("span", null, "Investi \u2248", (React.createElement("b", {"className": "text-slate-400"}, (fmt(l.invested)))))), (React.createElement("span", {"className": ((l.valo >= 0 ? "text-emerald-400/90" : "text-rose-400/90"))}, (l.valo >= 0 ? "+" : ""), (String(l.valo.toFixed(1)).replace(".", ",")), "% calcul\u00e9 auto"))))
                      )), (l.ref && (() => {
                        const compat = peaCompat(bank, l.ref.name);
                        return (
                          (React.createElement("div", {"className": "flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"}, (React.createElement(Pill, {"tone": "accent"}, "\u2713", (l.ref.name))), (React.createElement(Pill, {"tone": "neutral"}, (l.ref.type), "\u00b7", (l.ref.indice))), (React.createElement(Pill, {"tone": "neutral"}, (l.ref.isin))), (React.createElement(Pill, {"tone": "neutral"}, "Ticker", (l.ref.ticker))), (l.ref.ter > 0 && (React.createElement(Pill, {"tone": "neutral"}, "TER", (l.ref.ter), "%"))), (PRICES[l.ref.name] && (
                              (React.createElement(Pill, {"tone": "neutral"}, "\ud83d\udcc8 Cours r\u00e9f.", (String(PRICES[l.ref.name]).replace(".", ",")), "\u20ac \u00b7 \u2248", (Math.max(1, Math.round(l.valeur / PRICES[l.ref.name]))), "parts"))
                            )), (DIV_YIELD[l.ref.name] > 0 && (
                              (React.createElement(Pill, {"tone": ((DIV_DIST[l.ref.name] || "cap") === "cap" ? "neutral" : "good")}, "\ud83d\udcb8", (String(DIV_YIELD[l.ref.name]).replace(".", ",")), "%/an", ((DIV_DIST[l.ref.name] || "cap") === "cap" ? "(réinvesti)" : "(versé)")))
                            )), (compat === "ok" ? (
                              (React.createElement(Pill, {"tone": "good"}, "\ud83c\udfe6 \u00c9ligible PEA", (BANKS[bank].label)))
                            ) : compat === "check" ? (
                              (React.createElement(Pill, {"tone": "warn"}, "\ud83c\udfe6 \u00c0 v\u00e9rifier dans l'app", (BANKS[bank].label)))
                            ) : (
                              (React.createElement(Pill, {"tone": "bad"}, "\ud83c\udfe6 Non r\u00e9f\u00e9renc\u00e9 PEA", (BANKS[bank].label), "\u2014 incompatible"))
                            )), (React.createElement("span", {"className": "w-full leading-snug text-slate-500"}, (l.ref.pays), "\u2014", (l.ref.notes)))))
                        );
                      })())))
                  ))), (React.createElement("button", {"onClick": (addLine), "className": "rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"}, "+ Ajouter une ligne")))), (React.createElement("div", null, (React.createElement("label", {"className": "mb-1 block text-[11px] text-slate-400"}, "\ud83d\udcf7 Photo du portefeuille (locale, session)")), (React.createElement("input", {"type": "file", "accept": "image/*", "onChange": (onPhoto), "className": "w-full rounded-lg border border-slate-600/70 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-500 file:px-2 file:py-1 file:text-white"})), (photo ? (
                    (React.createElement("div", {"className": "mt-2"}, (React.createElement("img", {"src": (photo), "alt": "Mon portefeuille", "className": "max-h-44 w-full rounded-xl border border-slate-700 object-contain"})), (React.createElement("button", {"onClick": (() => setPhoto(null)), "className": "mt-1 text-[11px] text-rose-400 hover:underline"}, "Supprimer"))))
                  ) : (
                    (React.createElement("div", {"className": "mt-2 flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-slate-700 text-[11px] text-slate-500"}, "Capture Fortuneo pour r\u00e9f\u00e9rence"))
                  )))))), (React.createElement(Card, {"title": "Performance & r\u00e9silience", "icon": "\ud83e\ude7a"}, (React.createElement("div", {"className": "grid grid-cols-2 gap-2"}, (React.createElement(Kpi, {"label": "Valeur totale", "value": (fmt(analysis.total))})), (React.createElement(Kpi, {"label": "+/- value", "value": (`${analysis.pnl >= 0 ? "+" : ""}${fmt(analysis.pnl)}`), "sub": (`${analysis.pnlPct >= 0 ? "+" : ""}${analysis.pnlPct.toFixed(1)} %`), "tone": (analysis.pnl >= 0 ? "good" : "bad")})), (React.createElement(Kpi, {"label": "% actions", "value": (`${analysis.eqPct.toFixed(0)} %`), "sub": (`cible ${pf.eq} %`), "tone": "accent"})), (React.createElement(Kpi, {"label": "Stress -30 % actions", "value": (`-${fmt(analysis.stressLoss)}`), "tone": "warn"})))), (React.createElement("div", {"className": "mt-3 space-y-2"}, (React.createElement("div", {"className": "flex items-center gap-2 text-xs"}, (React.createElement("span", {"className": "w-24 shrink-0 text-slate-400"}, "R\u00e9silience")), (React.createElement(Bar, {"pct": (analysis.resilience), "tone": (analysis.resilience > 65 ? "good" : analysis.resilience > 40 ? "warn" : "bad")})), (React.createElement("b", null, (analysis.resilience.toFixed(0)), "/100")))), (React.createElement("div", {"className": "flex items-center gap-2 text-xs"}, (React.createElement("span", {"className": "w-24 shrink-0 text-slate-400"}, "Diversification")), (React.createElement(Bar, {"pct": ((analysis.nEff / 8) * 100), "tone": (analysis.nEff >= 6 ? "good" : analysis.nEff >= 3 ? "warn" : "bad")})), (React.createElement("b", null, (analysis.nEff.toFixed(1)), "eff.")))))), (React.createElement("ul", {"className": "mt-3 space-y-1 text-[11px] text-slate-400"}, (React.createElement("li", null, "\u2022 Pire ligne :", (React.createElement("b", {"className": "text-slate-200"}, (analysis.maxWeight.toFixed(0)), "%")), "du total (HHI", (analysis.hhi.toFixed(0)), ")")), (React.createElement("li", null, "\u2022 Volatilit\u00e9 estim\u00e9e :", (React.createElement("b", {"className": "text-slate-200"}, (analysis.vol.toFixed(1)), "%")), "(plafond profil", (pf.eqVol), "%)")), (analysis.best && analysis.best.valeur > 0 && (
                    (React.createElement("li", null, "\u2022 Best :", (React.createElement("b", {"className": "text-emerald-300"}, (analysis.best.nom || "?"), "(", (analysis.best.pnlPct > 0 ? "+" : ""), (analysis.best.pnlPct), "%)")), "\u00b7 Worst :", (React.createElement("b", {"className": "text-rose-300"}, (analysis.worst.nom || "?"), "(", (analysis.worst.pnlPct > 0 ? "+" : ""), (analysis.worst.pnlPct), "%)"))))
                  )))), (analysis.rows.length > 0 && (
                  (React.createElement("div", {"className": "mt-3 max-h-64 space-y-1.5 overflow-auto pr-1"}, (analysis.rows.map((r) => (
                      (React.createElement("div", {"key": (r.id), "className": "rounded-lg border border-slate-700/50 bg-slate-900/50 p-2"}, (React.createElement("div", {"className": "flex items-center justify-between gap-2 text-xs"}, (React.createElement("span", {"className": "truncate font-semibold text-slate-200"}, (r.nom || "(sans nom)"))), (React.createElement("span", {"className": "shrink-0 text-slate-400"}, (fmt(r.valeur)), "\u00b7", (r.weight.toFixed(0)), "%")))), (React.createElement("div", {"className": "mt-1 flex items-center gap-2"}, (React.createElement(Bar, {"pct": (r.weight), "tone": (r.valo >= 0 ? "accent" : "bad")})), (React.createElement("span", {"className": ("shrink-0 text-[11px] font-bold " + (r.valo >= 0 ? "text-emerald-400" : "text-rose-400"))}, (r.valo >= 0 ? "+" : ""), (r.valo), "%"))))))
                    )))))
                )))))), (React.createElement(Card, {"title": "Frais r\u00e9els \u2014 banque \u00d7 supports \u00d7 horizon", "icon": "\ud83d\udcb6"}, (React.createElement("div", {"className": "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"}, (React.createElement(Kpi, {"label": "TER pond\u00e9r\u00e9", "value": (`${fraisModel.terPond.toFixed(2)} %`), "sub": (`gestion ${fmt(fraisModel.terAn)}/an`), "tone": "accent"})), (React.createElement(Kpi, {"label": "Courtage / an", "value": (fmt(fraisModel.courtageAn)), "sub": (BANKS[bank].label)})), (React.createElement(Kpi, {"label": "Total frais / an", "value": (fmt(fraisModel.fraisAn)), "sub": (`${fraisModel.fraisPct.toFixed(2)} % de l'encours`), "tone": "warn"})), (React.createElement(Kpi, {"label": (`Coût sur ${years} ans`), "value": (fmt(coutFraisHorizon)), "sub": "capital final perdu vs 0 frais", "tone": "bad"})))), (fraisModel.perLine.length > 0 && (
                (React.createElement("div", {"className": "space-y-1.5"}, (fraisModel.perLine.map((l) => (
                    (React.createElement("div", {"key": (l.id), "className": "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/50 bg-slate-900/50 p-2.5"}, (React.createElement("div", {"className": "min-w-0"}, (React.createElement("div", {"className": "truncate text-xs font-bold text-slate-100"}, (l.nom || "(sans nom)"))), (React.createElement("div", {"className": "text-[11px] text-slate-400"}, (l.isEtf ? "ETF / fonds" : "Action directe"), "\u00b7", (l.pct === 0 ? "courtage 0 %" : `courtage ${String(l.pct).replace(".", ",")} %`), (l.min > 0 ? ` (min ${String(l.min).replace(".", ",")} €)` : ""), "\u00b7 part DCA \u2248", (fmt(l.courtM)), "/mois")))), (React.createElement("div", {"className": "shrink-0 text-right"}, (React.createElement("div", {"className": "text-xs font-bold text-slate-100"}, (l.ter > 0 ? `TER ${String(l.ter).replace(".", ",")} %` : "aucun TER"))), (React.createElement("div", {"className": "text-[11px] font-semibold text-rose-300"}, "\u2248", (fmt(l.valeur * l.ter / 100 * years + l.courtM * 12 * years)), "sur", (years), "\u00A0ans"))))))
                  )))))
              )), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Frais calcul\u00e9s automatiquement : TER de chaque support d\u00e9tenu + courtage", (BANKS[bank].label), "(", (fraisModel.bf.note), ") sur le versement mensuel r\u00e9parti au prorata des lignes. Sur", (years), "ans, \u2248", (fmt(coutFraisHorizon)), "de capital final en moins par rapport \u00e0 un monde sans frais \u2014 c'est la variable n\u00b01 que vous contr\u00f4lez, et elle alimente directement la Monte Carlo.")))), (React.createElement("div", {"className": "grid gap-4 lg:grid-cols-2"}, (React.createElement(Card, {"title": "Dividendes & revenus estim\u00e9s", "icon": "\ud83d\udcb8"}, (React.createElement("div", {"className": "grid grid-cols-2 gap-2"}, (React.createElement(Kpi, {"label": "Rendement pond\u00e9r\u00e9", "value": (`${String(divModel.yldPond.toFixed(1)).replace(".", ",")} %/an`), "sub": "estimation 2026", "tone": "accent"})), (React.createElement(Kpi, {"label": "Flux annuel estim\u00e9", "value": (fmt(divModel.payTotal)), "sub": (`≈ ${fmt(Math.round(divModel.payTotal / 12))}/mois`), "tone": "good"})))), (divModel.perLine.some((r) => r.yld > 0) ? (
                  (React.createElement("div", {"className": "mt-3 space-y-1.5"}, (divModel.perLine.filter((r) => r.yld > 0).map((r) => (
                      (React.createElement("div", {"key": (r.id), "className": "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/50 bg-slate-900/50 p-2 text-xs"}, (React.createElement("span", {"className": "min-w-0 truncate font-semibold text-slate-200"}, (r.nom || "(sans nom)"))), (React.createElement("span", {"className": "shrink-0 text-slate-400"}, (String(r.yld).replace(".", ",")), "% \u00b7", (React.createElement("b", {"className": "text-emerald-300"}, (fmt(r.montant)), "/an")), (React.createElement("span", {"className": "ml-1 text-[10px] text-slate-500"}, (r.dist === "cap" ? "réinvesti (capitalisant)" : "versé sur le PEA")))))))
                    )))))
                ) : (
                  (React.createElement("p", {"className": "mt-3 text-[11px] text-slate-400"}, "Ajoutez des lignes reconnues au catalogue pour estimer les dividendes de votre PEA."))
                )), (divModel.events.length > 0 && (
                  (React.createElement("div", {"className": "mt-3"}, (React.createElement("div", {"className": "mb-1 text-[11px] font-semibold text-slate-300"}, "\ud83d\udcc5 Prochains d\u00e9tachements (12 mois, estim\u00e9s)")), (React.createElement("div", {"className": "max-h-44 space-y-1 overflow-auto pr-1"}, (divModel.events.map((e, i) => (
                        (React.createElement("div", {"key": (i), "className": "flex items-center justify-between gap-2 rounded-lg bg-slate-800/70 p-1.5 text-[11px]"}, (React.createElement("span", {"className": "min-w-0 truncate text-slate-300"}, (e.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })), "\u00b7", (e.nom || "?"), (React.createElement("span", {"className": "text-slate-500"}, "(", (e.kind), ")")))), (React.createElement("b", {"className": "shrink-0 text-emerald-300"}, "\u2248", (fmt(e.montant))))))
                      )))))))
                )), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Estimations bas\u00e9es sur les rendements et habitudes de distribution 2026 (d\u00e9tachements d\u00e9but mai, acompte LVMH d\u00e9but d\u00e9c., ETF distribuant trimestriel) \u2014 les dates r\u00e9elles sont fix\u00e9es par les AG et les prospectus. Dans un PEA, les dividendes per\u00e7us ne sont pas impos\u00e9s au versement : r\u00e9investis, ils composent sans friction.")))), (React.createElement(Card, {"title": "Historique de performance", "icon": "\ud83d\udcc8"}, (React.createElement("div", {"className": "flex flex-wrap items-center gap-2"}, (React.createElement("button", {"onClick": (snapshot), "className": "rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"}, "\ud83d\udcf8 Enregistrer la valeur d'aujourd'hui")), (history.length > 0 && (
                    (React.createElement("button", {"onClick": (() => saveHist([])), "className": "rounded-lg px-2 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/10"}, "Tout effacer"))
                  )))), (history.length >= 2 ? (
                  (React.createElement(React.Fragment, null, (React.createElement("div", {"className": "mt-3 h-48"}, (React.createElement(ResponsiveContainer, null, (React.createElement(LineChart, {"data": (histData)}, (React.createElement(CartesianGrid, {"strokeDasharray": "3 3", "stroke": "#334155"})), (React.createElement(XAxis, {"dataKey": "label", "tick": ({ fill: "#94a3b8", fontSize: 10 })})), (React.createElement(YAxis, {"tick": ({ fill: "#94a3b8", fontSize: 10 }), "tickFormatter": ((v) => fmtK(v)), "width": (54)})), (React.createElement(Tooltip, {"formatter": ((v) => fmtK(v)), "contentStyle": ({ background: "#1e293b", border: "1px solid #475569", borderRadius: 8, fontSize: 12 })})), (React.createElement(Legend, {"wrapperStyle": ({ fontSize: 11 })})), (React.createElement(Line, {"type": "monotone", "dataKey": "total", "name": "Valeur totale", "stroke": "#6366f1", "strokeWidth": (2.5), "dot": ({ r: 3 })})), (React.createElement(Line, {"type": "monotone", "dataKey": "invested", "name": "Investi", "stroke": "#94a3b8", "strokeWidth": (1.5), "strokeDasharray": "4 3", "dot": (false)})))))))), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, (history.length), "relev\u00e9", (history.length > 1 ? "s" : ""), "enregistr\u00e9", (history.length > 1 ? "s" : ""), "(dernier :", (history[history.length - 1].d), ") \u2014 un point par jour max, stock\u00e9 localement dans votre navigateur. La courbe \u00ab valeur totale \u00bb doit d\u00e9coller de la ligne \u00ab investi \u00bb : c'est votre progression r\u00e9elle, DCA et dividendes r\u00e9investis inclus."))))
                ) : history.length === 1 ? (
                  (React.createElement("p", {"className": "mt-3 text-[11px] leading-relaxed text-slate-400"}, "1 relev\u00e9 enregistr\u00e9 (", (history[0].d), ") \u2014 prenez un point par mois (id\u00e9alement le jour du versement DCA) pour tracer votre trajectoire r\u00e9elle."))
                ) : (
                  (React.createElement("p", {"className": "mt-3 text-[11px] leading-relaxed text-slate-400"}, "Aucun relev\u00e9 pour l'instant. Enregistrez la valeur de votre PEA une fois par mois : la courbe \u00ab valeur totale \u00bb vs \u00ab investi \u00bb montre votre progression au fil des versements \u2014 l'\u00e9quivalent PEA de la valorisation Finary, pilot\u00e9e par vous."))
                ))))))))
        )), (tab === "risk" && (
          (React.createElement("div", {"className": "grid gap-4 md:grid-cols-2 lg:grid-cols-3"}, (React.createElement(Card, {"title": "Alertes actives", "icon": "\ud83d\udd14", "className": "md:col-span-2 lg:col-span-3"}, (alerts.length === 0 ? (
                (React.createElement("div", {"className": "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"}, "\u2705 Rien \u00e0 signaler : allocation dans la bande, frais sous contr\u00f4le, donn\u00e9es \u00e0 jour."))
              ) : (
                (React.createElement("div", {"className": "grid gap-2 sm:grid-cols-2"}, (alerts.map((a, i) => (
                    (React.createElement("div", {"key": (i), "className": ("flex items-start gap-2 rounded-xl border p-2.5 text-xs leading-snug " +
                      (a.sev === "bad" ? "border-rose-500/40 bg-rose-500/10 text-rose-200" :
                       a.sev === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" :
                       a.sev === "good" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" :
                       "border-slate-600/50 bg-slate-900/50 text-slate-300"))}, (React.createElement("span", {"className": "shrink-0 text-sm"}, (a.icon))), (React.createElement("span", {"className": "break-words"}, (a.text)))))
                  )))))
              )))), (React.createElement(Card, {"title": "Mise \u00e0 jour de l'analyse march\u00e9", "icon": "\ud83d\udd04", "className": "md:col-span-2 lg:col-span-3"}, (React.createElement("div", {"className": "flex flex-wrap items-center gap-3"}, (React.createElement("div", null, (React.createElement("div", {"className": "mb-1 text-[11px] text-slate-400"}, "\ud83d\udcc5 Jour d'investissement mensuel")), (React.createElement("select", {"value": (invDay), "onChange": ((e) => setInvDay(Number(e.target.value))), "className": "rounded-lg border border-slate-600/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"}, (Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      (React.createElement("option", {"key": (d), "value": (d)}, "le\u00A0", (d), "\u00A0de chaque mois"))
                    ))))))), (React.createElement("div", null, (React.createElement("div", {"className": "mb-1 text-[11px] text-slate-400"}, "\ud83c\udf82 Date d'ouverture de mon PEA")), (React.createElement("input", {"type": "date", "value": (peaOpenISO), "onChange": ((e) => setPeaOpenISO(e.target.value)), "className": "rounded-lg border border-slate-600/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"})))), (React.createElement("button", {"onClick": (updateAnalysis), "className": "rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-400"}, "Mettre \u00e0 jour l'analyse")), (React.createElement(Pill, {"tone": (freshTone)}, "Donn\u00e9es au", (frDate(majISO)), "\u00b7", (freshLabel), "(", (majAge), "j)")), (React.createElement("span", {"className": "text-[11px] text-slate-400"}, "Prochain versement :", (React.createElement("b", {"className": "text-slate-200"}, (nextInv.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })))), "\u2014 plan DCA et glide path ancr\u00e9s sur ce jour.")))), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Le bouton r\u00e9-ancre l'ensemble de l'analyse (plan DCA 12 mois, glide path, consensus 16 sources, Top 3, r\u00e9ajustements) sur votre jour de versement et date l'analyse \u00e0 aujourd'hui. Les taux et positions d'analystes sont ceux v\u00e9rifi\u00e9s au", (RATES.maj), "\u2014 pour un rafra\u00eechissement r\u00e9el (BCE, OAT, CAPE, enqu\u00eates), demandez \u00ab mets \u00e0 jour les donn\u00e9es de march\u00e9 \u00bb dans la conversation : je les re-v\u00e9rifie et les injecte.")))), (React.createElement(Card, {"title": "Split du versement du mois", "icon": "\ud83e\uddfe", "className": "md:col-span-2 lg:col-span-3"}, (React.createElement("div", {"className": "flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3"}, (React.createElement("span", {"className": "text-xs text-slate-300"}, "Prochain versement :", (React.createElement("b", {"className": "text-slate-100"}, (nextInv.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })))))), (React.createElement(Pill, {"tone": (splitPlan.reachable ? "good" : "warn")}, (splitPlan.reachable ? "✓ objectif tenable" : "⚠️ objectif hors portée"))), (React.createElement("span", {"className": "ml-auto text-lg font-black text-slate-100"}, (fmt(monthly2)))))), (React.createElement("div", {"className": "mt-3 grid gap-3 sm:grid-cols-3"}, (React.createElement("div", {"className": "rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"}, (React.createElement("div", {"className": "text-[11px] text-slate-400"}, "Expo cible du mois")), (React.createElement("div", {"className": "text-xl font-black text-indigo-300"}, (splitPlan.targetEq.toFixed(0)), "% actions")), (React.createElement("div", {"className": "mt-1 text-[10px] leading-snug text-slate-500"}, "Profil", (profile), ":", (splitPlan.targetProfile.toFixed(0)), "%", (!splitPlan.reachable && (React.createElement(React.Fragment, null, "\u00b7 objectif \u21d2", (splitPlan.eqNeeded.toFixed(0)), "% (plafonn\u00e9 \u00e0", (splitPlan.capEq.toFixed(0)), "%)"))))))), (React.createElement("div", {"className": "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"}, (React.createElement("div", {"className": "text-[11px] text-slate-400"}, "\u2192 Poche actions")), (React.createElement("div", {"className": "text-xl font-black text-emerald-300"}, (fmt(splitPlan.dEq)))), (React.createElement("div", {"className": "mt-1 text-[10px] text-slate-500"}, (Math.round((splitPlan.dEq / Math.max(1, monthly2)) * 100)), "% du versement")))), (React.createElement("div", {"className": "rounded-xl border border-sky-500/30 bg-sky-500/5 p-3"}, (React.createElement("div", {"className": "text-[11px] text-slate-400"}, "\u2192 Poche s\u00e9curitaire")), (React.createElement("div", {"className": "text-xl font-black text-sky-300"}, (fmt(splitPlan.dBd)))), (React.createElement("div", {"className": "mt-1 text-[10px] text-slate-500"}, (Math.round((splitPlan.dBd / Math.max(1, monthly2)) * 100)), "% du versement")))))), (analysis.total > 0 ? (
                (React.createElement("div", {"className": "mt-3 grid gap-2 sm:grid-cols-2"}, (splitPlan.eqSplit.map((s, i) => (
                    (React.createElement("div", {"key": ("e" + i), "className": "rounded-lg bg-slate-800/70 p-2.5 text-xs"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-1.5"}, (React.createElement(Pill, {"tone": "accent"}, "\ud83d\udcc8 Actions")), (React.createElement("span", {"className": "font-mono text-sm font-bold text-slate-50"}, (fmt(s.montant)))))), (React.createElement("p", {"className": "mt-1.5 leading-snug text-slate-200 break-words"}, (s.nom), (React.createElement("span", {"className": "text-slate-500"}, "(", (s.weight.toFixed(0)), "% du pf)")))), (React.createElement("p", {"className": "mt-0.5 leading-snug text-slate-500"}, (s.note), (s.compat === "check" ? " · éligibilité PEA à vérifier" : "")))))
                  ))), (splitPlan.eqSplit.length === 0 && (
                    (React.createElement("div", {"className": "rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200"}, "Aucune ligne action : lancez le \u00ab Top 3 \u00e0 investir \u00bb (onglet Recommandations) pour choisir vos supports, puis revenez ici."))
                  )), (splitPlan.bdSplit.map((s, i) => (
                    (React.createElement("div", {"key": ("b" + i), "className": "rounded-lg bg-slate-800/70 p-2.5 text-xs"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-1.5"}, (React.createElement(Pill, {"tone": "neutral"}, "\ud83d\udcb0 S\u00e9curitaire")), (s.montant > 0 && (React.createElement("span", {"className": "font-mono text-sm font-bold text-slate-50"}, (fmt(s.montant))))))), (React.createElement("p", {"className": "mt-1.5 leading-snug text-slate-200 break-words"}, (s.nom), (React.createElement("span", {"className": "text-slate-500"}, "(", (s.weight.toFixed(0)), "% du pf)")))), (s.montant === 0 && (React.createElement("p", {"className": "mt-0.5 leading-snug text-slate-500"}, (splitPlan.bdSplit.length > 1 ? "à répartir au prorata" : splitPlan.dBd > 0 ? "→ " + fmt(splitPlan.dBd) : ""))))))
                  ))), (splitPlan.bdSplit.length === 0 && splitPlan.dBd > 0 && (
                    (React.createElement("div", {"className": "rounded-lg border border-sky-500/40 bg-sky-500/10 p-2.5 text-xs text-sky-200"}, (fmt(splitPlan.dBd)), "\u00e0 loger en poche s\u00e9curitaire : ajoutez votre fonds mon\u00e9taire \u20ac (ex. CT \u20ac) ou laissez en esp\u00e8ces chez votre courtier."))
                  ))))
              ) : (
                (React.createElement("p", {"className": "mt-3 text-[11px] leading-relaxed text-slate-400"}, "Ajoutez vos lignes en cours (onglet Portefeuille) pour recevoir la r\u00e9partition ligne par ligne. Sans lignes, la strat\u00e9gie du mois reste :", (fmt(splitPlan.dEq)), "actions /", (fmt(splitPlan.dBd)), "s\u00e9curitaire vers l'expo cible", (splitPlan.targetEq.toFixed(0)), "%."))
              )), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Expo cible = max(cible du profil au glide path", (!splitPlan.reachable ? ", expo requise par l'objectif" : ""), "), plafonn\u00e9e \u00e0 profil + 15 pts. Montants arrondis au multiple de 5 \u20ac. Ordres \u00e0 cours limit\u00e9, id\u00e9alement le jour d'investissement choisi.")))), (React.createElement(Card, {"title": "Allocation optimale PEA \u2014 rentabilit\u00e9 max sous contrainte de risque", "icon": "\ud83d\ude80", "className": "md:col-span-2 lg:col-span-3"}, (React.createElement("div", {"className": "flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3"}, (React.createElement(Pill, {"tone": (maxAlloc.beyond >= 0 ? "good" : "warn")}, (maxAlloc.beyond >= 0 ? "🚀 objectif dépassé de " + fmt(maxAlloc.beyond) : "⚠️ il manquera ~" + fmt(-maxAlloc.beyond)))), (React.createElement("span", {"className": "text-xs text-slate-300"}, "Rendement vis\u00e9 :", (React.createElement("b", {"className": "text-slate-100"}, (maxAlloc.muBrut.toFixed(1)), "%/an brut")), "\u00b7", (maxAlloc.muNet.toFixed(1)), "%/an net de frais")), (React.createElement("span", {"className": "ml-auto text-xs text-slate-400"}, "Projection \u00e0", (years), "ans :", (React.createElement("b", {"className": "text-slate-100"}, (fmt(maxAlloc.fvOpt)))))))), (React.createElement("div", {"className": "mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}, (maxAlloc.rows.map((b) => (
                  (React.createElement("div", {"key": (b.id), "className": "rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"}, (React.createElement("div", {"className": "text-xs font-bold text-slate-100"}, (b.icon), (b.label))), (React.createElement("div", {"className": "mt-1 flex items-baseline justify-between gap-2"}, (React.createElement("span", {"className": "text-lg font-black text-violet-300"}, (b.target.toFixed(0)), "%")), (React.createElement("span", {"className": "text-[10px] text-slate-500"}, "actuel", (b.current.toFixed(0)), "%")))), (React.createElement("div", {"className": "mt-1.5"}, (React.createElement(Bar, {"pct": (b.target), "tone": (Math.abs(b.gap) > Math.max(band, 10) ? "warn" : "accent")})))), (React.createElement("div", {"className": "mt-1.5 text-[10px] leading-snug"}, (Math.abs(b.gap) < 2 ? (
                        (React.createElement("span", {"className": "text-emerald-400"}, "\u2713 \u00e0 la cible"))
                      ) : (
                        (React.createElement("span", {"className": (b.gap > 0 ? "text-amber-300" : "text-sky-300")}, (b.gap > 0 ? "renforcer +" : "réduire "), (Math.abs(b.gap).toFixed(0)), "pts via le DCA"))
                      )), (React.createElement("span", {"className": "text-slate-500"}, "\u00b7 hyp.", (String(b.mu).replace(".", ",")), "%/an \u00b7 vol", (b.vol), "%"))))))
                ))))), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Budget actions =", (maxAlloc.eqBudget.toFixed(0)), "% (expo cible du mois : profil", (profile), (maxAlloc.sat > 0 && (React.createElement(React.Fragment, null, "\u00b7 satellite picking", (maxAlloc.sat), "% de la poche actions"))), "). Le picking (actions individuelles : rendement vis\u00e9 le plus \u00e9lev\u00e9) est volontairement plafonn\u00e9 selon votre profil \u2014 non diversifi\u00e9, il ne doit jamais dominer. Rappel PEA : pas d'obligations directes \u2014 le mon\u00e9taire \u20ac court terme (", (String(bondMuAuto).replace(".", ",")), "%/an) en joue le r\u00f4le. Les Supports concrets \u00e0 acheter sont dans l'onglet Recommandations (Top 3, \u00e9ligibilit\u00e9", (BANKS[bank].label), "v\u00e9rifi\u00e9e) ; l'ex\u00e9cution ligne par ligne suit la carte \u00ab Split du versement du mois \u00bb.")))), (React.createElement(Card, {"title": "Niveau de risque r\u00e9el", "icon": "\u2696\ufe0f"}, (React.createElement("div", {"className": "flex flex-wrap items-center gap-4"}, (React.createElement("div", {"className": "h-32 w-32 shrink-0"}, (React.createElement(ResponsiveContainer, null, (React.createElement(RadialBarChart, {"innerRadius": "70%", "outerRadius": "100%", "data": (riskGauge), "startAngle": (210), "endAngle": (-30)}, (React.createElement(PolarAngleAxis, {"type": "number", "domain": ([0, 100]), "tick": (false)})), (React.createElement(RadialBar, {"dataKey": "value", "cornerRadius": (12), "background": ({ fill: "#334155" })})))))))), (React.createElement("div", {"className": "min-w-0 space-y-1.5"}, (React.createElement("div", {"className": "text-2xl font-black"}, (riskPosture.riskLevel), (React.createElement("span", {"className": "text-sm text-slate-500"}, "/100")))), (React.createElement(Pill, {"tone": (riskPosture.alignment ? "good" : "warn")}, (riskPosture.riskLabel), "\u00b7", (riskPosture.alignment ? "aligné profil" : "désaligné vs " + profile))), (React.createElement("p", {"className": "text-[11px] leading-snug text-slate-400"}, "45 % exposition (", (analysis.eqPct.toFixed(0)), "%) \u00b7 35 % vol (", (analysis.vol.toFixed(1)), "%) \u00b7 20 % concentration ligne seule (", (analysis.maxSingle.toFixed(0)), "%)")))))))), (React.createElement(Card, {"title": "Posture vs tendance", "icon": "\ud83e\udded"}, (React.createElement("div", {"className": ("rounded-xl border p-4 text-center " +
                (riskPosture.posture === "Offensive" ? "border-emerald-500/30 bg-emerald-500/10" :
                 riskPosture.posture === "Défensive" ? "border-rose-500/30 bg-rose-500/10" :
                 "border-amber-500/30 bg-amber-500/10"))}, (React.createElement("div", {"className": "text-2xl font-black"}, (riskPosture.posture))), (React.createElement("div", {"className": "text-xs text-slate-400"}, "consensus\u00A0", (sigPct >= 0 ? "+" : ""), (sigPct), "/100 \u00b7 horizon", (years), "\u00A0ans")))), (React.createElement("p", {"className": "mt-2 text-xs leading-relaxed text-slate-400"}, (riskPosture.postureWhy))))), (React.createElement(Card, {"title": "Efficience transactionnelle", "icon": "\ud83d\udd01"}, (React.createElement("div", {"className": ("rounded-xl border p-4 text-center " +
                (riskPosture.efficiency === "Optimale" ? "border-emerald-500/30 bg-emerald-500/10" :
                 riskPosture.efficiency === "Bonne" ? "border-lime-500/30 bg-lime-500/10" :
                 riskPosture.efficiency === "Acceptable" ? "border-amber-500/30 bg-amber-500/10" :
                 "border-rose-500/30 bg-rose-500/10"))}, (React.createElement("div", {"className": "text-2xl font-black"}, (riskPosture.efficiency))), (React.createElement("div", {"className": "text-xs text-slate-400"}, (riskPosture.nMoves), "mouvement(s) \u00b7 rotation", ((riskPosture.turnover * 100).toFixed(0)), "%")))), (React.createElement("p", {"className": "mt-2 text-[11px] leading-relaxed text-slate-400"}, "Exigence c\u0153ur : le DCA directionnel comble les \u00e9carts", (React.createElement("b", null, "sans vendre")), ". Les ventes ne se d\u00e9clenchent que sur r\u00e8gle objective cass\u00e9e (concentration, d\u00e9rive > bande, gains, horizon \u2264 2 ans).")))), (React.createElement(Card, {"title": "R\u00e9partition par classe d'actifs (contrainte PEA)", "icon": "\ud83e\udde9", "className": "md:col-span-2 lg:col-span-3"}, (React.createElement("div", {"className": "grid gap-2 sm:grid-cols-2 lg:grid-cols-4"}, (classBreakdown.map((c) => (
                  (React.createElement("div", {"key": (c.id), "className": ("rounded-xl border p-3 " +
                    (c.outOfRange ? "border-amber-500/40 bg-amber-500/5" : "border-slate-700/50 bg-slate-900/50"))}, (React.createElement("div", {"className": "flex items-center justify-between gap-1"}, (React.createElement("span", {"className": "text-xs font-bold text-slate-100"}, (c.icon), (c.label))), (React.createElement("span", {"className": "text-lg font-black text-slate-100"}, (c.weight.toFixed(0)), "%")))), (React.createElement("div", {"className": "mt-1.5"}, (React.createElement(Bar, {"pct": (c.weight), "tone": (c.outOfRange ? "warn" : "accent")})))), (React.createElement("div", {"className": "mt-1.5 flex items-center justify-between text-[10px]"}, (React.createElement("span", {"className": "text-slate-500"}, "Cible", (profile), ":", (c.target), "%")), (c.outOfRange && c.target > 0 ? (
                        (React.createElement("span", {"className": "font-bold text-amber-400"}, (c.gap > 0 ? "+" : ""), (c.gap.toFixed(0)), "pts \u2014", (c.gap > 0 ? "réduire via DCA" : "renforcer via DCA")))
                      ) : (
                        (React.createElement(Pill, {"tone": "good"}, "\u2713 dans la bande"))
                      )))), (React.createElement("p", {"className": "mt-1 text-[10px] leading-snug text-slate-500"}, (c.desc))), (!c.eligible && (
                      (React.createElement("p", {"className": "mt-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300"}, "\u26d4 Non \u00e9ligible PEA : \u00e0 loger hors enveloppe (or papier AV/CTO) \u2014 signal\u00e9 pour votre vision patrimoine globale"))
                    ))))
                ))))), (React.createElement("p", {"className": "mt-2 text-[10px] text-slate-500"}, "Rappel contrainte PEA : actions & fonds \u00e9ligibles seulement. Les obligations directes et les mati\u00e8res premi\u00e8res ne sont pas \u00e9ligibles \u2014 l'\u00e9quivalent obligataire dans l'enveloppe est le mon\u00e9taire \u20ac court terme ; l'or se g\u00e8re hors PEA (assurance-vie fonds or, CTO) ou indirectement via des actions mini\u00e8res cot\u00e9es UE.")))), (React.createElement(Card, {"title": "Exposition r\u00e9elle \u2014 g\u00e9ographie & secteurs des sous-jacents", "icon": "\ud83c\udf0d", "className": "md:col-span-2 lg:col-span-3"}, (analysis.total > 0 ? (
                (React.createElement("div", {"className": "grid gap-4 sm:grid-cols-2"}, (React.createElement("div", null, (React.createElement("div", {"className": "mb-1.5 text-xs font-semibold text-slate-300"}, "G\u00e9ographie (look-through)")), (React.createElement("div", {"className": "space-y-1.5"}, (expoModel.geoList.map((g) => (
                        (React.createElement("div", {"key": (g.label), "className": "flex items-center gap-2 text-xs"}, (React.createElement("span", {"className": "w-40 shrink-0 truncate text-slate-400"}, (g.label))), (React.createElement(Bar, {"pct": (g.pct), "tone": (g.label.includes("États-Unis") && g.pct > 60 ? "warn" : "accent")})), (React.createElement("b", {"className": "shrink-0"}, (g.pct.toFixed(0)), "%"))))
                      ))))), (React.createElement("p", {"className": "mt-1.5 text-[10px] text-slate-500"}, "\ud83c\uddeb\ud83c\uddf7 Exposition France :", (expoModel.frPct.toFixed(0)), "pts (actions fran\u00e7aises + volet France des ETF Europe).")), (expoModel.usPct > 60 && (
                      (React.createElement("p", {"className": "mt-1 text-[10px] leading-snug text-amber-300/90"}, "\u26a0\ufe0f", (expoModel.usPct.toFixed(0)), "% d'exposition US via vos ETF \u2014 coh\u00e9rent avec le consensus (GMO, Vanguard : surpond\u00e9rer hors US), mais \u00e0 savoir."))
                    )))), (React.createElement("div", null, (React.createElement("div", {"className": "mb-1.5 text-xs font-semibold text-slate-300"}, "Secteurs")), (React.createElement("div", {"className": "space-y-1.5"}, (expoModel.secList.map((s) => (
                        (React.createElement("div", {"key": (s.label), "className": "flex items-center gap-2 text-xs"}, (React.createElement("span", {"className": "w-40 shrink-0 truncate text-slate-400"}, (s.label))), (React.createElement(Bar, {"pct": (s.pct), "tone": (s.label.includes("Tech") && s.pct > 35 ? "warn" : "accent")})), (React.createElement("b", {"className": "shrink-0"}, (s.pct.toFixed(0)), "%"))))
                      )))))))))
              ) : (
                (React.createElement("p", {"className": "text-[11px] text-slate-400"}, "Ajoutez des lignes pour r\u00e9v\u00e9ler l'exposition g\u00e9ographique et sectorielle r\u00e9elle de votre PEA (look-through des ETF)."))
              )), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Look-through : les ETF sont ventil\u00e9s sur leurs sous-jacents (pond\u00e9rations d'indices approx. au 19/10/2026 \u2014 MSCI World ~70 % US, CAC 40 ~22 % luxe + ~22 % industrie, etc.). C'est cette diversification qui compte, pas le nombre de lignes.")))), (React.createElement(Card, {"title": "R\u00e9ajustements (strat\u00e9gie \u00d7 exposition \u00d7 horizon)", "icon": "\ud83d\udd27", "className": "md:col-span-2 lg:col-span-3"}, (adjustments.length === 0 ? (
                (React.createElement("div", {"className": "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"}, "\u2705 Aucun r\u00e9ajustement n\u00e9cessaire : aucune ligne ne d\u00e9passe le plafond de votre profil, l'exposition actions (", (analysis.eqPct.toFixed(0)), "%) reste dans la bande \u00b1", (band), "pts de la cible", (pf.eq), "%, et l'horizon (", (years), "ans) ne justifie pas de d\u00e9riskage forc\u00e9."))
              ) : (
                (React.createElement("div", {"className": "space-y-2"}, (adjustments.map((r) => (
                    (React.createElement("div", {"key": (r.id), "className": "rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-2"}, (React.createElement("span", {"className": "text-sm font-bold text-slate-100"}, (r.nom || "(ligne sans nom)"))), (React.createElement("span", {"className": "text-xs text-slate-400"}, (fmt(r.valeur)), "\u00b7", (r.weight.toFixed(0)), "% \u00b7", (r.valo >= 0 ? "+" : ""), (r.valo), "%")))), (React.createElement("div", {"className": "mt-2 space-y-2"}, (r.actions.map((a, i) => (
                          (React.createElement("div", {"key": (i), "className": "rounded-lg bg-slate-800/70 p-2.5 text-xs sm:text-[13px]"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-1.5"}, (React.createElement(Pill, {"tone": (a.type === "vente" ? "bad" : a.type === "take-profit" ? "good" :
                                          a.type === "arbitrage" ? "warn" : a.type === "dca" ? "accent" : a.type === "rebalance" ? "accent" : "neutral")}, (a.type === "vente" ? "Réduire" : a.type === "take-profit" ? "Gains" :
                                 a.type === "arbitrage" ? "Sortir" : a.type === "dca" ? "DCA" : a.type === "rebalance" ? "Rééquilibrer" : "Dérisker"))), (a.montant > 0 && (
                                (React.createElement("span", {"className": "font-mono text-sm font-bold text-slate-50"}, (fmt(a.montant))))
                              )))), (React.createElement("p", {"className": "mt-1.5 leading-snug text-slate-300"}, (a.label))), (React.createElement("p", {"className": "mt-1 leading-snug text-slate-500"}, (a.montant > 0 ? "→ " : ""), (a.vers)))))
                        )))))))
                  ))), (React.createElement("div", {"className": "rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-2.5 text-xs font-semibold text-indigo-200"}, "Total des mouvements :", (fmt(adjustTotal)), "\u2014 id\u00e9alement en une fois par trimestre, ordres \u00e0 cours limit\u00e9. Dans un PEA, vendre ne d\u00e9clenche aucune imposition (seuls les frais de courtage s'appliquent)."))))
              ))))))
        )), (tab === "reco" && (
          (React.createElement("div", {"className": "grid gap-4 md:grid-cols-2 lg:grid-cols-3"}, (React.createElement(Card, {"title": ("Réponse PEA " + BANKS[bank].label + " du mois"), "icon": "\ud83d\udca1"}, (React.createElement("div", {"className": "space-y-2 text-[13px] leading-relaxed"}, (peaAnswer.map((p, i) => (
                  (React.createElement("p", {"key": (i), "className": ("break-words rounded-xl p-2.5 " +
                    (i === 1 ? "border border-indigo-500/40 bg-indigo-500/10 font-semibold text-indigo-100" : "bg-slate-900/60 text-slate-300"))}, (p)))
                ))))))), (React.createElement(Card, {"title": "Top 3 \u00e0 investir (vs objectif)", "icon": "\ud83c\udfc6"}, (React.createElement("button", {"onClick": (computeTop3), "className": "mb-3 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110"}, "\u26a1 Analyser & proposer mon Top 3")), (top3 ? (
                (React.createElement("div", {"className": "space-y-2"}, (top3.map((c) => (
                    (React.createElement("div", {"key": (c.nom), "className": "rounded-xl border border-slate-700/50 bg-slate-900/50 p-2.5"}, (React.createElement("div", {"className": "flex items-start justify-between gap-1.5"}, (React.createElement("span", {"className": "text-xs font-bold leading-tight text-slate-100"}, (c.label), (c.nom))), (React.createElement("span", {"className": "shrink-0 rounded-lg bg-indigo-500/20 px-2 py-0.5 text-xs font-black text-indigo-200"}, (fmt(c.montant)))))), (React.createElement("p", {"className": "mt-1 text-xs leading-snug text-slate-400"}, (c.why))), (React.createElement("p", {"className": "mt-1.5 flex flex-wrap items-center gap-1.5 break-words"}, (React.createElement("span", {"className": "rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300"}, "ISIN :", (c.isin))), (React.createElement("span", {"className": "rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300"}, (c.ticker))), (c.compat === "ok" ? (
                          (React.createElement(Pill, {"tone": "good"}, "\ud83c\udfe6 \u00c9ligible PEA", (BANKS[bank].label)))
                        ) : (
                          (React.createElement(Pill, {"tone": "warn"}, "\ud83c\udfe6 \u00c0 v\u00e9rifier dans l'app", (BANKS[bank].label)))
                        )))), (React.createElement("p", {"className": "mt-0.5 text-[11px] text-slate-500"}, "Hyp.", (c.mu), "%/an \u00b7 vol", (c.vol), "% \u00b7 score", (c.score), "/100"))))
                  )))))
              ) : (
                (React.createElement("p", {"className": "text-[11px] leading-relaxed text-slate-400"}, "Croise votre \u00e9cart \u00e0 l'objectif, l'allocation r\u00e9elle de vos lignes, votre profil et les doublons \u2014 pour proposer 3 supports \u00e9ligibles PEA avec la r\u00e9partition du versement."))
              )), (React.createElement("p", {"className": "mt-2 text-[10px] text-slate-500"}, "\u26a0\ufe0f P\u00e9dagogique \u2014 pas un conseil en investissement personnalis\u00e9.")))), (React.createElement(Card, {"title": "Plan DCA \u2014 12 prochains mois", "icon": "\ud83d\udcc5", "className": "md:col-span-2 lg:col-span-1"}, (React.createElement("table", {"className": "w-full text-[11px] sm:text-xs"}, (React.createElement("thead", null, (React.createElement("tr", {"className": "text-left text-slate-400"}, (React.createElement("th", {"className": "py-1 whitespace-nowrap"}, "Mois")), (React.createElement("th", {"className": "py-1 text-right whitespace-nowrap"}, "Actions")), (React.createElement("th", {"className": "py-1 text-right whitespace-nowrap"}, "Mon\u00e9t.")), (React.createElement("th", {"className": "py-1 text-right whitespace-nowrap"}, "% actions")))))), (React.createElement("tbody", null, (dcaPlan.map((r, i) => (
                    (React.createElement("tr", {"key": (i), "className": ("border-t border-slate-700/40 " + (i === 0 ? "font-bold text-indigo-300" : "text-slate-300"))}, (React.createElement("td", {"className": "py-1 whitespace-nowrap"}, (r.date))), (React.createElement("td", {"className": "py-1 text-right whitespace-nowrap"}, (fmt(r.actions)))), (React.createElement("td", {"className": "py-1 text-right whitespace-nowrap"}, (fmt(r.oblig)))), (React.createElement("td", {"className": "py-1 text-right whitespace-nowrap"}, (r.eqPct), "%", (React.createElement("span", {"className": "hidden text-slate-500 sm:inline"}, "(", (r.target), "%)"))))))
                  ))))))), (React.createElement("p", {"className": "mt-2 text-[10px] text-slate-500"}, "Versement orient\u00e9 vers la poche sous-pond\u00e9r\u00e9e : le DCA rattrape l'allocation sans vendre."))))))
        )), (React.createElement("p", {"className": "pb-2 text-center text-[10px] text-slate-600"}, "PEA Co-Pilot \u00b7 projections bas\u00e9es sur des hypoth\u00e8ses param\u00e9trables \u2014 pas des promesses de rendement."))))))
  );
}

// Montage sécurisé (uniquement dans un navigateur avec <div id="root">)
if (typeof document !== "undefined" && document.getElementById("root")) {
  const _root = document.getElementById("root");
  _root.innerHTML = "";
  ReactDOM.createRoot(_root).render(React.createElement(App));
}
window.PeaCoPilot = { App };
