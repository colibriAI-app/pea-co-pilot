// PEA Co-Pilot — 4 onglets, veille analystes par horizon, lecture en 10 secondes · bundle v20261036 · thème visuel v3 (émeraude/cyan, verres dépoli).
// Données de marché vérifiées au 23/10/2026 · DCA en parts entières avec report mensuel · veille analystes consolidée au 28/10/2026.
// PEA Co-Pilot — bundle généré automatiquement depuis le canvas React (visuel v3).
// [v20261028 : thème émeraude/cyan, tilt DCA pondéré par horizon, carte impact inflation,
//  pill d'alertes cliquable avec panneau déroulant, bouton MAJ veille, données marché au 23/10/2026,
//  nettoyage affichage : pourcentages entiers partout, stress en €, TER en pb si < 1 %]
// React 18 + Recharts sont chargés via CDN (UMD) dans index.html.
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useMemo, useEffect } = React;
const {
  ResponsiveContainer, LineChart, ComposedChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, RadialBarChart, RadialBar, PolarAngleAxis,
} = window.Recharts;

// localStorage indisponible dans certains runtimes : shim sûr (dans le navigateur, le vrai localStorage persiste réglages & report).
const localStorage = (typeof window !== "undefined" && window.localStorage) || {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
// ---- Persistance locale : les réglages et le portefeuille survivent à la fermeture ----
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null || v === undefined ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
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
        // Amplitude du tilt pondérée par l'horizon (cohérente avec le split du mois).
        const amp = Math.min(10, 6 * tiltWeightOfYears(p.years));
        target += Math.max(-amp, Math.min(amp, -signal * amp));
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
    out.push({ month: m, annee: m / 12, p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), p50reel: q(0.5) / Math.pow(1 + inflationAuto / 100, m / 12) });
  }
  return out;
}

const fmt = (v) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const fmtK = (v) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €";

// ================= TAUX DE RÉFÉRENCE (mis à jour le 23/10/2026) =================
// Sources : TEC10 AFT 5,05 % au 23/10 (pic 5,1 % le 22/10, plus haut depuis 2002) ; Bund 3,33 % ; spread 171,8 pb (niveaux 2012). BCE : dépôt 2,50 % (16/09), réunion 29/10.
// Prochaine réunion BCE : 29 octobre 2026 (consensus : statu quo, hausse possible en décembre).
const RATES = {
  bce: 2.50,        // taux de dépôt BCE (court terme)
  bceRefi: 2.65,    // refinancement principal
  oat10: 5.05,      // OAT France 10 ans (taux long) — plus haut depuis 2002, spread 2012
  bund10: 3.33,     // Bund 10 ans (référence zone euro)
  spreadOatBund: 172, // points de base — prime de risque France : zone crise souveraine
  maj: "23/10/2026",
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
  { nom: "Berkshire / école value", avatar: "🧓", etat: "haussier", poids: 3,
    note: "Abel déploie massivement : ~25 Md$ d'achats nets au T2 (premiers achats nets depuis 2022), Alphabet ~10 Md$ (top 5 du portefeuille), Taylor Morrison 6,8 Md$, 4,8 Md$ de rachats propres — actions A à 1,4 % de leur record.",
    citation: "« Sois peureux quand les autres sont avides, avide quand les autres sont peureux. »" },
  { nom: "Buffett Indicator (macro)", avatar: "📊", etat: "baissier", poids: 2,
    note: "Capitalisation/PIB US ~234 % (GuruFocus 16/10 : 2,336, record 2,397), au-dessus de 2000 et 2008 — prudence structurelle, surtout actions US." },
  { nom: "Julien Flot — tendance", avatar: "🛡️", etat: "neutre", poids: 3,
    note: "Prudence accrue (oct. 2026) : « horizon 2026-2027 » cumule les risques (refinancement de la dette, essoufflement IA, pétrole) — la sortie du biseau reste valide mais protégée serré ; accumuler uniquement si les signaux tiennent." },
  { nom: "Finary / DCA long terme", avatar: "🔄", etat: "haussier", poids: 2,
    note: "DCA mensuel + horizon : la régularité et les frais bas comptent plus que le timing — structurellement gagnant." },
  { nom: "Macro BCE / taux", avatar: "🏦", etat: "neutre", poids: 2,
    note: `Dépôt BCE ${RATES.bce.toFixed(2).replace(".", ",")} %, statu quo attendu le 29/10 ; inflation FR 3,4 % (plus haut depuis janv. 2024) → taux longs élevés : OAT 10 ans ~${RATES.oat10.toFixed(1).replace(".", ",")} % — la poche monétaire PEA (~3 %) est un vrai coussin.` },
  { nom: "Momentum Europe", avatar: "📈", etat: "neutre", poids: 2,
    note: "Stoxx 600 -5 % depuis son record d'août, l'Europe décroche vs Wall Street et la France inquiète (spread OAT/Bund 172 pb) — mais décote vs US persistante et plans actionnaires actifs (ING, Capgemini, Air Liquide)." },
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
    note: "Enquête oct. 2026 (161 gérants, 453 Md$) : sentiment 6,4 (plus bas depuis juin), cash stable à 3,9 %, tech la plus surpondérée depuis août 2020 — positioning tendu, sélectivité." },
  { nom: "Stratégistes Wall Street", avatar: "🗽", etat: "haussier", poids: 1,
    note: "Cibles S&P 500 fin 2026 : médiane ~8 000 (Goldman, Citi, UBS ≥ 8 000 ; BofA 7 400) vs ~7 690 actuel : les earnings portent, mais prudence sur les valeurs IA." },
  { nom: "Le Revenu (presse finance)", avatar: "📰", etat: "haussier", poids: 2,
    note: "Ligne éditoriale rendement/dividendes : ~73 Md€ distribués par le CAC 40 en 2026, banques et énergéticiens > 5-7 % de rendement — le dividende reste le socle du rendement long terme en PEA." },
  { nom: "Mieux vivre votre argent", avatar: "📖", etat: "neutre", poids: 2,
    note: "Approche patrimoine équilibrée : diversification multi-classes, décote de l'Europe comme opportunité, mais prudence sur les valorisations US — cohérent avec un DCA régulier sans pari de timing." },
  { nom: "Or / banques centrales", avatar: "🪙", etat: "haussier", poids: 1,
    note: "Record WGC : 289 t achetées au T2 2026 (plus gros trimestre de l'histoire), +39 t en août, 45 % des BC comptent renforcer (Chine en tête) — actif hors PEA, à piloter dans une autre enveloppe." },
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
  "Amundi ETF PEA S&P 500": "aggro", "Fonds monétaire € court terme": "monet",
  "Amundi PEA Euro Court Terme": "monet",
  "Amundi PEA MSCI Europe": "def", "Amundi PEA Nasdaq-100": "aggro", "Amundi PEA S&P 500 (PSP5)": "aggro",
  "Amundi PEA Japon (TOPIX)": "aggro", "Amundi PEA Asie Emergente": "aggro", "Amundi ETF STOXX Europe 600": "def",
  "BNP Paribas Easy STOXX Europe 600": "def",
  "AXA": "def", "Vinci": "def", "Airbus": "def", "Safran": "def", "Thales": "def", "Société Générale": "def",
  "Crédit Agricole": "def", "Danone": "def", "Orange": "def", "Capgemini": "def", "Michelin": "def",
  "Renault": "def", "Stellantis": "def", "Kering": "def", "Hermès": "def", "Saint-Gobain": "def", "Alstom": "def",
  "iShares MSCI Europe SRI PEA": "def", "Amundi ETF CAC 40": "def", "BNP Paribas Easy S&P 500": "aggro",
  "Schneider Electric": "def", "LVMH": "def", "TotalEnergies": "def", "Sanofi": "def",
  "L'Oréal": "def", "Legrand": "def", "Air Liquide": "def", "BNP Paribas": "def",
};

// Indices actions large : un ETF "diversifié" contient des centaines de valeurs
// → il ne doit JAMAIS déclencher de règle de concentration ni être pénalisé en
// risque comme une ligne individuelle. (Évolution modèle après tests P1/P3/P4/P6.)
const BROAD_IDX = ["MSCI World", "MSCI ACWI", "MSCI Europe", "MSCI EM", "S&P 500", "CAC 40 GR", "Dividendes Europe", "MSCI Europe Value", "MSCI Europe SRI", "Nasdaq 100", "TOPIX", "STOXX Europe 600", "MSCI Emerging Asia"];
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
  "Amundi ETF PEA S&P 500": { isin: "FR0013532766", ticker: "PE500", type: "ETF", indice: "S&P 500", ter: 0.25, pays: "États-Unis", notes: "S&P 500 réplication synthétique, éligible PEA" },
  "Fonds monétaire € court terme": { isin: "FR0010510800", ticker: "MONEA", type: "Monétaire", indice: "€STR +", ter: 0.10, pays: "Zone euro", notes: "Poche sécurité du PEA, quasi-zéro vol" },
  "Amundi PEA Euro Court Terme": { isin: "FR0013346681", ticker: "LYX0EZ", type: "Monétaire", indice: "€STR +", ter: 0.25, pays: "Zone euro", notes: "ETF monétaire PEA (Solactive €STR Overnight) — poche sécurité, quasi-zéro vol" },
  "Amundi PEA MSCI Europe": { isin: "FR0013412038", ticker: "PCEU", type: "ETF", indice: "MSCI Europe", ter: 0.15, pays: "Europe", notes: "Europe large ~400 valeurs, parmi les TER les plus bas" },
  "Amundi PEA Nasdaq-100": { isin: "FR0011871110", ticker: "PUST", type: "ETF", indice: "Nasdaq 100", ter: 0.30, pays: "États-Unis", notes: "Le seul Nasdaq-100 éligible PEA (synthétique) — croissance US tech" },
  "Amundi PEA S&P 500 (PSP5)": { isin: "FR0011871128", ticker: "PSP5", type: "ETF", indice: "S&P 500", ter: 0.12, pays: "États-Unis", notes: "S&P 500 synthétique PEA, TER le plus bas US large" },
  "Amundi PEA Japon (TOPIX)": { isin: "FR0013411980", ticker: "PTPXE", type: "ETF", indice: "TOPIX", ter: 0.12, pays: "Japon", notes: "Seul ETF Japon éligible PEA (synthétique) — diversification Asie" },
  "Amundi PEA Asie Emergente": { isin: "FR0013412012", ticker: "PAASI", type: "ETF", indice: "MSCI Emerging Asia", ter: 0.30, pays: "Asie", notes: "Asie émergente (Chine, Taïwan, Inde, Corée) — éligible PEA, satellite agressif", alias: ["emerging asia", "emergin asia", "asie emergente screen", "pays emergents asie"] },
  "Amundi ETF STOXX Europe 600": { isin: "FR0010791004", ticker: "STX", type: "ETF", indice: "STOXX Europe 600", ter: 0.18, pays: "Europe", notes: "STOXX 600 synthétique éligible PEA (les versions physiques ne le sont pas)" },
  "BNP Paribas Easy STOXX Europe 600": { isin: "FR0011550193", ticker: "ESE", type: "ETF", indice: "STOXX Europe 600", ter: 0.15, pays: "Europe", notes: "STOXX 600 synthétique BNPP éligible PEA — TER le plus bas de la catégorie" },
  "AXA": { isin: "FR0000120628", ticker: "CS", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Assurance — rendement élevé, décote valorisation" },
  "Vinci": { isin: "FR0000120378", ticker: "DG", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Concessions & BTP — flux longs et visibles, rendement ~4,5 %" },
  "Airbus": { isin: "NL0000235190", ticker: "AIR", type: "Action", indice: "CAC 40", ter: 0, pays: "Europe", notes: "Aéronautique — carnet de commandes record (~8 800 appareils)" },
  "Safran": { isin: "FR0000073272", ticker: "SAF", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Aéronautique/moteurs — marges élevées, services récurrents" },
  "Thales": { isin: "FR0000121329", ticker: "HO", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Défense & électronique — budgets militaires européens en hausse" },
  "Société Générale": { isin: "FR0000130809", ticker: "GLE", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Banque — rendement élevé, valorisation décotée" },
  "Crédit Agricole": { isin: "FR0000045072", ticker: "ACA", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Banque — rendement ~6 %, solidité retail France" },
  "Danone": { isin: "FR0000120644", ticker: "BN", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Agroalimentaire — défensif, dividende régulier" },
  "Orange": { isin: "FR0000133308", ticker: "ORA", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Télécoms — rendement ~6,5 %, business B2B en croissance" },
  "Capgemini": { isin: "FR0000125338", ticker: "CAP", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Services IT & IA — générateur de cash, carnet record" },
  "Michelin": { isin: "FR0000121261", ticker: "ML", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Pneumatique premium — diversifiée industrielle, rendement ~4 %" },
  "Renault": { isin: "FR0000131906", ticker: "RNO", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Automobile — turnaround, valorisation décotée" },
  "Stellantis": { isin: "NL00150001Q9", ticker: "STLA", type: "Action", indice: "CAC 40", ter: 0, pays: "Europe", notes: "Automobile — décote profonde, rendement variable" },
  "Kering": { isin: "FR0000121485", ticker: "KER", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Luxe (Gucci) — retournement en cours, dividende maintenu" },
  "Hermès": { isin: "FR0000052292", ticker: "RMS", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Luxe ultra-prémium — croissance régulière, marge record" },
  "Saint-Gobain": { isin: "FR0000125007", ticker: "SGO", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Matériaux & solutions — rotation vers le léger, rendement ~3 %" },
  "Alstom": { isin: "FR0010476635", ticker: "ALO", type: "Action", indice: "CAC 40", ter: 0, pays: "France", notes: "Mobilité ferroviaire — carnet record, levier infrastructure" },
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
    "Amundi ETF PEA S&P 500": "check", "Fonds monétaire € court terme": "ok",
    "Amundi PEA Euro Court Terme": "ok", "Amundi PEA MSCI Europe": "ok", "Amundi PEA Nasdaq-100": "ok", "Amundi PEA S&P 500 (PSP5)": "ok",
    "Amundi PEA Japon (TOPIX)": "ok",
    "Amundi PEA Asie Emergente": "ok", "BNP Paribas Easy STOXX Europe 600": "ok", "Amundi ETF STOXX Europe 600": "ok",
    "AXA": "ok", "Vinci": "ok", "Airbus": "ok", "Safran": "ok", "Thales": "ok", "Société Générale": "ok",
    "Crédit Agricole": "ok", "Danone": "ok", "Orange": "ok", "Capgemini": "ok", "Michelin": "ok",
    "Renault": "ok", "Stellantis": "ok", "Kering": "ok", "Hermès": "ok", "Saint-Gobain": "ok", "Alstom": "ok",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "ok",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  boursedirect: {
    "Amundi PEA Monde": "ok", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "ok",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "ok",
    "Amundi ETF PEA S&P 500": "check", "Fonds monétaire € court terme": "ok",
    "Amundi PEA Euro Court Terme": "ok", "Amundi PEA MSCI Europe": "ok", "Amundi PEA Nasdaq-100": "ok", "Amundi PEA S&P 500 (PSP5)": "ok",
    "Amundi PEA Japon (TOPIX)": "ok",
    "Amundi PEA Asie Emergente": "ok", "BNP Paribas Easy STOXX Europe 600": "ok", "Amundi ETF STOXX Europe 600": "ok",
    "AXA": "ok", "Vinci": "ok", "Airbus": "ok", "Safran": "ok", "Thales": "ok", "Société Générale": "ok",
    "Crédit Agricole": "ok", "Danone": "ok", "Orange": "ok", "Capgemini": "ok", "Michelin": "ok",
    "Renault": "ok", "Stellantis": "ok", "Kering": "ok", "Hermès": "ok", "Saint-Gobain": "ok", "Alstom": "ok",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "ok",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  boursobank: {
    "Amundi PEA Monde": "ok", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "ok",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "ok",
    "Amundi ETF PEA S&P 500": "check", "Fonds monétaire € court terme": "ok",
    "Amundi PEA Euro Court Terme": "ok", "Amundi PEA MSCI Europe": "ok", "Amundi PEA Nasdaq-100": "ok", "Amundi PEA S&P 500 (PSP5)": "ok",
    "Amundi PEA Japon (TOPIX)": "ok",
    "Amundi PEA Asie Emergente": "ok", "BNP Paribas Easy STOXX Europe 600": "ok", "Amundi ETF STOXX Europe 600": "ok",
    "AXA": "ok", "Vinci": "ok", "Airbus": "ok", "Safran": "ok", "Thales": "ok", "Société Générale": "ok",
    "Crédit Agricole": "ok", "Danone": "ok", "Orange": "ok", "Capgemini": "ok", "Michelin": "ok",
    "Renault": "ok", "Stellantis": "ok", "Kering": "ok", "Hermès": "ok", "Saint-Gobain": "ok", "Alstom": "ok",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "check",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  saxo: {
    "Amundi PEA Monde": "check", "iShares MSCI World Swap PEA": "ok", "Amundi MSCI World UCITS ETF (C)": "ok",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "check",
    "Amundi PEA MSCI Emerging Markets": "ok", "ETF dividendes Europe PEA (D)": "check",
    "Amundi ETF PEA S&P 500": "check", "Fonds monétaire € court terme": "check",
    "Amundi PEA Euro Court Terme": "check", "Amundi PEA MSCI Europe": "check", "Amundi PEA Nasdaq-100": "check", "Amundi PEA S&P 500 (PSP5)": "check",
    "Amundi PEA Japon (TOPIX)": "check",
    "Amundi PEA Asie Emergente": "check", "BNP Paribas Easy STOXX Europe 600": "check", "Amundi ETF STOXX Europe 600": "check",
    "AXA": "check", "Vinci": "check", "Airbus": "check", "Safran": "check", "Thales": "check", "Société Générale": "check",
    "Crédit Agricole": "check", "Danone": "check", "Orange": "check", "Capgemini": "check", "Michelin": "check",
    "Renault": "check", "Stellantis": "check", "Kering": "check", "Hermès": "check", "Saint-Gobain": "check", "Alstom": "check",
    "iShares MSCI Europe SRI PEA": "ok", "Amundi ETF CAC 40": "ok", "BNP Paribas Easy S&P 500": "check",
    "Schneider Electric": "ok", "LVMH": "ok", "TotalEnergies": "ok", "Sanofi": "ok",
    "L'Oréal": "ok", "Legrand": "ok", "Air Liquide": "ok", "BNP Paribas": "ok",
  },
  traderepublic: {
    "Amundi PEA Monde": "check", "iShares MSCI World Swap PEA": "check", "Amundi MSCI World UCITS ETF (C)": "check",
    "Amundi PEA Global (MSCI ACWI)": "check", "Amundi ETF PEA MSCI Europe": "check",
    "Amundi PEA MSCI Emerging Markets": "check", "ETF dividendes Europe PEA (D)": "check",
    "Amundi ETF PEA S&P 500": "check", "Fonds monétaire € court terme": "check",
    "Amundi PEA Euro Court Terme": "check", "Amundi PEA MSCI Europe": "check", "Amundi PEA Nasdaq-100": "check", "Amundi PEA S&P 500 (PSP5)": "check",
    "Amundi PEA Japon (TOPIX)": "check",
    "Amundi PEA Asie Emergente": "check", "BNP Paribas Easy STOXX Europe 600": "check", "Amundi ETF STOXX Europe 600": "check",
    "AXA": "check", "Vinci": "check", "Airbus": "check", "Safran": "check", "Thales": "check", "Société Générale": "check",
    "Crédit Agricole": "check", "Danone": "check", "Orange": "check", "Capgemini": "check", "Michelin": "check",
    "Renault": "check", "Stellantis": "check", "Kering": "check", "Hermès": "check", "Saint-Gobain": "check", "Alstom": "check",
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
// ================= DIVIDENDES, COURS & EXPOSITIONS (données au 23/10/2026) =================
// Cours de référence indicatifs et rendements dividende estimés 2026 (AG, publications résultats).
// Actualisables en chat : « mets à jour les cours et les dividendes ».
const PRICES = {
  "Schneider Electric": 254, "LVMH": 355, "TotalEnergies": 74, "Sanofi": 82,
  "L'Oréal": 354, "Legrand": 140, "Air Liquide": 175, "BNP Paribas": 86,
  "AXA": 39, "Vinci": 124, "Airbus": 189, "Safran": 208, "Thales": 258, "Société Générale": 38,
  "Crédit Agricole": 16.5, "Danone": 66, "Orange": 11.5, "Capgemini": 158, "Michelin": 32,
  "Renault": 42, "Stellantis": 8.4, "Kering": 268, "Hermès": 2100, "Saint-Gobain": 67, "Alstom": 21,
  // Cours indicatifs des ETF/fonds PEA éligibles — servent au calcul en parts entières du DCA.
  "Amundi PEA Monde": 260, "iShares MSCI World Swap PEA": 32, "Amundi MSCI World UCITS ETF (C)": 480,
  "Amundi PEA Global (MSCI ACWI)": 240, "Amundi ETF PEA MSCI Europe": 260, "Amundi PEA MSCI Europe": 12,
  "Amundi PEA MSCI Emerging Markets": 30, "ETF dividendes Europe PEA (D)": 310,
  "Amundi ETF PEA S&P 500": 310, "Amundi PEA S&P 500 (PSP5)": 305, "Amundi PEA Nasdaq-100": 28,
  "Amundi PEA Japon (TOPIX)": 27, "Amundi ETF STOXX Europe 600": 265, "BNP Paribas Easy STOXX Europe 600": 270,
  "Amundi PEA Asie Emergente": 35, "iShares MSCI Europe SRI PEA": 340, "Amundi ETF CAC 40": 95,
  "BNP Paribas Easy S&P 500": 400, "Amundi PEA Euro Court Terme": 2000, "Fonds monétaire € court terme": 2000,
};
// Rendement dividende estimé 2026, en % de la valeur détenue.
const DIV_YIELD = {
  "Amundi PEA Monde": 1.2, "iShares MSCI World Swap PEA": 1.2, "Amundi MSCI World UCITS ETF (C)": 1.2,
  "Amundi PEA Global (MSCI ACWI)": 1.5, "Amundi ETF PEA MSCI Europe": 3.0,
  "Amundi PEA MSCI Emerging Markets": 2.5, "ETF dividendes Europe PEA (D)": 3.8,
  "Amundi ETF PEA S&P 500": 0.9, "Fonds monétaire € court terme": 2.2,
  "Amundi PEA Euro Court Terme": 2.3, "Amundi PEA MSCI Europe": 3.0, "Amundi PEA Nasdaq-100": 0.5, "Amundi PEA S&P 500 (PSP5)": 0.9,
  "Amundi PEA Japon (TOPIX)": 1.8, "Amundi ETF STOXX Europe 600": 3.2,
  "Amundi PEA Asie Emergente": 1.6, "BNP Paribas Easy STOXX Europe 600": 3.2,
  "AXA": 6.0, "Vinci": 4.4, "Airbus": 1.3, "Safran": 1.5, "Thales": 1.9, "Société Générale": 6.3,
  "Crédit Agricole": 6.0, "Danone": 3.4, "Orange": 6.5, "Capgemini": 2.3, "Michelin": 4.0,
  "Renault": 4.5, "Stellantis": 3.0, "Kering": 3.2, "Hermès": 0.8, "Saint-Gobain": 3.0, "Alstom": 0.0,
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
  "AXA": "mai", "Vinci": "mai", "Safran": "mai", "Thales": "mai", "Société Générale": "mai",
  "Crédit Agricole": "mai", "Danone": "mai", "Orange": "mai", "Capgemini": "mai", "Michelin": "mai",
  "Kering": "mai", "Hermès": "mai", "Saint-Gobain": "mai",
};
// Exposition géographique du sous-jacent (%, approx. oct. 2026) — fr = part France dans l'exposition Europe.
const G_WLD = { us: 70, eu: 15, asie: 10, em: 2, autres: 3, fr: 2 };
const G_ACWI = { us: 62, eu: 15, asie: 9, em: 13, autres: 1, fr: 2 };
const G_EUR = { eu: 100, fr: 18 };
const G_EM = { em: 100 };
const G_US = { us: 100 };
const G_FR = { eu: 100, fr: 100 };
const G_JPN = { asie: 100 };
const S_JPN = { tech: 20, finance: 15, industrie: 20, conso: 15, sante: 5, autres: 25 };
const G_MON = { monet: 100 };
const GEO_MAP = {
  "Amundi PEA Monde": G_WLD, "iShares MSCI World Swap PEA": G_WLD, "Amundi MSCI World UCITS ETF (C)": G_WLD,
  "Amundi PEA Global (MSCI ACWI)": G_ACWI, "Amundi ETF PEA MSCI Europe": G_EUR,
  "Amundi PEA MSCI Emerging Markets": G_EM, "ETF dividendes Europe PEA (D)": G_EUR,
  "Amundi ETF PEA S&P 500": G_US, "Fonds monétaire € court terme": G_MON,
  "Amundi PEA Euro Court Terme": G_MON, "Amundi PEA MSCI Europe": G_EUR, "Amundi PEA Nasdaq-100": G_US, "Amundi PEA S&P 500 (PSP5)": G_US,
  "Amundi PEA Japon (TOPIX)": G_JPN, "Amundi ETF STOXX Europe 600": G_EUR,
  "Amundi PEA Asie Emergente": { asie: 100 }, "BNP Paribas Easy STOXX Europe 600": G_EUR,
  "AXA": G_FR, "Vinci": G_FR, "Airbus": G_FR, "Safran": G_FR, "Thales": G_FR, "Société Générale": G_FR,
  "Crédit Agricole": G_FR, "Danone": G_FR, "Orange": G_FR, "Capgemini": G_FR, "Michelin": G_FR,
  "Renault": G_FR, "Stellantis": G_FR, "Kering": G_FR, "Hermès": G_FR, "Saint-Gobain": G_FR, "Alstom": G_FR,
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
  "Amundi ETF PEA S&P 500": S_SPX, "Fonds monétaire € court terme": { monet: 100 },
  "Amundi PEA Euro Court Terme": { monet: 100 }, "Amundi PEA MSCI Europe": S_EUR, "Amundi PEA Nasdaq-100": { tech: 55, conso: 15, sante: 8, autres: 22 }, "Amundi PEA S&P 500 (PSP5)": S_SPX,
  "Amundi PEA Japon (TOPIX)": S_JPN, "Amundi ETF STOXX Europe 600": S_EUR,
  "Amundi PEA Asie Emergente": { tech: 30, finance: 20, conso: 15, industrie: 15, autres: 20 }, "BNP Paribas Easy STOXX Europe 600": S_EUR,
  "AXA": { finance: 100 }, "Vinci": { industrie: 100 }, "Airbus": { industrie: 100 }, "Safran": { industrie: 100 },
  "Thales": { industrie: 60, tech: 40 }, "Société Générale": { finance: 100 }, "Crédit Agricole": { finance: 100 },
  "Danone": { conso: 100 }, "Orange": { tech: 60, autres: 40 }, "Capgemini": { tech: 100 }, "Michelin": { industrie: 100 },
  "Renault": { conso: 100 }, "Stellantis": { conso: 100 }, "Kering": { conso: 100 }, "Hermès": { conso: 100 },
  "Saint-Gobain": { industrie: 100 }, "Alstom": { industrie: 100 },
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
    const al = (v.alias || []).map(norm);
    for (const x of al) if (n.includes(x) && x.length > bestLen) { best = { name: k, ...v }; bestLen = x.length; }
    if (n.includes(nk)) return { name: k, ...v };
  }
  return best;
}

// ================= UI PRIMITIVES =================
function Card({ title, icon, children, className = "" }) {
  return (
    (React.createElement("div", {"className": ("rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4 shadow-xl shadow-black/10 " + className)}, (title && (
        (React.createElement("div", {"className": "mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500"}, (icon && (React.createElement("span", {"className": "text-sm"}, (icon)))), (title)))
      )), (children)))
  );
}

function Kpi({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "bg-slate-800/40 border-slate-700/40",
    good: "bg-emerald-500/10 border-emerald-500/20",
    warn: "bg-amber-500/10 border-amber-500/20",
    bad: "bg-rose-500/10 border-rose-500/20",
    accent: "bg-emerald-400/10 border-emerald-400/25",
  };
  return (
    (React.createElement("div", {"className": ("rounded-xl border p-3 " + tones[tone])}, (React.createElement("div", {"className": "text-[10px] uppercase tracking-widest text-slate-500"}, (label))), (React.createElement("div", {"className": "mt-1 text-lg font-bold tabular-nums tracking-tight text-slate-50"}, (value))), (sub && (React.createElement("div", {"className": "mt-0.5 text-[11px] text-slate-400"}, (sub))))))
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }) {
  return (
    (React.createElement("div", null, (React.createElement("div", {"className": "mb-1 flex justify-between text-xs"}, (React.createElement("span", {"className": "text-slate-400"}, (label))), (React.createElement("span", {"className": "font-semibold tabular-nums text-emerald-300"}, (value), (suffix))))), (React.createElement("input", {"type": "range", "min": (min), "max": (max), "step": (step), "value": (value), "onChange": ((e) => onChange(Number(e.target.value))), "className": "w-full accent-emerald-400"}))))
  );
}

function Bar({ pct, tone }) {
  const colors = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500", accent: "bg-gradient-to-r from-emerald-400 to-cyan-400" };
  return (
    (React.createElement("div", {"className": "h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"}, (React.createElement("div", {"className": ("h-full rounded-full transition-all duration-300 " + (colors[tone] || colors.accent)), "style": ({ width: Math.max(0, Math.min(100, pct)) + "%" })}))))
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    good: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    bad: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    warn: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    neutral: "bg-slate-500/10 text-slate-300 border-slate-500/20",
    accent: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  };
  return (React.createElement("span", {"className": ("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap " + tones[tone])}, (children)));
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
        }), "placeholder": "Nom, ticker ou ISIN\u2026 (ex : amundi monde, SU, FR001400U5Q4)", "className": "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"})), (open && filtered.length > 0 && (
        (React.createElement("div", {"className": "absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-2xl"}, (filtered.map((k, i) => (
            (React.createElement("button", {"key": (k), "type": "button", "onMouseDown": ((e) => { e.preventDefault(); pick(k); }), "className": ("block w-full px-3 py-2 text-left text-sm " + (i === hi ? "bg-emerald-400/20 text-emerald-50" : "text-slate-300 hover:bg-slate-800"))}, (React.createElement("span", {"className": "font-semibold"}, (k))), (React.createElement("span", {"className": "ml-2 text-xs text-slate-400"}, (CATALOG[k].isin), "\u00b7\u00A0", (CATALOG[k].ticker)))))
          )))))
      ))))
  );
}

// ================= APP =================
// Bandeau "Pourquoi ce split" — les 3 signaux qui justifient la décision du mois.
function PourquoiStrip(p) {
  const an = p.analysis, sp = p.splitPlan, band = p.band, sigPct = p.sigPct, profile = p.profile, majAge = p.majAge;
  const cell = (t, txt) => React.createElement("div", { "className": "rounded-lg border border-slate-700/40 bg-slate-800/40 p-2" },
    React.createElement("div", { "className": "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, t),
    React.createElement("p", { "className": "mt-0.5 text-[11px] leading-snug text-slate-300" }, txt));
  const expoTxt = an.total > 0
    ? "Expo " + an.eqPct.toFixed(0) + " % vs cible " + sp.targetEq.toFixed(0) + " % (bande ±" + band + " pts) — " +
      (an.eqPct > sp.targetEq + band ? "au-dessus : le versement part en sécuritaire, sans vendre."
       : an.eqPct < sp.targetEq - band ? "en dessous : le versement est orienté actions."
       : "dans la bande : DCA au profil, sans dévier.")
    : "Ajoutez vos lignes (onglet Portefeuille) pour ancrer le split sur votre exposition réelle.";
  const sigTxt = (sigPct > 0 ? "+" : "") + sigPct + " pts nets — " +
    (sigPct >= 25 ? "penché haussier : DCA sans timidité."
     : sigPct <= -25 ? "penché baissier : versement discipliné, pas de précipitation."
     : "équilibré : aucune raison de dévier du plan.") +
    (p.tiltOn ? " Tilt horizon ×" + String(p.tiltW).replace(".", ",") + " : " + (p.tiltPts > 0 ? "+" : "") + (p.tiltPts || 0).toFixed(0) + " pts sur l'expo cible du mois." : "");
  const profTxt = PROFILES[profile].label + " → " + sp.targetProfile.toFixed(0) + " % actions au glide path · données du " + RATES.maj +
    (majAge > 30 ? " (" + majAge + " j — demandez « mets à jour les données de marché » en chat)" : "");
  return React.createElement("div", { "className": "mt-2 grid gap-2 sm:grid-cols-3" },
    cell("Pourquoi ce split", expoTxt),
    cell("Consensus 16 sources", sigTxt),
    cell("Profil & données", profTxt));
}
// Diagnostic du portefeuille — l'essentiel en lignes simples.
function DiagPf(p) {
  const an = p.analysis, rp = p.riskPosture, fm = p.fraisModel, dm = p.divModel, ex = p.expoModel;
  const num = (x) => String(x).replace(".", ",");
  const clean = (s) => s.replace(/^\S+\s/, "");
  const row = (icon, label, value) => React.createElement("div", { className: "flex items-start justify-between gap-3 border-b border-slate-800/60 py-2 text-xs last:border-0" },
    React.createElement("span", { className: "shrink-0 text-slate-400" }, icon + " " + label),
    React.createElement("b", { className: "text-right font-semibold leading-snug text-slate-100" }, value));
  return React.createElement("div", null,
    row("💶", "Valeur totale", fmt(an.total) + (an.invested ? " · dont " + fmt(an.invested) + " investis" : "")),
    row("📈", "Performance", (an.pnlPct >= 0 ? "+" : "") + num(Math.round(an.pnlPct)) + " % (" + (an.pnl >= 0 ? "+" : "") + fmt(Math.round(an.pnl)) + ")"),
    row("⚖️", "Risque réel", rp.riskLevel + "/100 · " + rp.riskLabel + (rp.alignment ? " · aligné profil" : " · désaligné profil")),
    row("🌬️", "Volatilité", num(Math.round(an.vol)) + " % · stress −" + fmt(Math.round(an.stressLoss))),
    row("🛡️", "Résilience", an.resilience.toFixed(0) + "/100"),
    row("🧾", "Frais", (fm.fraisPct > 0 && Math.round(fm.fraisPct) < 1 ? "< 1" : num(Math.round(fm.fraisPct))) + " %/an · TER " + (fm.terPond < 1 ? Math.round(fm.terPond * 100) + " pb" : Math.round(fm.terPond) + " %")),
    row("💸", "Dividendes", fmt(Math.round(dm.payTotal)) + "/an · " + num(Math.round(dm.yldPond)) + " %"),
    row("🌍", "Géographie", ex.geoList.slice(0, 4).map((g) => clean(g.label) + " " + num(Math.round(g.pct)) + " %").join(" · ") || "—"),
    row("🏭", "Secteurs (top 3)", ex.secList.slice(0, 3).map((s) => clean(s.label) + " " + num(Math.round(s.pct)) + " %").join(" · ") || "—"));
}

// Marché aujourd'hui — l'essentiel en lignes simples.
function MarcheToday(p) {
  const num = (x) => String(x).replace(".", ",");
  const postureTone = p.riskPosture.posture === "Offensive" ? "good" : p.riskPosture.posture === "Défensive" ? "bad" : "accent";
  const chip = (t) => React.createElement("span", { className: "rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-200 whitespace-nowrap" }, t);
  return React.createElement("div", { className: "space-y-3" },
    React.createElement("div", { className: "flex flex-wrap gap-1.5" },
      chip("🏦 BCE " + num(RATES.bce.toFixed(2)) + " %"),
      chip("🏛️ OAT 10 ans " + num(RATES.oat10.toFixed(1)) + " %"),
      chip("📈 Inflation " + num(inflationAuto) + " %/an"),
      chip("💰 Sécuritaire " + num(bondMuAuto) + " %/an")),
    React.createElement("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-700/40 bg-slate-800/30 p-2.5" },
      React.createElement("div", { className: "flex items-center gap-2" },
        React.createElement("div", { className: "h-2 w-24 overflow-hidden rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500" },
          React.createElement("div", { className: "h-full bg-white/70", style: { width: ((p.sigPct + 100) / 2) + "%" } })),
        React.createElement("span", { className: "text-xs text-slate-300" }, "Consensus 16 sources : ",
          React.createElement("b", { className: "text-slate-100" }, (p.sigPct > 0 ? "+" : "") + p.sigPct + " pts"))),
      React.createElement(Pill, { tone: postureTone }, "🧭 ", p.riskPosture.posture),
      React.createElement("span", { className: "text-[11px] leading-snug text-slate-400" }, p.riskPosture.postureWhy)),
    p.alerts.length === 0
      ? React.createElement("p", { className: "text-xs text-emerald-300" }, "✅ Rien à signaler.")
      : React.createElement("div", { className: "space-y-1" }, p.alerts.map((a, i) => (
          React.createElement("p", { key: i, className: "text-[11px] leading-snug " + (a.sev === "bad" ? "text-rose-300" : a.sev === "warn" ? "text-amber-300" : a.sev === "good" ? "text-emerald-300" : "text-sky-300") }, a.icon + " " + a.text)))),
    React.createElement("div", { className: "flex flex-wrap items-center gap-3" },
      React.createElement("label", { className: "flex items-center gap-1.5 text-[11px] text-slate-400" }, "📅 Jour : ",
        React.createElement("select", { value: p.invDay, onChange: (e) => p.setInvDay(Number(e.target.value)), className: "rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100" },
          Array.from({ length: 28 }, (_, i) => i + 1).map((d) => React.createElement("option", { key: d, value: d }, d)))),
      React.createElement("label", { className: "flex items-center gap-1.5 text-[11px] text-slate-400" }, "🎂 Ouverture : ",
        React.createElement("input", { type: "date", value: p.peaOpenISO, onChange: (e) => p.setPeaOpenISO(e.target.value), className: "rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100" })),
      React.createElement("button", { onClick: p.updateAnalysis, className: "rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/25 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300" }, "Mettre à jour l'analyse"),
      React.createElement(Pill, { tone: p.freshTone }, "Données au ", p.frDate(p.majISO), " · ", p.freshLabel)));
}
// ================= AGENT VEILLE ANALYSTES (par horizon) =================
// L'agent consolide la position de sources de recherche (stratégistes JPM AM, BofA,
// BlackRock, Natixis IM, Edward Jones, FMI, consensus Bloomberg) + une veille YouTube
// (guides ETF PEA 2026), puis la traduit PAR HORIZON de l'objectif : statut du marché,
// positionnement par classe d'actif et propositions PEA concrètes. Le statut et les
// propositions se recalculent dès que le curseur Horizon bouge.
// Snapshot embarqué (veille du 28/10/2026) ; un fichier "veille-analystes.json" déposé
// à côté de l'app (même origine) le rafraîchit sans republier le bundle — demandez
// « mets à jour la veille analystes » à votre assistant, il régénère le JSON.
const VEILLE = {
  maj: "2026-10-28",
  buckets: [
    { id: "court", max: 3, label: "court terme (< 3 ans)" },
    { id: "moyen", max: 5, label: "moyen terme (3 à 5 ans)" },
    { id: "long", max: 10, label: "long terme (5 à 10 ans)" },
    { id: "treslong", max: 99, label: "très long terme (10 ans et +)" },
  ],
  horizons: {
    court: {
      statut: "prudent",
      titre: "Taux US > 5 %, spread de la dette française au plus haut depuis 2011, choc énergétique au Moyen-Orient : à court terme, les stratégistes restent investis mais prudents — la poche monétaire € est l'amortisseur.",
      positions: [
        { actif: "Actions US / Monde", stance: 1, txt: "Consensus Bloomberg (19 stratégistes) : S&P 500 ≈ 7 967 pts fin 2026 — constructif mais volatil après le selloff tech sur les doutes IA." },
        { actif: "Europe", stance: 0, txt: "Neutre (J.P. Morgan AM T4 2026). Jusqu'à la présidentielle française 2027, spread OAT-Bund et défiance sur la dette à surveiller." },
        { actif: "Japon", stance: 1, txt: "Objectifs BofA fin 2026 : TOPIX 3 700 / Nikkei 55 500 — l'un des positionnements les plus solides." },
        { actif: "Émergents", stance: -1, txt: "Neutre à négatif (JPM AM) : exposition momentum > 50 % ; 33 % des stratégistes Natixis IM redoutent l'impact du choc énergétique sur la croissance." },
        { actif: "Monétaire €", stance: 2, txt: "Le héros des horizons courts : fonds € CT rémunérés ~3,5-4 %, sans risque de marché." },
      ],
      propositions: [
        "Priorité à la poche sécuritaire : à moins de 3 ans, le plan DCA oriente déjà le versement vers le monétaire € CT quand l'expo dérive — ne pas le contrarier.",
        "Aucun achat actions au-delà du plan mensuel ; ordres à cours limité le jour d'investissement choisi.",
        "Pas d'arbitrage de panique : vendre en PEA ne déclenche pas d'imposition, mais à court horizon chaque -10 % est difficile à récupérer avant l'objectif.",
      ],
      videos: [
        { id: "ZZNPiG23KaA", titre: "PEA : 3 portefeuilles ETF selon ton profil", source: "YouTube · Investissement Bourse Pour Tous" },
        { id: "iepDfG-2iaM", titre: "Webinaire : construire un portefeuille ETF dans un PEA", source: "YouTube · webinaire débutant" },
      ],
    },
    moyen: {
      statut: "constructif",
      titre: "Les stratégistes privilégient les US et le Japon (JPM AM : S&P 500 à 8 600 pts à 12 mois), l'Europe améliore ses bénéfices, les émergents divisent — à 3-5 ans, on construit, sans précipitation.",
      positions: [
        { actif: "Actions US / Monde", stance: 2, txt: "JPM AM surpondère les US (objectif 12 mois 8 600 pts) ; consensus Bloomberg fin 2026 ≈ 7 967 pts, 4e année consécutive à deux chiffres en vue." },
        { actif: "Europe", stance: 1, txt: "Meilleure croissance des bénéfices depuis 3 ans (BlackRock) ; décote persistante, mais spread de dette français à surveiller jusqu'à la présidentielle 2027." },
        { actif: "Japon", stance: 2, txt: "BofA : TOPIX 3 700 fin 2026 ; les réformes de gouvernance continuent de porter les cours — surpondéré." },
        { actif: "Émergents", stance: 1, txt: "Croissance des bénéfices EM ≈ +50 % en 2026 (BlackRock) mais JPM AM reste neutre : construire par touches régulières." },
        { actif: "Monétaire €", stance: 0, txt: "Rémunéré ~3,5-4 % : le coussin qui garde du sec pour les corrections." },
      ],
      propositions: [
        "Cœur du DCA vers le monde/US : c'est la poche que les stratégistes surpondèrent le plus à 12 mois.",
        "Renforcer le Japon (TOPIX) à chaque versement : positionnement solide des grands cabinets.",
        "Émergents en touches régulières sans dépasser le plafond de ligne : potentiel de bénéfices réel, mais les analystes restent divisés.",
        "Garder le tilt tactique consensus activé (Paramètres) : il lisse les excès signal par signal.",
      ],
      videos: [
        { id: "qDVneDaKkyI", titre: "Construire une stratégie ETF PEA en 2026 : le guide complet", source: "YouTube · Investissement Bourse Pour Tous" },
        { id: "NjuBs2sQ5m4", titre: "Optimiser son portefeuille ETF sur PEA en 2026 (7 étapes)", source: "YouTube · Investissement Bourse Pour Tous" },
      ],
    },
    long: {
      statut: "constructif",
      titre: "À 5-10 ans, la volatilité devient une alliée : cycles de baisse de taux (Edward Jones) et croissance des bénéfices émergents (+50 %, BlackRock) se monétisent par la régularité du DCA.",
      positions: [
        { actif: "Actions US / Monde", stance: 2, txt: "Le cycle IA porte les bénéfices (+12,5 % de BPA attendu) ; multiple ~22x = peu de marge : la régularité l'emporte sur le timing." },
        { actif: "Europe", stance: 1, txt: "Valorisations attractives hors grandes capitalisations (Edward Jones) ; dividendes européens généreux, réinvestis en PEA sans friction fiscale." },
        { actif: "Japon", stance: 1, txt: "La réforme du gouvernement d'entreprise continue de réévaluer les cours — accumulation patiente." },
        { actif: "Émergents", stance: 2, txt: "Bien placés dans les cycles de baisse de taux (Edward Jones) ; FMI : Inde +7 %/an, Asie hors Chine dopée aux puces IA (Taïwan +10,7 %)." },
        { actif: "Monétaire €", stance: -1, txt: "À cet horizon il devient un frein : l'inflation (3,1 % pays avancés en 2026, FMI) ronge son rendement réel." },
      ],
      propositions: [
        "Rester proche de l'expo cible du profil : la bande ±10 pts fait le travail d'entretien, sans panique.",
        "Accentuer progressivement émergents + Japon sur les corrections : à 5-10 ans elles offrent des points d'entrée.",
        "Le versement comme unique outil de rééquilibrage — pas de vente, pas de frais inutiles.",
      ],
      videos: [
        { id: "bB0QNF1mFU4", titre: "4 portefeuilles ETF long terme : quelle stratégie pour vous ?", source: "YouTube · prudent → agressif" },
        { id: "RZ48wbPFycQ", titre: "Mon top 7 des ETF PEA pour 2026", source: "YouTube · sélection ETF PEA" },
      ],
    },
    treslong: {
      statut: "constructif",
      titre: "À 10 ans et plus, l'histoire est claire : l'inflation (4,7 % monde en 2026, FMI) bat le monétaire, la régularité bat le timing, et les crises successives n'ont jamais eu le dernier mot sur un portefeuille diversifié.",
      positions: [
        { actif: "Actions US / Monde", stance: 2, txt: "Rester investi : 4 années consécutives à deux chiffres ne se prédisent pas, mais à 10 ans+ le point d'entrée compte moins que la régularité des apports." },
        { actif: "Europe", stance: 1, txt: "Décote structurelle + dividendes réinvestis : le rendement composé des actions européennes est le moteur silencieux du long terme en PEA." },
        { actif: "Japon", stance: 1, txt: "Positionnement de fond : réformes de gouvernance + croissance des profits sur une décennie." },
        { actif: "Émergents", stance: 2, txt: "Le principal moteur de croissance mondial (FMI : +4,4 % en 2027, Inde 7 %) — la prime émergente se monétise à 10 ans+." },
        { actif: "Monétaire €", stance: -2, txt: "Un parking, pas une poche : à 10 ans+ l'inflation ronge sa valeur réelle — le garder pour les 2-3 dernières années (glide path)." },
      ],
      propositions: [
        "DCA mensuel intégral vers l'expo cible du profil, sans exception ni timing : c'est le seul positionnement que 10 ans d'horizon récompensent.",
        "Les crises sont des occasions : bande ±10 pts + DCA transforment chaque baisse en accumulation.",
        "Le glide path dérisquera automatiquement les dernières années — n'anticipez pas.",
      ],
      videos: [
        { id: "eXtD22xysiA", titre: "Mon Top 5 des ETF PEA (objectif long terme)", source: "YouTube · sélection long terme" },
        { id: "bhHQW1c64Eg", titre: "Mon Top 10 des meilleurs ETF PEA (à garder toute sa vie)", source: "YouTube · sélection ETF" },
      ],
    },
  },
};

// ---- Tilt tactique pondéré par horizon ----
// Le consensus des 16 sources module l'expo cible, mais son poids dépend de l'horizon :
// à court terme on dévie à peine (pas de temps de récupération), à 10 ans et + on capte le signal pleinement.
function tiltWeightOfYears(years) {
  return years <= 3 ? 0.5 : years <= 5 ? 1 : years <= 10 ? 1.3 : 1.6;
}

// L'agent : sélectionne le bucket d'horizon, calcule le statut consolidé et les
// propositions PEA correspondantes (recalculé à chaque changement d'horizon).
function runVeilleAgent(years, snap) {
  const buckets = (snap && snap.buckets) || VEILLE.buckets;
  const b = buckets.find((x) => years <= x.max) || buckets[buckets.length - 1];
  const horizons = (snap && snap.horizons) || VEILLE.horizons;
  const h = horizons[b.id] || VEILLE.horizons[b.id];
  const stances = h.positions.slice(0, 4).map((p) => p.stance);
  const score = stances.reduce((a, c) => a + c, 0) / Math.max(1, stances.length);
  const statut = h.statut || (score >= 0.75 ? "constructif" : score <= -0.5 ? "défensif" : "nuancé");
  const label = { constructif: "Constructif", nuancé: "Nuancé", prudent: "Prudent", "défensif": "Défensif" }[statut] || statut;
  const tone = statut === "constructif" ? "good" : statut === "nuancé" ? "neutral" : statut === "prudent" ? "warn" : "bad";
  return { bucket: b, h, score, statut, label, tone, maj: (snap && snap.maj) || VEILLE.maj, live: !!(snap && snap.live) };
}

// Onglet Veille : statut + positionnement analystes par classe d'actif + propositions
// PEA pour l'horizon + vidéos YouTube consolidées par l'agent + sources.
function VeilleTab({ agent, profile, monthly2, splitPlan, fmt, onUpdate, busy }) {
  // Défensif : un snapshot live malformé ne doit jamais faire planter l'onglet (ni l'app).
  const b = (agent && agent.bucket) || { id: "", label: "—" };
  const h = (agent && agent.h) || { titre: "", positions: [], propositions: [], videos: [] };
  const aTone = (agent && agent.tone) || "neutral";
  const aMaj = (agent && agent.maj) || VEILLE.maj;
  const aLive = !!(agent && agent.live);
  const pos = (h && h.positions) || [];
  const props = (h && h.propositions) || [];
  const vids = (h && h.videos) || [];
  const stanceTxt = (s) => (s >= 1.5 ? "Surpondéré" : s >= 0.5 ? "Plutôt +" : s <= -1.5 ? "Sous-pondéré" : s <= -0.5 ? "Plutôt −" : "Neutre");
  const stanceTone = (s) => (s >= 0.5 ? "good" : s <= -0.5 ? "bad" : "neutral");
  const stanceColor = (s) => (s >= 0.5 ? "text-emerald-300" : s <= -0.5 ? "text-rose-300" : "text-slate-300");
  return (
    (React.createElement("div", { className: "grid gap-4 lg:grid-cols-2" },
      (React.createElement(Card, { title: "Positionnement analystes — " + b.label, icon: "🛰️", className: "lg:col-span-2" },
        (React.createElement("div", { className: "flex flex-wrap items-center gap-1.5" },
          (React.createElement(Pill, { tone: aTone }, "Statut : ", (agent && agent.label) || "—")),
          (React.createElement(Pill, { tone: "accent" }, "Profil " + profile)),
          (React.createElement(Pill, { tone: "neutral" }, "Veille du " + aMaj)),
          (aLive && (React.createElement(Pill, { tone: "good" }, "snapshot live ✓"))),
          (React.createElement("button", { onClick: onUpdate, disabled: !!busy, title: "Relance l'agent veille sur le snapshot du jour", className: "ml-auto rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60" }, busy ? "⟳ Actualisation de l'agent…" : "⟳ Mettre à jour la veille"))
        )),
        (React.createElement("p", { className: "mt-2 text-xs leading-relaxed text-slate-300" }, h.titre)),
        (React.createElement("div", { className: "mt-3 grid gap-2 sm:grid-cols-2" },
          pos.map((p) => (
            (React.createElement("div", { key: p.actif, className: "rounded-xl border border-slate-700/40 bg-slate-800/30 p-2.5" },
              (React.createElement("div", { className: "flex items-center gap-2" },
                (React.createElement("span", { className: "shrink-0 text-xs font-semibold text-slate-100" }, p.actif)),
                (React.createElement("span", { className: "min-w-8 flex-1" },
                  (React.createElement(Bar, { pct: ((p.stance + 2) / 4) * 100, tone: stanceTone(p.stance) }))
                )),
                (React.createElement("span", { className: "shrink-0 text-[10px] font-semibold " + stanceColor(p.stance) }, stanceTxt(p.stance)))
              )),
              (React.createElement("p", { className: "mt-1.5 text-[11px] leading-snug text-slate-400" }, p.txt))
            ))
          ))
        ))
      )),
      (React.createElement(Card, { title: "Propositions PEA pour cet horizon", icon: "🎯" },
        (React.createElement("ol", { className: "space-y-2" },
          props.map((p, i) => (
            (React.createElement("li", { key: i, className: "flex gap-2 rounded-xl border border-slate-700/40 bg-slate-800/30 p-2.5 text-xs leading-relaxed text-slate-200" },
              (React.createElement("span", { className: "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[11px] font-bold text-slate-950" }, i + 1)),
              (React.createElement("span", null, p))
            ))
          ))
        )),
        (React.createElement("div", { className: "mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 text-[11px] leading-relaxed text-slate-200" },
          "Ce mois, appliqué à votre versement de ", (React.createElement("b", null, fmt(monthly2))), " : ",
          (React.createElement("b", { className: "text-emerald-200" }, fmt(splitPlan.dEq))), " actions / ",
          (React.createElement("b", { className: "text-sky-300" }, fmt(splitPlan.dBdTot))), " sécuritaire vers l'expo cible ",
          (React.createElement("b", null, splitPlan.targetEq.toFixed(0), " %")),
          " — l'agent ajuste statut & propositions à l'horizon, le plan DCA reste maître des montants."
        ))
      )),
      (React.createElement(Card, { title: "Vidéos YouTube du moment", icon: "▶️" },
        (React.createElement("div", { className: "grid gap-2.5 sm:grid-cols-2" },
          vids.map((v) => (
            (React.createElement("a", { key: v.id, href: "https://www.youtube.com/watch?v=" + v.id, target: "_blank", rel: "noopener noreferrer", className: "group overflow-hidden rounded-xl border border-slate-700/40 bg-slate-800/30 transition hover:border-emerald-300/50" },
              (React.createElement("img", { src: "https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg", alt: v.titre, loading: "lazy", className: "aspect-video w-full object-cover opacity-80 transition group-hover:opacity-100" })),
              (React.createElement("div", { className: "p-2.5" },
                (React.createElement("p", { className: "text-[11px] font-semibold leading-snug text-slate-100" }, v.titre)),
                (React.createElement("p", { className: "mt-1 text-[10px] text-slate-500" }, v.source))
              ))
            ))
          ))
        )),
        (React.createElement("p", { className: "mt-2 text-[10px] leading-snug text-slate-500" }, "Sélection consolidée par l'agent lors de la dernière veille YouTube — cliquez pour ouvrir dans un nouvel onglet."))
      )),
      (React.createElement(Card, { title: "Sources & méthode", icon: "🔬" },
        (React.createElement("ul", { className: "space-y-1.5 text-[11px] leading-snug text-slate-300" },
          ([
            ["J.P. Morgan AM — allocation d'actifs T4 2026", "https://am.jpmorgan.com/fr/fr/asset-management/per/insights/portfolio-insights/asset-allocation-views/"],
            ["Consensus Wall Street S&P 500 fin 2026 (Bloomberg, oct. 2026)", "https://fr.investing.com/news/stock-market-news/un-sondage-revele-le-consensus-de-wall-street-sur-le-sp-500-fin-2026-3653051"],
            ["BofA — perspectives marché japonais 2026 (TOPIX 3 700)", "https://fr.finance.yahoo.com/actualites/perspectives-march%C3%A9-boursier-japonais-2026-101023975.html"],
            ["Natixis IM — perspectives des stratégistes 2026", "https://www.im.natixis.com/fr-fr/insights/investor-sentiment/2026/strategist-outlook"],
            ["Edward Jones — prévisions 2026", "https://www.edwardjones.ca/ca-fr/actualite-des-marches-et-perspectives/actualite-des-marches-boursiers/previsions-2026"],
            ["FMI — Perspectives de l'économie mondiale, oct. 2026", "https://www.imf.org/fr/Publications/WEO"],
          ]).map((pair) => (
            (React.createElement("li", { key: pair[1] },
              (React.createElement("a", { href: pair[1], target: "_blank", rel: "noopener noreferrer", className: "text-emerald-300/90 underline-offset-2 hover:underline" }, pair[0]))
            ))
          ))
        )),
        (React.createElement("p", { className: "mt-3 text-[10px] leading-relaxed text-slate-500" },
          "L'agent consolide ces sites de recherche + une veille YouTube (guides ETF PEA 2026) dans un snapshot daté, rattaché à l'horizon de votre objectif : le statut et les propositions PEA changent automatiquement quand vous bougez le curseur Horizon. Pour rafraîchir sans republier l'app : demandez « mets à jour la veille analystes » à votre assistant — il régénère veille-analystes.json, chargé automatiquement au lancement. Pédagogique — pas un conseil en investissement personnalisé."
        ))
      ))
    )
  )
  );
}

function App() {
  const [tab, setTab] = useState("reco");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [monthly, setMonthly] = useState(() => LS.get("peaMonthly", 550));
  const [capital0, setCapital0] = useState(() => LS.get("peaCapital0", 2000));
  const [years, setYears] = useState(() => LS.get("peaYears", 5));
  const [profile, setProfile] = useState(() => LS.get("peaProfile", "equilibre"));
  const [band, setBand] = useState(() => LS.get("peaBand", 10));
  const [tactical, setTactical] = useState(() => LS.get("peaTactical", true));
  const [goal, setGoal] = useState(() => LS.get("peaGoal", 50000));
  const [bank, setBank] = useState(() => LS.get("peaBank", "fortuneo"));
  const [photo, setPhoto] = useState(null);
  const [top3, setTop3] = useState(null);
  const [invDay, setInvDay] = useState(() => LS.get("peaInvDay", 5));
  const [majISO, setMajISO] = useState(() => LS.get("peaMajISO", "2026-10-23"));
  const [peaOpenISO, setPeaOpenISO] = useState(() => LS.get("peaOpenISO", "2023-03-01")); // ouverture du PEA — pilote l'anniversaire des 5 ans
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("peaHist") || "[]"); } catch (e) { return []; }
  });
  const [lines, setLines] = useState(() => LS.get("peaLines", [
    { id: 1, nom: "Amundi PEA Monde (MSCI World)", type: "action", valeur: 1500, pv: 111 },
  ]));
  const [veilleSnap, setVeilleSnap] = useState(VEILLE);
  const [veilleBusy, setVeilleBusy] = useState(false);
  // Bouton push « Mettre à jour la veille » : relance l'agent analystes sur le snapshot du jour.
  const updateVeille = () => {
    setVeilleBusy(true);
    setTimeout(() => {
      const today = new Date().toISOString().slice(0, 10);
      setVeilleSnap({ ...VEILLE, maj: today, live: true });
      setMajISO(today);
      setVeilleBusy(false);
    }, 800);
  };
  const addLine = () => setLines([...lines, { id: Date.now(), nom: "", type: "action", valeur: 0, pv: 0 }]);
  const upLine = (id, field, v) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: v } : l)));
  const rmLine = (id) => setLines(lines.filter((l) => l.id !== id));
  // ---- Sauvegarde automatique des réglages et du portefeuille ----
  useEffect(() => {
    LS.set("peaMonthly", monthly); LS.set("peaCapital0", capital0); LS.set("peaYears", years);
    LS.set("peaProfile", profile); LS.set("peaBand", band); LS.set("peaTactical", tactical);
    LS.set("peaGoal", goal); LS.set("peaBank", bank); LS.set("peaInvDay", invDay);
    LS.set("peaOpenISO", peaOpenISO); LS.set("peaLines", lines);
  }, [monthly, capital0, years, profile, band, tactical, goal, bank, invDay, peaOpenISO, lines]);
  // ---- Agent veille analystes : charge un snapshot plus récent si veille-analystes.json
  // est déposé à côté de l'app (même origine, GitHub Pages) — silencieux sinon (fallback embarqué).
  useEffect(() => {
    try {
      if (typeof fetch !== "function") return;
      fetch("veille-analystes.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && d.horizons) setVeilleSnap(Object.assign({}, VEILLE, d, { live: true })); })
        .catch(() => {});
    } catch (e) {}
  }, []);
  // La décision ne doit attendre aucun clic : le Top 3 est calculé dès l'ouverture de l'onglet Recommandations.
  useEffect(() => { if (tab === "reco" && top3 === null) computeTop3(); }, [tab]);
  const onPhoto = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(f);
  };

  const pf = PROFILES[profile] || PROFILES.equilibre;

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
    const valo = invested > 0 ? Math.round((pv / invested) * 100) : 0;
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
  const monthly2 = Math.min(Math.max(monthly, 0), 1000);

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
  const goalReel = goal / Math.pow(1 + inflationAuto / 100, years);
  const erosInfl = Math.max(0, goal - goalReel);

  // ---- Impact des frais sur l'horizon : même projection avec vs sans frais ----
  const rmBrut = Math.pow(1 + blendedMu, 1 / 12) - 1;
  const fvBrut = holdTotal * Math.pow(1 + rmBrut, n) + monthly2 * (rmBrut === 0 ? n : (Math.pow(1 + rmBrut, n) - 1) / rmBrut);
  const fvNet = fvCapital + monthly2 * annuity;
  const coutFraisHorizon = Math.max(0, fvBrut - fvNet);

  // ---- Simulation Monte Carlo, avec les frais réels calculés ----
  const params = {
    monthly, capital0: capital0 + holdTotal, years,
    equityMu: pf.eqMu, equityVol: pf.eqVol,
    bondMu: bondMuAuto, bondVol: 5,
    targetEquity: pf.eq, glideTo: pf.glideTo,
    band, tactical, inflation: inflationAuto, frais: fraisModel.fraisPct,
  };
  const stats = useMemo(() => {
    const paths = simulate(params, 400);
    const pct = percentiles(paths);
    const cash0 = capital0 + holdTotal; for (const row of pct) row.cashReel = cash0 / Math.pow(1 + inflationAuto / 100, row.annee); const cashReelFinal = cash0 / Math.pow(1 + inflationAuto / 100, years);
    const final = paths.map((p) => p[p.length - 1]).sort((a, b) => a - b);
    const q = (x) => final[Math.floor(x * final.length)];
    const verse = capital0 + holdTotal + monthly * years * 12;
    const med = q(0.5);
    const probaGain = final.filter((v) => v > verse).length / final.length;
    const medReel = med / Math.pow(1 + inflationAuto / 100, years);
    return { pct, verse, med, p5: q(0.05), p95: q(0.95), probaGain, medReel, cash0, cashReelFinal };
  }, [monthly, capital0, holdTotal, years, profile, band, tactical, fraisModel]);

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
        eqPct: ((eq / (eq + bd)) * 100).toFixed(0),
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
        : c.indice.includes("Europe") ? "action-europe" : c.indice.includes("EM") ? "action-em" : c.indice.includes("TOPIX") || c.indice.includes("Nasdaq") ? "action-monde" : "action";
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
      if (profile === "prudent") { if (cat === "monet" || c.indice.includes("Dividendes")) s += 15; if (cat === "action-em" || c.indice.includes("Nasdaq")) s -= 15; }
      if (profile === "equilibre" && (c.indice.includes("World") || c.indice.includes("ACWI"))) s += 10;
      if (profile === "dynamique") { if (cat === "action-monde" || c.indice.includes("Nasdaq") || cat === "action-em") s += 10; if (cat === "monet") s -= 5; }
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
    updateVeille();
    computeTop3();
  };

  // ---- Split du versement du mois : rééquilibrage × exposition pour tenir l'objectif ----
  const splitPlan = useMemo(() => {
    const total = analysis.total;
    const eqPct = analysis.eqPct;
    const months = Math.max(1, years * 12);
    // 1) Cible profil au point courant du glide path — avec tilt tactique pondéré par horizon (si activé)
    const tiltPts = tactical ? Math.max(-15, Math.min(15, sigPct * 0.15 * tiltWeightOfYears(years))) : 0;
    const targetProfile = Math.max(0, Math.min(100, pf.eq + (pf.glideTo - pf.eq) / months + tiltPts));
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
    // 5 bis) Parts entières : chaque ligne est achetée en parts complètes au cours de référence ;
    // le reliquat de CHAQUE ligne (report) est conservé puis réinjecté sur la même ligne les mois
    // suivants — persisté par mois (idempotent), logé en attendant sur le monétaire €.
    const monthKey = nextInv.getFullYear() + "-" + nextInv.getMonth();
    const savedRep = LS.get("peaReport", null);
    let carryMap = {};
    if (savedRep && savedRep.key === monthKey && savedRep.carry && typeof savedRep.carry === "object") carryMap = savedRep.carry;
    else if (savedRep && savedRep.last && typeof savedRep.last === "object") carryMap = savedRep.last;
    const carryIn = Object.values(carryMap).reduce((a, b) => a + (b || 0), 0);
    const dispo = dEq + carryIn;
    let eqAmounts = prio.map((w) => Math.round((dEq * w) / wsum / 5) * 5);
    let diff = dEq - eqAmounts.reduce((a, b) => a + b, 0);
    if (eqAmounts.length) eqAmounts[eqAmounts.indexOf(Math.max(...eqAmounts))] += diff;
    let spent = 0;
    const lastMap = {};
    const eqSplit = pool.map((r, i) => {
      const price = PRICES[r.nom] || (r.ref && PRICES[r.ref.name]) || (r.nom ? PRICES[String(r.nom).replace(/\s*\([^)]*\)\s*$/, "")] : 0) || 0;
      const myCarry = Math.max(0, carryMap[r.nom] || 0);
      const target = Math.max(0, Math.min((eqAmounts[i] || 0) + myCarry, dispo - spent));
      const nParts = price > 0 ? Math.floor(target / price) : 0;
      const montant = price > 0 ? nParts * price : target;
      spent += montant;
      const rest = price > 0 ? Math.max(0, target - montant) : 0;
      if (price > 0) lastMap[r.nom] = rest;
      return {
        nom: r.nom || "(ligne sans nom)", montant, parts: price > 0 ? nParts : null, price, report: rest, weight: r.weight,
        compat: r.ref ? peaCompat(bank, r.ref.name) : null,
        note: dEq === 0 ? "expo au-dessus de la cible — DCA orienté sécuritaire ce mois" : r.weight >= maxW ? "au plafond — renforce les autres" : isDiversified(r) ? "ETF cœur · prioritaire" : "ligne unique · capée",
      };
    });
    const dEqExec = pool.length ? spent : dEq;
    const newLeft = Math.max(0, dEq - spent);
    const reportTot = pool.length ? newLeft : 0;
    LS.set("peaReport", { key: monthKey, carry: carryMap, last: pool.length ? (dEq === 0 ? carryMap : lastMap) : (savedRep && savedRep.last && typeof savedRep.last === "object" ? savedRep.last : lastMap) });
    const bdSplit = bdLines.map((r) => ({ nom: r.nom || "(ligne sans nom)", montant: 0, weight: r.weight, compat: null, note: "poche sécuritaire" + (reportTot > 0 ? " · inclut " + fmt(Math.round(reportTot)) + " de report DCA (en attente de parts entières)" : "") }));
    if (bdLines.length === 1) bdSplit[0].montant = dBd + newLeft;
    const dBdTot = dBd + newLeft;
    return { targetEq, targetProfile, eqNeeded: Math.max(0, Math.min(100, eqNeeded)), reachable, dEq, dEqExec, dBd, dBdTot, reportTot, eqSplit, bdSplit, capEq, maxW };
  }, [analysis, pf, band, monthly2, goal, fvCapital, years, profile, fraisModel, bank, requiredMonthly, nextInv, tactical, sigPct]);

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
      push("warn", "💶", `Frais élevés : ${Math.round(fraisModel.fraisPct)} %/an (${fmt(fraisModel.fraisAn)}) — TER et courtage à optimiser.`);
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
    const eqTop = splitPlan.eqSplit.filter((x) => x.montant > 0).slice(0, 2).map((x) => `${fmt(x.montant)} ${x.nom}${x.parts ? " (" + x.parts + " part" + (x.parts > 1 ? "s" : "") + ")" : ""}`).join(" + ");
    const bdTop = splitPlan.bdSplit.filter((x) => x.montant > 0).map((x) => `${fmt(x.montant)} ${x.nom}`).join(" + ");
    parts.push(`🎯 Vos ${fmt(monthly2)} du mois — 3 propositions (consensus 16 analystes : ${consensusLabel.toLowerCase()}, ${sigPct >= 0 ? "+" : ""}${sigPct}/100) :`);
    parts.push(`A · Recommandé (profil ${pf.label}) : ${eqTop ? eqTop + " + " : ""}${bdTop || fmt(splitPlan.dBdTot) + " poche sécuritaire"} — ${fmt(splitPlan.dEqExec)} en parts / ${fmt(splitPlan.dBdTot)} sécuritaire${splitPlan.reportTot > 0 ? " (" + fmt(Math.round(splitPlan.reportTot)) + " reportés faute de parts entières)" : ""}, suit votre glide path.`);
    parts.push(`B · Plus offensif : ${fmt(Math.min(monthly2, splitPlan.dEq + 100))} actions / ${fmt(Math.max(0, splitPlan.dBd - 100))} sécuritaire — si vous jugez le marché trop prudent (Mag 7, Berkshire redéploie).`);
    parts.push(`C · Plus défensif : ${fmt(Math.max(0, splitPlan.dEq - 100))} actions / ${fmt(Math.min(monthly2, splitPlan.dBd + 100))} sécuritaire — si la volatilité vous pèse (CAPE US cher, bulle IA).`);
    if (goalOk) parts.push(`Objectif ${fmt(goal)} en ${years} ans : sur la bonne trajectoire (requis ≈ ${fmt(requiredMonthly)}/mois).`);
    else parts.push(`Objectif ${fmt(goal)} : avec ${fmt(monthly2)}/mois il manquera ~${fmt(Math.max(0, goal - fvCapital))} — visez ${fmt(fvCapital + monthly2 * annuity)} ou augmentez l'horizon.`);
    if (divModel.payTotal > 0) parts.push(`💸 Dividendes estimés ≈ ${fmt(Math.round(divModel.payTotal))}/an (${fmt(Math.round(divModel.payTotal / 12))}/mois) — versés dans l'enveloppe sans imposition, ils s'ajoutent au DCA et composent seuls.`);
    if (analysis.nEff < 3 && analysis.total > 0) parts.push(`⚠️ Résilience faible (${analysis.nEff.toFixed(1)} lignes effectives) : diversifiez plutôt que d'ajouter à la même ligne.`);
    if (eqPct < pf.eq - band && analysis.total > 0) parts.push(`📈 Sous-exposition actions (${eqPct.toFixed(0)} % vs cible ${pf.eq} %) : orientez 100 % du DCA vers la poche actions jusqu'à revenir dans la bande — aucune vente nécessaire.`);
    if (analysis.total > 0 && eqPct > splitPlan.targetEq + band) parts.push(`📉 Surexposition actions (${eqPct.toFixed(0)} % vs cible ${splitPlan.targetEq.toFixed(0)} % au glide path) : ce mois le versement part en poche sécuritaire pour revenir dans la bande — rééquilibrage par les apports, sans vendre. Ajoutez un fonds monétaire € (ex. Amundi PEA Euro Court Terme) dans l'onglet Portefeuille pour l'accueillir, ou laissez en espèces chez votre courtier.`);
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

  const veille = useMemo(() => runVeilleAgent(years, veilleSnap), [years, veilleSnap]);
  // Tilt tactique effectif : signal des 16 sources × poids d'horizon (affiché dans « Pourquoi ce plan »).
  const tiltW = tiltWeightOfYears(years);
  const tiltPts = tactical ? Math.max(-15, Math.min(15, sigPct * 0.15 * tiltW)) : 0;
  const tabs = [
    { id: "pf", label: "Portefeuille" },
    { id: "obj", label: "Objectif" },
    { id: "reco", label: "Reco" },
    { id: "veille", label: "Veille" },
  ];
  const tabBtn = (t) =>
    "flex items-center justify-center rounded-full px-2 py-2 text-[11px] sm:text-xs font-medium transition whitespace-nowrap " +
    (tab === t ? "bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 shadow-lg shadow-emerald-500/25" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200");

  const riskGauge = [{ name: "risque", value: riskPosture.riskLevel,
    fill: riskPosture.riskLevel < 50 ? "#34d399" : riskPosture.riskLevel < 70 ? "#fbbf24" : "#fb7185" }];

  return (
    (React.createElement("div", {"className": "min-h-screen bg-[#070d1a] p-3 font-sans text-slate-100 antialiased sm:p-5"}, (React.createElement("div", {"className": "mx-auto max-w-6xl space-y-5"}, (React.createElement("div", {"className": "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4 shadow-xl shadow-black/10"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-3"}, (React.createElement("div", null, (React.createElement("h1", {"className": "text-2xl font-bold tracking-tight"}, React.createElement("svg", { viewBox: "0 0 48 24", "aria-label": "Co-pilote", className: "mr-1 inline-block h-6 w-11 shrink-0 align-[-3px] drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]" }, React.createElement("defs", null, React.createElement("linearGradient", { id: "lgWing", x1: "0", y1: "0", x2: "1", y2: "0" }, React.createElement("stop", { offset: "0%", stopColor: "#34d399" }), React.createElement("stop", { offset: "100%", stopColor: "#22d3ee" }))), React.createElement("path", { d: "M22 9.5 C15.5 6 7.5 6.3 2 8.4 C6 11.2 13 13 21 14.2 Z", fill: "url(#lgWing)" }), React.createElement("path", { d: "M26 9.5 C32.5 6 40.5 6.3 46 8.4 C42 11.2 35 13 27 14.2 Z", fill: "url(#lgWing)" }), React.createElement("circle", { cx: 24, cy: 11.6, r: 4.4, fill: "#070d1a", stroke: "url(#lgWing)", strokeWidth: 1.6 }), React.createElement("path", { d: "M24.8 8.3 L24.8 14.5 M24.8 8.9 L21.9 12.9 L24.8 12.9", stroke: "#22d3ee", strokeWidth: 1.1, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" })), (React.createElement("span", {"className": "bg-gradient-to-r from-emerald-300 via-emerald-200 to-cyan-300 bg-clip-text text-transparent"}, "PEA Co-Pilot")), (React.createElement("span", {"className": "mt-0.5 block text-[11px] font-medium text-slate-400 sm:ml-2 sm:inline sm:text-sm"}, "Horizon\u00A0", (years), "\u00A0ans")))), (React.createElement("p", {"className": "mt-0.5 text-xs text-slate-400"}, "DCA\u00A0", (monthly), "\u00A0\u20ac/mois \u00b7 Objectif\u00A0", (fmt(goal)), "\u00A0\u00b7 Profil\u00A0", (pf.label))))), (React.createElement("div", {"className": "flex flex-wrap items-center gap-2"}, (React.createElement("span", {"className": "text-[11px] leading-snug text-slate-400"}, "Consensus ", (consensusLabel), " ", (sigPct >= 0 ? "+" : ""), (sigPct), " pts · Risque ", (riskPosture.riskLevel), "/100 · ", (riskPosture.efficiency), (React.createElement("span", {"className": "hidden opacity-70 sm:inline"}, " · 16 sources, MAJ ", (frDate(majISO)))))), (alerts.length > 0 && (
                (React.createElement("div", { className: "relative" },
                  (alertsOpen && (React.createElement("div", { className: "fixed inset-0 z-20", onClick: () => setAlertsOpen(false) }))),
                  React.createElement("div", { className: "relative" },
                    React.createElement("button", { onClick: () => setAlertsOpen(!alertsOpen), className: "cursor-pointer rounded-full focus:outline-none" },
                      React.createElement(Pill, {"tone": (alerts.some((a) => a.sev === "bad") ? "bad" : alerts.some((a) => a.sev === "warn") ? "warn" : "good")}, "\ud83d\udd14\u00A0", (alerts.length), "\u00A0alerte", (alerts.length > 1 ? "s" : ""), alertsOpen ? "\u00A0\u25b4" : "\u00A0\u25be")),
                    (alertsOpen && (React.createElement("div", { className: "absolute right-0 top-full mt-2 w-80 max-w-[85vw] rounded-2xl border border-white/10 bg-[#0b1426]/95 p-3 shadow-xl shadow-black/40 backdrop-blur-md" },
                      React.createElement("p", { className: "mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400" }, "Alertes actives"),
                      React.createElement("div", { className: "space-y-1.5" },
                        alerts.map((a, i) => (React.createElement("p", { key: i, className: "text-[11px] leading-snug " + (a.sev === "bad" ? "text-rose-300" : a.sev === "warn" ? "text-amber-300" : a.sev === "good" ? "text-emerald-300" : "text-sky-300") }, a.icon + " " + a.text)))),
                      React.createElement("button", { onClick: () => { setTab("obj"); setAlertsOpen(false); }, className: "mt-2.5 w-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300" }, "Voir l'analyse compl\u00e8te \u2192")))))))
              )))))), (React.createElement("div", {"className": "mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 sm:grid-cols-4"}, (tabs.map((t) => (
              (React.createElement("button", {"key": (t.id), "onClick": (() => setTab(t.id)), "className": (tabBtn(t.id))}, (t.label)))
            ))))))), (tab === "obj" && (
          (React.createElement("div", {"className": "grid gap-4 md:grid-cols-3"}, (React.createElement(Card, {"title": "Param\u00e8tres", "icon": "\u2699\ufe0f", "className": "space-y-3 md:col-span-1"}, (React.createElement(Slider, {"label": "Versement mensuel\u00A0", "value": (monthly), "min": (0), "max": (1000), "step": (25), "onChange": (setMonthly), "suffix": " \u20ac"})), (React.createElement(Slider, {"label": "Capital initial (en plus du portefeuille)", "value": (capital0), "min": (0), "max": (50000), "step": (1000), "onChange": (setCapital0), "suffix": " \u20ac"})), (React.createElement(Slider, {"label": "Horizon", "value": (years), "min": (1), "max": (30), "step": (1), "onChange": (setYears), "suffix": " ans"})), (React.createElement("div", null, (React.createElement("div", {"className": "mb-1.5 text-xs text-slate-400"}, "Profil de risque")), (React.createElement("div", {"className": "flex gap-1.5"}, (Object.entries(PROFILES).map(([k, v]) => (
                    (React.createElement("button", {"key": (k), "onClick": (() => setProfile(k)), "className": ("flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition " +
                        (profile === k ? "bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"))}, (v.label)))
                  ))))))), (React.createElement("label", {"className": "flex items-center gap-2 text-xs text-slate-300"}, (React.createElement("input", {"type": "checkbox", "checked": (tactical), "onChange": ((e) => setTactical(e.target.checked)), "className": "h-4 w-4 accent-emerald-400"})), "\u00A0Tilt tactique selon consensus analyste (pondéré par l'horizon)")))), (React.createElement(Card, {"title": "Projection Monte Carlo \u2014 400 sc\u00e9narios", "icon": "\ud83d\udcca", "className": "md:col-span-2"}, (React.createElement("div", {"className": "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"}, (React.createElement(Kpi, {"label": "Total vers\u00e9", "value": (fmt(stats.verse))})), (React.createElement(Kpi, {"label": "M\u00e9dian", "value": (fmt(stats.med)), "tone": "accent"})), (React.createElement(Kpi, {"label": "P95", "value": (fmt(stats.p95)), "tone": "good"})), (React.createElement(Kpi, {"label": "P5", "value": (fmt(stats.p5)), "tone": "bad"})))), (React.createElement("div", {"className": "h-64"}, (React.createElement(ResponsiveContainer, null, (React.createElement(ComposedChart, {"data": (stats.pct)}, (React.createElement("defs", null, (React.createElement("linearGradient", {"id": "gmed", "x1": "0", "y1": "0", "x2": "0", "y2": "1"}, (React.createElement("stop", {"offset": "0%", "stopColor": "#22d3ee", "stopOpacity": (0.45)})), (React.createElement("stop", {"offset": "100%", "stopColor": "#22d3ee", "stopOpacity": (0.02)})))))), (React.createElement(CartesianGrid, {"strokeDasharray": "3 3", "stroke": "#334155"})), (React.createElement(XAxis, {"dataKey": "annee", "tickFormatter": ((v) => `${v.toFixed(1)}a`), "stroke": "#94a3b8", "fontSize": (11)})), (React.createElement(YAxis, {"tickFormatter": (fmtK), "stroke": "#94a3b8", "fontSize": (11)})), (React.createElement(Tooltip, {"contentStyle": ({ background: "#1e293b", border: "1px solid #475569", borderRadius: 12 }), "formatter": ((v) => fmt(Number(v))), "labelFormatter": ((l) => `Année ${Number(l).toFixed(1)}`)})), (React.createElement(ReferenceLine, {"y": (stats.verse), "stroke": "#94a3b8", "strokeDasharray": "5 5", "label": ({ value: "Total versé", fontSize: 11, fill: "#94a3b8", position: "insideTopLeft" })})), (React.createElement(Area, {"dataKey": "p95", "stroke": "#34d399", "strokeOpacity": (0.45), "fill": "none", "strokeWidth": (1), "strokeDasharray": "5 5", "dot": (false), "name": "P95 (optimiste)"})), (React.createElement(Area, {"dataKey": "p50", "stroke": "#22d3ee", "fill": "url(#gmed)", "strokeWidth": (2.5), "name": "M\u00e9dian"})), (React.createElement(Area, {"dataKey": "p5", "stroke": "#fb7185", "strokeOpacity": (0.45), "fill": "none", "strokeWidth": (1), "strokeDasharray": "5 5", "dot": (false), "name": "P5 (pessimiste)"})))))))), (React.createElement("p", {"className": "mt-1 text-[10px] leading-snug text-slate-500"}, "Aire cyan = trajectoire médiane · pointillés vert/rose = fourchette P95–P5 · ligne grise = total versé.")), (React.createElement("div", {"className": "mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2"}, (React.createElement("div", {"className": "rounded-xl border border-slate-800 bg-slate-800/40 p-2.5"}, "Probabilit\u00e9 de finir\u00A0", (React.createElement("b", null, "au-dessus du vers\u00e9")), ":\u00A0", (" "), (React.createElement("b", {"className": (stats.probaGain > 0.7 ? "text-emerald-400" : "text-amber-400")}, ((stats.probaGain * 100).toFixed(0)), "\u00A0%")))), (React.createElement("div", {"className": "rounded-xl border border-slate-800 bg-slate-800/40 p-2.5"}, "M\u00e9dian en\u00A0", (React.createElement("b", null, "euros r\u00e9els")), ":\u00A0", (React.createElement("b", {"className": "text-emerald-300"}, (fmt(stats.medReel)))), " \u2014 l'inflation\u00A0", (String(inflationAuto.toFixed(1)).replace(".", ",")), " %/an\u00A0vous co\u00fbte\u00A0", (React.createElement("b", {"className": "text-cyan-300"}, (fmt(Math.max(0, stats.med - stats.medReel)))), "\u00A0sur l'horizon", " Non investi, votre capital de\u00A0", (React.createElement("b", null, (fmt(stats.cash0)))), " ne vaudrait que\u00A0", (React.createElement("b", {"className": "text-rose-300"}, (fmt(stats.cashReelFinal)))), "\u00A0en pouvoirs d'achat (\u2212", (fmt(Math.max(0, stats.cash0 - stats.cashReelFinal))), " rogn\u00e9s par l'inflation \u2014 investir est la d\u00e9fense."))))))), (React.createElement(Card, { title: "Impact de l'inflation — votre portefeuille sur " + years + " ans", icon: "🔥", className: "md:col-span-3" },
          React.createElement("div", { className: "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" },
            React.createElement(Kpi, { label: "Médian nominal", value: fmt(stats.med), sub: "dans " + years + " ans" }),
            React.createElement(Kpi, { label: "En € d'aujourd'hui", value: fmt(stats.medReel), tone: "accent", sub: "pouvoir d'achat réel" }),
            React.createElement(Kpi, { label: "Rongé par l'inflation", value: fmt(Math.max(0, stats.med - stats.medReel)), tone: "bad", sub: "à " + String(inflationAuto).replace(".", ",") + " %/an sur " + years + " ans" }),
            React.createElement(Kpi, { label: "Capital non investi →", value: fmt(stats.cashReelFinal), tone: "warn", sub: "vs " + fmt(stats.cash0) + " € aujourd'hui" })),
          React.createElement("div", { className: "h-44" },
            React.createElement(ResponsiveContainer, null,
              React.createElement(AreaChart, { data: stats.pct },
                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#334155" }),
                React.createElement(XAxis, { dataKey: "annee", tickFormatter: (v) => v.toFixed(1) + "a", stroke: "#94a3b8", fontSize: 11 }),
                React.createElement(YAxis, { tickFormatter: fmtK, stroke: "#94a3b8", fontSize: 11 }),
                React.createElement(Tooltip, { contentStyle: { background: "#0f172a", border: "1px solid #475569", borderRadius: 12 }, formatter: (v) => fmt(Number(v)), labelFormatter: (l) => "Année " + Number(l).toFixed(1) }),
                React.createElement(Area, { dataKey: "p50", stroke: "#34d399", strokeWidth: 2, fill: "none", name: "Médian nominal" }),
                React.createElement(Area, { dataKey: "p50reel", stroke: "#fb7185", strokeWidth: 2, strokeDasharray: "5 4", fill: "none", name: "En € constants" })))),
          React.createElement("p", { className: "mt-2 text-[11px] leading-snug text-slate-400" },
            "Vert = trajectoire médiane nominale · rose = la même en euros constants. Inflation utilisée : ",
            React.createElement("b", { className: "text-slate-200" }, String(inflationAuto).replace(".", ",") + " %/an"),
            " (auto : marchés 60 % + cible BCE 40 %). Sans investir, votre capital actuel de ",
            React.createElement("b", { className: "text-slate-200" }, fmt(stats.cash0) + " €"),
            " (portefeuille + capital initial) ne vaudrait que ",
            React.createElement("b", { className: "text-rose-300" }, fmt(stats.cashReelFinal) + " €"),
            " en pouvoir d'achat dans " + years + " ans. En € d'aujourd'hui, votre objectif de " + fmt(goal) + " € pèse " + fmt(goalReel) + " €."))),
          (React.createElement(Card, {"title": "March\u00e9 aujourd'hui", "icon": "\ud83c\udf0d", "className": "md:col-span-3"}, (React.createElement(MarcheToday, {"sigPct": (sigPct), "riskPosture": (riskPosture), "alerts": (alerts), "invDay": (invDay), "setInvDay": (setInvDay), "peaOpenISO": (peaOpenISO), "setPeaOpenISO": (setPeaOpenISO), "majISO": (majISO), "frDate": (frDate), "freshTone": (freshTone), "freshLabel": (freshLabel), "updateAnalysis": (updateAnalysis)}))))))
        )), (tab === "pf" && (
          (React.createElement("div", {"className": "space-y-4"}, (React.createElement("div", {"className": "grid gap-4 lg:grid-cols-2"}, (React.createElement(Card, {"title": "Mes lignes & objectif", "icon": "\ud83d\udccb", "className": "space-y-3"}, (React.createElement("div", {"className": "grid grid-cols-1 gap-2 sm:grid-cols-2"}, (React.createElement("div", null, (React.createElement("div", {"className": "mb-1 text-[11px] text-slate-400"}, "\ud83c\udfe6 Ma banque (compatibilit\u00e9 PEA)")), (React.createElement("select", {"value": (bank), "onChange": ((e) => setBank(e.target.value)), "className": "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2.5 text-sm text-slate-100"}, (Object.entries(BANKS).map(([k, b]) => (
                        (React.createElement("option", {"key": (k), "value": (k)}, (b.label)))
                      ))))), (React.createElement("p", {"className": "mt-1 text-[10px] leading-snug text-slate-500"}, (BANKS[bank].note))))), (React.createElement("div", {"className": "flex items-end"}, (React.createElement("div", {"className": "w-full"}, (React.createElement(Slider, {"label": "Objectif \u00e0 l'horizon", "value": (goal), "min": (10000), "max": (100000), "step": (1000), "onChange": (setGoal), "suffix": " \u20ac"})))))))), (React.createElement("div", {"className": ("rounded-xl border p-2.5 text-xs " +
                  (goalOk ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"))}, (goalOk
                    ? (React.createElement(React.Fragment, null, "\u2705 Objectif\u00A0", (fmt(goal)), ": versement requis \u2248\u00A0", (React.createElement("b", null, (fmt(requiredMonthly)), "/mois")), "\u00A0\u2014 votre\u00A0", (fmt(monthly2)), "\u00A0suffit.", " En\u00A0\u20ac d'aujourd'hui, l'objectif vaut\u00A0\u2248\u00A0", (React.createElement("b", null, (fmt(goalReel)))), " \u2014 l'inflation\u00A0", (String(inflationAuto.toFixed(1)).replace(".", ",")), " %/an\u00A0\u00e9rode\u00A0", (React.createElement("b", null, (fmt(erosInfl)))), " sur l'horizon."))
                    : (React.createElement(React.Fragment, null, "\u26a0\ufe0f Pour\u00A0", (fmt(goal)), ": il faudrait \u2248\u00A0", (React.createElement("b", null, (fmt(requiredMonthly)), "/mois")), "\u00A0(vs\u00A0", (fmt(monthly2)), ").", " En\u00A0\u20ac d'aujourd'hui, l'objectif vaut\u00A0\u2248\u00A0", (React.createElement("b", null, (fmt(goalReel)))), " \u2014 l'inflation\u00A0\u00e9rode\u00A0", (React.createElement("b", null, (fmt(erosInfl)))), " sur l'horizon."))))), (React.createElement("div", {"className": "space-y-2"}, (valLines.map((l) => (
                    (React.createElement("div", {"key": (l.id), "className": "space-y-2 rounded-xl border border-slate-700/40 bg-slate-800/30 p-3"}, (React.createElement("div", {"className": "flex items-center gap-2"}, (React.createElement(LinePicker, {"allKeys": (allKeys), "value": (l.nom), "onPick": ((v) => { upLine(l.id, "nom", v); const _r = resolveHolding(v); if (_r) upLine(l.id, "type", _r.type === "Mon\u00e9taire" ? "monet" : "action"); })})), (React.createElement("button", {"onClick": (() => rmLine(l.id)), "className": "shrink-0 rounded-lg px-2.5 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10"}, "\u2715")))), (React.createElement("div", {"className": "grid grid-cols-[1fr_1fr_auto] items-center gap-2"}, (React.createElement("div", {"className": "flex items-center"}, (React.createElement(Pill, {"tone": (l.type === "monet" ? "neutral" : "accent")}, (l.type === "monet" ? "\ud83d\udcb0 Oblig. / Mon\u00e9t. \u00b7 auto" : "\ud83d\udcc8 Action \u00b7 auto"))))), (React.createElement("input", {"type": "number", "value": (l.valeur === 0 ? "" : l.valeur), "onChange": ((e) => upLine(l.id, "valeur", String(e.target.value).replace(/^(-?)0+(?=\d)/, "$1"))), "title": "Valeur actuelle \u20ac", "placeholder": "Valeur \u20ac", "className": "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"})), (React.createElement("input", {"type": "text", "inputMode": "decimal", "value": (l.pv === 0 ? "" : l.pv), "onChange": ((e) => upLine(l.id, "pv", String(e.target.value).replace(/[^0-9,\-]/g, "").replace(/(?!^)-/g, "").replace(/^(-?)0+(?=\d)/, "$1"))), "title": "\u00b1 value en \u20ac (plus ou moins-value) \u2014 le % est calcul\u00e9 automatiquement", "placeholder": "\u00b1 \u20ac", "className": "w-20 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 sm:w-24 sm:px-2.5"})), (React.createElement("button", {"type": "button", "onClick": (() => upLine(l.id, "pv", String(-(Number(l.pv) || 0)))), "title": "Basculer gain / perte (+ / -)", "aria-label": "Basculer le signe de la plus ou moins-value", "className": "h-9 shrink-0 self-center rounded-md border border-slate-800 bg-slate-800/60 px-2 text-xs font-semibold text-slate-300 transition-colors hover:border-emerald-300/50 hover:text-emerald-300 active:bg-slate-800"}, "\u00b1")))), (l.valeur > 0 && (
                        (React.createElement("div", {"className": "flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500"}, (React.createElement("span", null, "Investi \u2248\u00A0", (React.createElement("b", {"className": "text-slate-400"}, (fmt(l.invested)))))), (React.createElement("span", {"className": ((l.valo >= 0 ? "text-emerald-400/90" : "text-rose-400/90"))}, (l.valo >= 0 ? "+" : ""), (String(l.valo.toFixed(1)).replace(".", ",")), "\u00A0% calcul\u00e9 auto"))))
                      )), (l.ref && (() => {
                        const compat = peaCompat(bank, l.ref.name);
                        return (
                          (React.createElement("div", {"className": "flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"}, (React.createElement(Pill, {"tone": "accent"}, "\u2713\u00A0", (l.ref.name))), (React.createElement(Pill, {"tone": "neutral"}, (l.ref.type), "\u00b7\u00A0", (l.ref.indice))), (React.createElement(Pill, {"tone": "neutral"}, (l.ref.isin))), (React.createElement(Pill, {"tone": "neutral"}, "Ticker\u00A0", (l.ref.ticker))), (l.ref.ter > 0 && (React.createElement(Pill, {"tone": "neutral"}, "TER\u00A0", (l.ref.ter), "\u00A0%"))), (PRICES[l.ref.name] && (
                              (React.createElement(Pill, {"tone": "neutral"}, "\ud83d\udcc8 Cours r\u00e9f.", (String(PRICES[l.ref.name]).replace(".", ",")), "\u00A0\u20ac \u00b7 \u2248\u00A0", (Math.max(1, Math.round(l.valeur / PRICES[l.ref.name]))), "parts"))
                            )), (DIV_YIELD[l.ref.name] > 0 && (
                              (React.createElement(Pill, {"tone": ((DIV_DIST[l.ref.name] || "cap") === "cap" ? "neutral" : "good")}, "\ud83d\udcb8\u00A0", (String(DIV_YIELD[l.ref.name]).replace(".", ",")), "\u00A0%/an\u00A0", ((DIV_DIST[l.ref.name] || "cap") === "cap" ? "(réinvesti)" : "(versé)")))
                            )), (compat === "ok" ? (
                              (React.createElement(Pill, {"tone": "good"}, "\ud83c\udfe6 \u00c9ligible PEA\u00A0", (BANKS[bank].label)))
                            ) : compat === "check" ? (
                              (React.createElement(Pill, {"tone": "warn"}, "\ud83c\udfe6 \u00c0 v\u00e9rifier dans l'app\u00A0", (BANKS[bank].label)))
                            ) : (
                              (React.createElement(Pill, {"tone": "bad"}, "\ud83c\udfe6 Non r\u00e9f\u00e9renc\u00e9 PEA\u00A0", (BANKS[bank].label), "\u2014 incompatible"))
                            )), (React.createElement("span", {"className": "w-full leading-snug text-slate-500"}, (l.ref.pays), "\u2014\u00A0", (l.ref.notes)))))
                        );
                      })())))
                  ))), (React.createElement("button", {"onClick": (addLine), "className": "rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/25 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300"}, "+ Ajouter une ligne")))), (React.createElement("div", null, (React.createElement("label", {"className": "mb-1 block text-[11px] text-slate-400"}, "\ud83d\udcf7 Photo du portefeuille (locale, session)")), (React.createElement("input", {"type": "file", "accept": "image/*", "onChange": (onPhoto), "className": "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-emerald-400 file:px-2 file:py-1 file:text-slate-950"})), (photo ? (
                    (React.createElement("div", {"className": "mt-2"}, (React.createElement("img", {"src": (photo), "alt": "Mon portefeuille", "className": "max-h-44 w-full rounded-xl border border-slate-700 object-contain"})), (React.createElement("button", {"onClick": (() => setPhoto(null)), "className": "mt-1 text-[11px] text-rose-400 hover:underline"}, "Supprimer"))))
                  ) : (
                    (React.createElement("div", {"className": "mt-2 flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-slate-700 text-[11px] text-slate-500"}, "Capture Fortuneo pour r\u00e9f\u00e9rence"))
                  )))))), (React.createElement(Card, {"title": "Diagnostic du portefeuille", "icon": "\ud83e\ude8a"}, (React.createElement(DiagPf, {"analysis": (analysis), "riskPosture": (riskPosture), "fraisModel": (fraisModel), "divModel": (divModel), "expoModel": (expoModel)}))))))))
        )), (tab === "reco" && (
          (React.createElement("div", {"className": "grid gap-4 md:grid-cols-2 lg:grid-cols-3"}, (React.createElement(Card, {"title": "Votre versement de ce mois-ci", "icon": "\ud83e\uddfe", "className": "md:col-span-2 lg:col-span-3"}, (React.createElement("div", {"className": "rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-2"}, (React.createElement("span", {"className": "text-xs text-slate-300"}, "Prochain versement : ", (React.createElement("b", {"className": "text-slate-100"}, (nextInv.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))))), (React.createElement("span", {"className": "text-2xl font-bold tabular-nums tracking-tight text-emerald-200"}, (fmt(monthly2))))), (React.createElement("div", {"className": "mt-2 flex flex-wrap gap-1.5"}, (React.createElement(Pill, {"tone": (splitPlan.reachable ? "good" : "warn")}, (splitPlan.reachable ? "✓ objectif tenable" : "⚠️ objectif hors portée"))), (React.createElement(Pill, {"tone": (veille.tone)}, "🛰️ Analystes : ", (veille.label))), (analysis.total > 0 && analysis.eqPct > splitPlan.targetEq + band && (React.createElement(Pill, {"tone": "warn"}, "📉 Surexposition ", (analysis.eqPct.toFixed(0)), " % → DCA en sécuritaire"))))))))), (React.createElement(PourquoiStrip, {"analysis": (analysis), "splitPlan": (splitPlan), "band": (band), "sigPct": (sigPct), "profile": (profile), "majAge": (majAge), "tiltW": (tiltW), "tiltPts": (tiltPts), "tiltOn": (tactical)})), (React.createElement("div", {"className": "mt-3 grid gap-3 sm:grid-cols-3"}, (React.createElement("div", {"className": "rounded-xl border border-slate-700/40 bg-slate-800/30 p-3"}, (React.createElement("div", {"className": "text-[11px] text-slate-400"}, "Expo cible du mois")), (React.createElement("div", {"className": "text-xl font-bold tracking-tight text-emerald-300"}, (splitPlan.targetEq.toFixed(0)), "\u00A0% actions")), (React.createElement("div", {"className": "mt-1 text-[10px] leading-snug text-slate-500"}, "Profil\u00A0", (profile), ":\u00A0", (splitPlan.targetProfile.toFixed(0)), "\u00A0%\u00A0", (!splitPlan.reachable && (React.createElement(React.Fragment, null, "\u00b7 objectif \u21d2\u00A0", (splitPlan.eqNeeded.toFixed(0)), "\u00A0% (plafonn\u00e9 \u00e0\u00A0", (splitPlan.capEq.toFixed(0)), "\u00A0%)"))))))), (React.createElement("div", {"className": "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"}, (React.createElement("div", {"className": "text-[11px] text-slate-400"}, "\u2192 Poche actions")), (React.createElement("div", {"className": "text-xl font-bold tracking-tight text-emerald-300"}, (fmt(splitPlan.dEqExec)))), (React.createElement("div", {"className": "mt-1 text-[10px] text-slate-500"}, (Math.round((splitPlan.dEqExec / Math.max(1, monthly2)) * 100)), "\u00A0% du versement")))), (React.createElement("div", {"className": "rounded-xl border border-sky-500/30 bg-sky-500/5 p-3"}, (React.createElement("div", {"className": "text-[11px] text-slate-400"}, "\u2192 Poche s\u00e9curitaire")), (React.createElement("div", {"className": "text-xl font-bold tracking-tight text-sky-300"}, (fmt(splitPlan.dBdTot)))), (React.createElement("div", {"className": "mt-1 text-[10px] text-slate-500"}, (Math.round((splitPlan.dBdTot / Math.max(1, monthly2)) * 100)), "\u00A0% du versement")))))), (analysis.total > 0 ? (
                (React.createElement("div", {"className": "mt-3 grid gap-2 sm:grid-cols-2"}, (splitPlan.eqSplit.map((s, i) => (
                    (React.createElement("div", {"key": ("e" + i), "className": "rounded-lg bg-slate-800/40 p-3 text-xs"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-1.5"}, (React.createElement(Pill, {"tone": "accent"}, "\ud83d\udcc8 Actions")), (React.createElement("span", {"className": "font-mono text-sm font-bold text-slate-50"}, (fmt(s.montant)), (s.parts != null && (React.createElement("span", {"className": "ml-1 rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300"}, (s.parts > 0 ? "· " + s.parts + " part" + (s.parts > 1 ? "s" : "") + (s.report > 0 ? " · report " + Math.round(s.report) + " €" : "") : "· report" + (s.report > 0 ? " " + Math.round(s.report) + " €" : ""))))))))), (React.createElement("p", {"className": "mt-1.5 leading-snug text-slate-200 break-words"}, (s.nom), (React.createElement("span", {"className": "text-slate-500"}, "(", (s.weight.toFixed(0)), "\u00A0% du pf)")))), (React.createElement("p", {"className": "mt-0.5 leading-snug text-slate-500"}, (s.note), (s.compat === "check" ? " · éligibilité PEA à vérifier" : "")))))
                  ))), (splitPlan.eqSplit.length === 0 && (
                    (React.createElement("div", {"className": "rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200"}, "Aucune ligne action : lancez le \u00ab Top 3 \u00e0 investir \u00bb ci-dessous pour choisir vos supports, puis revenez ici."))
                  )), (splitPlan.bdSplit.map((s, i) => (
                    (React.createElement("div", {"key": ("b" + i), "className": "rounded-lg bg-slate-800/40 p-3 text-xs"}, (React.createElement("div", {"className": "flex flex-wrap items-center justify-between gap-1.5"}, (React.createElement(Pill, {"tone": "neutral"}, "\ud83d\udcb0 S\u00e9curitaire")), (s.montant > 0 && (React.createElement("span", {"className": "font-mono text-sm font-bold text-slate-50"}, (fmt(s.montant))))))), (React.createElement("p", {"className": "mt-1.5 leading-snug text-slate-200 break-words"}, (s.nom), (React.createElement("span", {"className": "text-slate-500"}, "(", (s.weight.toFixed(0)), "\u00A0% du pf)")))), (s.montant === 0 && (React.createElement("p", {"className": "mt-0.5 leading-snug text-slate-500"}, (splitPlan.bdSplit.length > 1 ? "à répartir au prorata" : splitPlan.dBd > 0 ? "→ " + fmt(splitPlan.dBd) : ""))))))
                  ))), (splitPlan.bdSplit.length === 0 && splitPlan.dBd > 0 && (
                    (React.createElement("div", {"className": "rounded-lg border border-sky-500/40 bg-sky-500/10 p-2.5 text-xs text-sky-200"}, (fmt(splitPlan.dBd)), "\u00A0\u00e0 loger en poche s\u00e9curitaire : ajoutez votre fonds mon\u00e9taire \u20ac (ex. CT \u20ac) ou laissez en esp\u00e8ces chez votre courtier."))
                  ))))
              ) : (
                (React.createElement("p", {"className": "mt-3 text-[11px] leading-relaxed text-slate-400"}, "Ajoutez vos lignes en cours (onglet Portefeuille) pour recevoir la r\u00e9partition ligne par ligne. Sans lignes, la strat\u00e9gie du mois reste :\u00A0", (fmt(splitPlan.dEq)), "\u00A0actions /", (fmt(splitPlan.dBd)), "\u00A0s\u00e9curitaire vers l'expo cible\u00A0", (splitPlan.targetEq.toFixed(0)), "\u00A0%."))
              )), (React.createElement("p", {"className": "mt-2 text-[10px] leading-relaxed text-slate-500"}, "Expo cible = max(cible du profil au glide path\u00A0", (!splitPlan.reachable ? ", expo requise par l'objectif" : ""), "), plafonn\u00e9e \u00e0 profil + 15 pts. Montants convertis en parts entières au cours de référence (arrondi à la part inférieure) — le reliquat de chaque ligne (report) est logé sur le monétaire € en attendant, puis réinjecté sur la même ligne les mois suivants. Ordres \u00e0 cours limit\u00e9, id\u00e9alement le jour d'investissement choisi.")))), (React.createElement(Card, {"title": ("Réponse PEA " + BANKS[bank].label + " du mois"), "icon": "\ud83d\udca1"}, (React.createElement("div", {"className": "space-y-2 text-[13px] leading-relaxed"}, (peaAnswer.map((p, i) => (
                  (React.createElement("p", {"key": (i), "className": ("break-words rounded-xl p-2.5 " +
                    (i === 1 ? "border border-emerald-400/30 bg-emerald-400/10 font-semibold text-emerald-50" : "bg-slate-800/40 text-slate-300"))}, (p)))
                ))))))), (React.createElement(Card, {"title": "Top 3 \u00e0 investir (vs objectif)", "icon": "\ud83c\udfc6"}, (React.createElement("button", {"onClick": (computeTop3), "className": "mb-3 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-105"}, "\u26a1 Analyser & proposer mon Top 3")), (top3 ? (
                (React.createElement("div", {"className": "space-y-2"}, (top3.map((c) => (
                    (React.createElement("div", {"key": (c.nom), "className": "rounded-xl border border-slate-700/40 bg-slate-800/30 p-2.5"}, (React.createElement("div", {"className": "flex items-start justify-between gap-1.5"}, (React.createElement("span", {"className": "text-xs font-bold leading-tight text-slate-100"}, (c.label), (c.nom))), (React.createElement("span", {"className": "shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300"}, (fmt(c.montant)))))), (React.createElement("p", {"className": "mt-1 text-xs leading-snug text-slate-400"}, (c.why))), (React.createElement("p", {"className": "mt-1.5 flex flex-wrap items-center gap-1.5 break-words"}, (React.createElement("span", {"className": "rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300"}, "ISIN :\u00A0", (c.isin))), (React.createElement("span", {"className": "rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300"}, (c.ticker))), (c.compat === "ok" ? (
                          (React.createElement(Pill, {"tone": "good"}, "\ud83c\udfe6 \u00c9ligible PEA\u00A0", (BANKS[bank].label)))
                        ) : (
                          (React.createElement(Pill, {"tone": "warn"}, "\ud83c\udfe6 \u00c0 v\u00e9rifier dans l'app\u00A0", (BANKS[bank].label)))
                        )))), (React.createElement("p", {"className": "mt-0.5 text-[11px] text-slate-500"}, "Hyp.", (c.mu), "%/an \u00b7 vol\u00A0", (c.vol), "% \u00b7 score\u00A0", (c.score), "/100"))))
                  )))))
              ) : (
                (React.createElement("p", {"className": "text-[11px] leading-relaxed text-slate-400"}, "Croise votre \u00e9cart \u00e0 l'objectif, l'allocation r\u00e9elle de vos lignes, votre profil et les doublons \u2014 pour proposer 3 supports \u00e9ligibles PEA avec la r\u00e9partition du versement."))
              )), (React.createElement("p", {"className": "mt-2 text-[10px] text-slate-500"}, "\u26a0\ufe0f P\u00e9dagogique \u2014 pas un conseil en investissement personnalis\u00e9.")))), (React.createElement(Card, {"title": "Plan DCA \u2014 12 prochains mois", "icon": "\ud83d\udcc5", "className": "md:col-span-2 lg:col-span-1"}, (React.createElement("table", {"className": "w-full text-[11px] sm:text-xs"}, (React.createElement("thead", null, (React.createElement("tr", {"className": "text-left text-slate-400"}, (React.createElement("th", {"className": "py-1 whitespace-nowrap"}, "Mois")), (React.createElement("th", {"className": "py-1 text-right whitespace-nowrap"}, "Actions")), (React.createElement("th", {"className": "py-1 text-right whitespace-nowrap"}, "Mon\u00e9t.")), (React.createElement("th", {"className": "py-1 text-right whitespace-nowrap"}, "% actions")))))), (React.createElement("tbody", null, (dcaPlan.map((r, i) => (
                    (React.createElement("tr", {"key": (i), "className": ("border-t border-slate-700/40 " + (i === 0 ? "font-bold text-emerald-300" : "text-slate-300"))}, (React.createElement("td", {"className": "py-1 whitespace-nowrap"}, (r.date))), (React.createElement("td", {"className": "py-1 text-right whitespace-nowrap"}, (fmt(r.actions)))), (React.createElement("td", {"className": "py-1 text-right whitespace-nowrap"}, (fmt(r.oblig)))), (React.createElement("td", {"className": "py-1 text-right whitespace-nowrap"}, (r.eqPct), "%\u00A0", (React.createElement("span", {"className": "hidden text-slate-500 sm:inline"}, "(", (r.target), "%)"))))))
                  ))))))), (React.createElement("p", {"className": "mt-2 text-[10px] text-slate-500"}, "Versement orient\u00e9 vers la poche sous-pond\u00e9r\u00e9e : le DCA rattrape l'allocation sans vendre."))))))
        )), (tab === "veille" && (
          (React.createElement(VeilleTab, { "agent": (veille), "profile": (profile), "monthly2": (monthly2), "splitPlan": (splitPlan), "fmt": (fmt), "onUpdate": (updateVeille), "busy": (veilleBusy) }))
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