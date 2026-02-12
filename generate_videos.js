import fs from "fs";

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = "UCjbEAhCd_8bEEbPbs4kJPEA";

if (!API_KEY) {
  console.error("Falta YT_API_KEY (GitHub Secret).");
  process.exit(1);
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

function classifyDifficulty(text) {
  const t = (text || "").toLowerCase();

  const adv = ["gamma exposure", "gex", "vanna", "charm", "vomma", "volga", "0dte", "dealer", "market maker"];
  if (adv.some(k => t.includes(k))) return "advanced";

  const mid = ["spread", "iron condor", "iron butterfly", "covered call", "cash secured put", "wheel", "iv rank", "iv percentile"];
  if (mid.some(k => t.includes(k))) return "intermediate";

  const bas = ["qué es", "que es", "introducción", "desde cero", "principiantes", "call", "put", "opciones"];
  if (bas.some(k => t.includes(k))) return "basic";

  return "intermediate";
}

function scorePlaceholder() {
  return { rating: 0 };
}

async function main() {
  const uploads = await getUploadsPlaylistId();
  const videos = await getAllPlaylistItems(uploads);

  if (!videos.length) {
    throw new Error("CERO videos encontrados (API devolvió 0).");
  }

  const enriched = videos.map(v => ({
    ...v,
    category: "General",
    difficulty: classifyDifficulty(`${v.title} ${v.description}`),
    tags: [],
    metrics: {},
    scores: scorePlaceholder()
  }));

  const min = enriched.map(v => ({
    videoId: v.videoId,
    title: v.title,
    publishedAt: v.publishedAt,
    thumbnails: { medium: v.thumbnails?.medium },
    category: v.category,
    difficulty: v.difficulty,
    tags: v.tags,
    scores: v.scores
  }));

  fs.writeFileSync("videos.json", JSON.stringify(enriched, null, 2), "utf-8");
  fs.writeFileSync("videos.min.json", JSON.stringify(min), "utf-8");

  console.log(`OK: ${enriched.length} videos (full + min)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
