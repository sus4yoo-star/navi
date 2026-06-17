// app/api/channel/route.ts
//
// 빠른 1단계: YouTube API만으로 채널 + 최근 10개(쇼츠/롱폼·조회·날짜·썸네일) 즉시 반환.
// 무거운 정찰·진단·기획은 /api/brief(통합 브리핑 엔진)가 2단계로 맡는다(체감 속도).
//
// POST /api/channel { channelUrl } → { channel, videos }

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const YT_KEY = process.env.YOUTUBE_API_KEY;

function parseChannel(url: string) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return `forHandle=${encodeURIComponent(p[0])}`;
    if (p[0] === "channel") return `id=${p[1]}`;
    return null;
  } catch {
    return null;
  }
}

function isoToSec(d: string) {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

async function resolveChannel(url: string) {
  if (!YT_KEY) return null;
  const q = parseChannel(url);
  if (!q) return null;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&${q}&key=${YT_KEY}`
  );
  const j = await r.json();
  const c = j.items?.[0];
  if (!c) return null;
  return {
    name: c.snippet.title as string,
    subscribers: Number(c.statistics.subscriberCount ?? 0),
    videoCount: Number(c.statistics.videoCount ?? 0),
    uploads: c.contentDetails.relatedPlaylists.uploads as string,
  };
}

async function getRecent(uploadsId: string, max = 10, pageToken?: string) {
  const pl = await (
    await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${max}&playlistId=${uploadsId}${
        pageToken ? `&pageToken=${pageToken}` : ""
      }&key=${YT_KEY}`
    )
  ).json();
  const nextPageToken = (pl.nextPageToken as string) || null;
  const ids = (pl.items || []).map((i: any) => i.contentDetails.videoId).join(",");
  if (!ids) return { videos: [], nextPageToken };
  const v = await (
    await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT_KEY}`
    )
  ).json();
  const videos = (v.items || []).map((x: any) => {
    const sec = isoToSec(x.contentDetails?.duration || "");
    const isShort =
      (sec > 0 && sec <= 60) || /#shorts/i.test(x.snippet.title + (x.snippet.description || ""));
    const th = x.snippet.thumbnails || {};
    return {
      id: x.id as string,
      title: x.snippet.title as string,
      views: Number(x.statistics?.viewCount ?? 0),
      date: (x.snippet.publishedAt as string)?.slice(0, 10),
      durationSec: sec,
      format: isShort ? "쇼츠" : "롱폼",
      thumb: (th.medium || th.high || th.default)?.url || "",
    };
  });
  return { videos, nextPageToken };
}

export async function POST(req: NextRequest) {
  const { channelUrl, pageToken } = await req.json();
  if (!channelUrl) {
    return NextResponse.json({ error: "채널 URL을 확인해 주세요." }, { status: 400 });
  }
  const ch = await resolveChannel(channelUrl);
  if (!ch) {
    return NextResponse.json(
      { error: "채널을 찾지 못했어요. @핸들 또는 /channel/ 형식 URL인지 확인해 주세요." },
      { status: 404 }
    );
  }
  const { videos, nextPageToken } = await getRecent(ch.uploads, 10, pageToken);
  return NextResponse.json({
    channel: { name: ch.name, subscribers: ch.subscribers, videoCount: ch.videoCount },
    videos,
    nextPageToken,
  });
}
