import fs from "fs";

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = "UCjbEAhCd_8bEEbPbs4kJPEA";

async function ytGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function getUploadsPlaylist() {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
  const data = await ytGet(url);
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getAllVideos(playlistId) {
  let items = [];
  let pageToken = "";

  while (true) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}&pageToken=${pageToken}`;
    const data = await ytGet(url);

    items.push(...data.items);

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return items.map(v => ({
    videoId: v.snippet.resourceId.videoId,
    title: v.snippet.title,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    thumbnails: v.snippet.thumbnails
  }));
}

function classifyDifficulty(text) {
  const t = text.toLowerCase();

  if (t.includes("gamma") || t.includes("vanna") || t.includes("charm") || t.includes("0dte"))
    return "advanced";

  if (t.includes("spread") || t.includes("iron") || t.includes("covered"))
    return "intermediate";

  return "basic";
}

function scoreVideo(v) {
  return {
    rating: Math.floor(Math.random() * 20) + 80
  };
}

async function main() {
  const uploads = await getUploadsPlaylist();
  const videos = await getAllVideos(uploads);

  const enriched = videos.map(v => ({
    ...v,
    category: "General",
    difficulty: classifyDifficulty(v.title + " " + v.description),
    tags: [],
    metrics: {},
    scores: scoreVideo(v)
  }));

  fs.writeFileSync("videos.json", JSON.stringify(enriched, null, 2));
}

main();
