import fs from "fs";

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = "UCjbEAhCd_8bEEbPbs4kJPEA";

if (!API_KEY) {
  console.error("Falta YT_API_KEY (GitHub Secret).");
  process.exit(1);
}

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TAXONOMY = [
  {
    category: "0DTE / SPX",
    keywords: ["0dte", "spx 0dte", "spx", "intradia", "same day expiration", "expiracion hoy", "hoy vence", "vencimiento hoy"],
    tags: ["0dte", "spx"]
  },
  {
    category: "Dealers & Microestructura",
    keywords: ["dealer", "dealers", "market maker", "gamma exposure", "gex", "net gamma", "vanna", "charm", "vomma", "volga", "skew", "term structure", "pinning", "order flow", "flow"],
    tags: ["dealers", "gex", "vanna", "charm", "vomma", "skew"]
  },
  {
    category: "Griegos (Básicos)",
    keywords: ["griegos", "delta", "gamma", "theta", "vega", "rho"],
    tags: ["delta", "gamma", "theta", "vega"]
  },
  {
    category: "Volatilidad",
    keywords: ["volatilidad", "iv", "implied volatility", "iv rank", "iv percentile", "volatility crush", "crush", "skew", "sonrisa", "smile", "term structure"],
    tags: ["iv", "iv rank", "skew"]
  },
  {
    category: "Estrategias de Ingreso",
    keywords: ["wheel", "ciclo de la rueda", "covered call", "cash secured put", "csp", "venta de puts", "venta de calls", "ingresos", "renta", "premium", "prima"],
    tags: ["wheel", "covered call", "csp", "venta de prima"]
  },
  {
    category: "Spreads Direccionales",
    keywords: ["credit spread", "debit spread", "bull put", "bear call", "call spread", "put spread", "vertical", "spread vertical"],
    tags: ["credit spread", "debit spread", "vertical"]
  },
  {
    category: "Estrategias Neutrales",
    keywords: ["iron condor", "condor", "iron butterfly", "butterfly", "broken wing", "bwb", "strangle", "straddle", "calendar", "diagonal"],
    tags: ["iron condor", "iron fly", "butterfly", "strangle", "straddle", "calendar"]
  },
  {
    category: "Gestión de Riesgo & Psicología",
    keywords: ["riesgo", "risk", "position sizing", "tamaño de posicion", "stop", "disciplina", "psicologia", "emociones", "drawdown", "gestion", "kelly"],
    tags: ["risk", "position sizing", "psicologia", "disciplina"]
  },
  {
    category: "Análisis de Mercado / Macro",
    keywords: ["cpi", "inflacion", "fed", "fomc", "tasas", "bonos", "10 anos", "10 years", "dxy", "macro", "noticias", "market outlook", "pre market", "premarket"],
    tags: ["macro", "fed", "cpi"]
  },
  {
    category: "Herramientas & Plataformas",
    keywords: ["thinkorswim", "tos", "tradestation", "interactive brokers", "ibkr", "sigma trade", "optionar", "greeks insight", "plataforma", "tutorial"],
    tags: ["herramientas", "tutorial", "plataforma"]
  },
  {
    category: "Fundamentos de Opciones",
    keywords: ["que es", "qué es", "introduccion", "desde cero", "principiantes", "call", "put", "strike", "vencimiento", "opciones", "contrato", "prima"],
    tags: ["fundamentos", "call", "put"]
  }
];

function pickCategory(text) {
  const t = normalize(text);

  let best = { category: "General", score: 0, tags: [] };

  for (const rule of TAXONOMY) {
    let score = 0;

    for (const kw of rule.keywords) {
      const k = normalize(kw);
      if (!k) continue;

      // "includes" simple, pero con peso por longitud
      if (t.includes(k)) score += (k.length >= 10 ? 3 : 2);
    }

    if (score > best.score) {
      best = { category: rule.category, score, tags: rule.tags };
    }
  }

  return best;
}

function classifyDifficulty(text) {
  const t = normalize(text);

  const advanced = [
    "gamma exposure","gex","vanna","charm","vomma","volga","term structure","skew",
    "dealer","market maker","0dte","pinning","net gamma","flow","order flow"
  ];
  if (advanced.some(k => t.includes(normalize(k)))) return "advanced";

  const intermediate = [
    "spread","credit spread","debit spread","iron condor","iron butterfly","butterfly",
    "covered call","cash secured put","wheel","iv rank","iv percentile","calendar","diagonal",
    "strangle","straddle","bwb","broken wing"
  ];
  if (intermediate.some(k => t.includes(normalize(k)))) return "intermediate";

  const basic = ["que es","qué es","introduccion","desde cero","principiantes","call","put","opciones","contrato","strike","vencimiento"];
  if (basic.some(k => t.includes(normalize(k)))) return "basic";

  // fallback
  return "intermediate";
}

function buildTags(categoryTags, text) {
  const t = normalize(text);
  const tags = new Set();

  (categoryTags || []).forEach(x => tags.add(x));

  const extra = [
    "spx","0dte","gex","vanna","charm","vomma","volga",
    "delta","gamma","theta","vega",
    "wheel","covered call","csp","cash secured put",
    "iron condor","iron butterfly","iron fly","butterfly","bwb",
    "credit spread","debit spread","vertical",
    "iv","iv rank","iv percentile","skew",
    "earnings","fed","fomc","cpi"
  ];

  for (const k of extra) {
    if (t.includes(normalize(k))) tags.add(k);
  }

  return Array.from(tags).slice(0, 8);
}

async function ytGet(url) {
  const res = await fetch(url);
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt}`);
  return JSON.parse(txt);
}

async function getUploadsPlaylistId() {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
  const data = await ytGet(url);
  const item = data.items?.[0];
  if (!item) throw new Error("No encontré el canal. Revisa CHANNEL_ID.");
  return item.contentDetails.relatedPlaylists.uploads;
}

async function getAllPlaylistItems(playlistId) {
  let out = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}` +
      `&key=${API_KEY}` +
      (pageToken ? `&pageToken=${pageToken}` : "");

    const data = await ytGet(url);

    for (const it of (data.items || [])) {
      const sn = it.snippet;
      const vid = sn?.resourceId?.videoId;
      if (!vid) continue;
      if (sn.title === "Private video" || sn.title === "Deleted video") continue;

      out.push({
        videoId: vid,
        title: sn.title,
        description: sn.description || "",
        publishedAt: sn.publishedAt,
        thumbnails: sn.thumbnails || {}
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}

async function main() {
  const uploads = await getUploadsPlaylistId();
  const videos = await getAllPlaylistItems(uploads);

  if (!videos.length) {
    throw new Error("CERO videos encontrados (API devolvió 0).");
  }

  const enriched = videos.map(v => {
    const text = `${v.title} ${v.description}`;
    const picked = pickCategory(text);

    const category = picked.category;
    const difficulty = classifyDifficulty(text);
    const tags = buildTags(picked.tags, text);

    return {
      ...v,
      category,
      difficulty,
      tags,
      metrics: {},
      scores: {}
    };
  });

  const min = enriched.map(v => ({
    videoId: v.videoId,
    title: v.title,
    publishedAt: v.publishedAt,
    thumbnails: { medium: v.thumbnails?.medium },
    category: v.category,
    difficulty: v.difficulty,
    tags: v.tags
  }));

  fs.writeFileSync("videos.json", JSON.stringify(enriched, null, 2), "utf-8");
  fs.writeFileSync("videos.min.json", JSON.stringify(min), "utf-8");

  console.log(`OK: ${enriched.length} videos (full + min)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
