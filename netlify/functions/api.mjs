// 연수 안내 홈페이지 API (Netlify Functions v2 + Netlify Blobs)
// 모든 요청은 /api/* 로 들어옵니다.
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";

export const config = { path: "/api/*" };

const getS = () => getStore({ name: "training-site", consistency: "strong" });
const sha = (s) => createHash("sha256").update(String(s)).digest();
const same = (a, b) => timingSafeEqual(sha(a), sha(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const id8 = () => randomUUID().replace(/-/g, "").slice(0, 10);
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const bad = (error = "bad_request") => json({ error }, 400);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}
function cleanUrl(v) {
  const t = clip(v, 1000);
  if (!/^https?:\/\//i.test(t)) return "";
  try { return new URL(t).href; } catch { return ""; }
}
const validVoter = (v) => (typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null);

const SITE_KEYS = { eyebrow: 40, title: 80, subtitle: 200, date: 80, place: 80, instructor: 60, intro: 600, schedule: 1500, footer: 200 };
const IMG_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function defaults() {
  return {
    v: 0,
    site: {
      eyebrow: "교원 연수",
      title: "교사 연수 안내",
      subtitle: "연수 중에 필요한 자료와 링크를 이곳에서 확인하세요.",
      date: "", place: "", instructor: "", intro: "", schedule: "", footer: "",
    },
    live: { entryPollId: null, livePollId: null, liveAt: 0, timerEnd: null, timerLabel: "" },
    posts: [], pins: [], polls: [],
  };
}
async function loadState(s) {
  const st = await s.get("state", { type: "json" });
  const d = defaults();
  if (!st) return d;
  return { ...d, ...st, site: { ...d.site, ...st.site }, live: { ...d.live, ...st.live } };
}
async function saveState(s, st) {
  st.v = (st.v || 0) + 1;
  await s.setJSON("state", st);
}
async function loadQA(s, limit = 100) {
  const { blobs } = await s.list({ prefix: "qa/" });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const items = await Promise.all(keys.map(async (k) => {
    const v = await s.get(k, { type: "json" });
    return v ? { id: k.slice(3), text: v.text, ts: v.ts, voter: v.voter } : null;
  }));
  return items.filter(Boolean);
}
async function tally(s, poll) {
  const { blobs } = await s.list({ prefix: `votes/${poll.id}/` });
  const counts = poll.opts.map(() => 0);
  let n = 0;
  await Promise.all(blobs.map(async (b) => {
    const v = await s.get(b.key, { type: "json" });
    if (v && Array.isArray(v.c)) { n++; v.c.forEach((i) => { if (counts[i] != null) counts[i]++; }); }
  }));
  return { counts, n };
}

/* ---------- 공개 API ---------- */
async function publicState(req) {
  const s = getS();
  const voter = validVoter(new URL(req.url).searchParams.get("voter"));
  const [st, qa] = await Promise.all([loadState(s), loadQA(s)]);
  const posts = st.posts.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
  return json({
    now: Date.now(), v: st.v, site: st.site, live: st.live, pins: st.pins, posts,
    polls: st.polls.map((p) => ({ id: p.id, q: p.q, opts: p.opts, multi: !!p.multi, open: p.open !== false, shared: p.shared || null })),
    qa: qa.map((x) => ({ id: x.id, text: x.text, ts: x.ts, mine: !!voter && x.voter === voter })),
  });
}
async function image(id) {
  if (!/^[a-z0-9]{4,40}$/.test(id)) return new Response("not found", { status: 404 });
  const r = await getS().getWithMetadata(`img/${id}`, { type: "arrayBuffer" });
  if (!r) return new Response("not found", { status: 404 });
  const type = IMG_TYPES.includes(r.metadata?.type) ? r.metadata.type : "image/jpeg";
  return new Response(r.data, { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
async function vote(req) {
  const b = await readJson(req);
  const voter = validVoter(b.voterId);
  if (!voter) return bad();
  const s = getS();
  const st = await loadState(s);
  const poll = st.polls.find((p) => p.id === b.pollId);
  if (!poll) return bad("no_poll");
  if (poll.open === false) return bad("closed");
  const c = Array.isArray(b.choices) ? [...new Set(b.choices.map(Number))] : [];
  if (!c.length || c.some((i) => !Number.isInteger(i) || i < 0 || i >= poll.opts.length)) return bad();
  if (!poll.multi && c.length !== 1) return bad();
  await s.setJSON(`votes/${poll.id}/${voter}`, { c: c.sort((x, y) => x - y), t: Date.now() });
  return json({ ok: true });
}
async function ask(req) {
  const b = await readJson(req);
  const voter = validVoter(b.voterId);
  const text = clip(b.text, 300);
  if (!voter || !text) return bad();
  const s = getS();
  const rl = await s.get(`rl/${voter}`, { type: "json" });
  if (rl && Date.now() - rl.t < 5000) return json({ error: "slow_down" }, 429);
  await s.setJSON(`rl/${voter}`, { t: Date.now() });
  await s.setJSON(`qa/${String(Date.now()).padStart(13, "0")}-${id8().slice(0, 6)}`, { text, ts: Date.now(), voter });
  return json({ ok: true });
}
async function askDelete(req) {
  const b = await readJson(req);
  const voter = validVoter(b.voterId);
  const id = String(b.id || "");
  if (!voter || !/^\d{13}-[a-f0-9]+$/.test(id)) return bad();
  const s = getS();
  const v = await s.get(`qa/${id}`, { type: "json" });
  if (v && v.voter === voter) await s.delete(`qa/${id}`);
  return json({ ok: true });
}

/* ---------- 관리자 API ---------- */
async function guard(req) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return json({ error: "no_password" }, 503);
  if (!same(req.headers.get("x-admin-password") || "", pw)) {
    await sleep(600);
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}
async function adminSnapshot(s) {
  const st = await loadState(s);
  const qa = await loadQA(s, 200);
  const results = {};
  await Promise.all(st.polls.map(async (p) => { results[p.id] = await tally(s, p); }));
  return { now: Date.now(), state: st, qa: qa.map(({ id, text, ts }) => ({ id, text, ts })), results };
}
async function upload(req) {
  const denied = await guard(req);
  if (denied) return denied;
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!IMG_TYPES.includes(type)) return bad("bad_type");
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 4500000) return bad("too_large");
  const id = id8();
  await getS().set(`img/${id}`, buf, { metadata: { type } });
  return json({ id });
}
async function admin(req) {
  const denied = await guard(req);
  if (denied) return denied;
  const b = await readJson(req);
  const s = getS();
  const a = b.action;
  if (a === "load") return json(await adminSnapshot(s));

  const st = await loadState(s);
  switch (a) {
    case "saveSite":
      for (const [k, n] of Object.entries(SITE_KEYS)) st.site[k] = clip(b.site?.[k], n);
      if (!st.site.title) st.site.title = "교사 연수 안내";
      break;

    case "addPost": {
      if (st.posts.length >= 200) return bad("too_many");
      const type = ["text", "link", "copy", "image", "qr"].includes(b.type) ? b.type : null;
      if (!type) return bad();
      const post = { id: id8(), type, title: clip(b.title, 120), body: clip(b.body, 4000), url: "", qr: false, asset: null, pinned: !!b.pinned, createdAt: Date.now() };
      if (type === "link" || type === "qr") {
        post.url = cleanUrl(b.url);
        if (!post.url) return bad("bad_url");
        if (!post.title) post.title = type === "qr" ? "QR 코드" : post.url;
        post.qr = type === "link" && !!b.qr;
        if (type === "qr") post.body = "";
      }
      if (type === "copy" && !post.body) return bad();
      if (type === "text" && !post.body && !post.title) return bad();
      if (type === "image") {
        if (!/^[a-z0-9]{4,40}$/.test(String(b.asset || ""))) return bad();
        post.asset = b.asset;
      }
      st.posts.push(post);
      break;
    }
    case "pinPost": {
      const p = st.posts.find((x) => x.id === b.id);
      if (!p) return bad("no_post");
      p.pinned = !!b.pinned;
      break;
    }
    case "deletePost": {
      const p = st.posts.find((x) => x.id === b.id);
      st.posts = st.posts.filter((x) => x.id !== b.id);
      if (p && p.asset) await s.delete(`img/${p.asset}`);
      break;
    }
    case "addPin": {
      const label = clip(b.label, 60), value = clip(b.value, 500);
      if (!label || !value || st.pins.length >= 50) return bad();
      st.pins.push({ id: id8(), label, value, createdAt: Date.now() });
      break;
    }
    case "deletePin":
      st.pins = st.pins.filter((x) => x.id !== b.id);
      break;

    case "addPoll": {
      const q = clip(b.q, 200);
      const opts = (Array.isArray(b.opts) ? b.opts : []).map((o) => clip(o, 100)).filter(Boolean);
      if (!q || opts.length < 2 || opts.length > 10 || st.polls.length >= 30) return bad();
      st.polls.push({ id: id8(), q, opts, multi: !!b.multi, open: true, shared: null, createdAt: Date.now() });
      break;
    }
    case "deletePoll": {
      st.polls = st.polls.filter((p) => p.id !== b.id);
      if (st.live.entryPollId === b.id) st.live.entryPollId = null;
      if (st.live.livePollId === b.id) st.live.livePollId = null;
      const { blobs } = await s.list({ prefix: `votes/${String(b.id).replace(/[^a-z0-9]/g, "")}/` });
      await Promise.all(blobs.map((x) => s.delete(x.key)));
      break;
    }
    case "setOpen": {
      const p = st.polls.find((x) => x.id === b.id);
      if (!p) return bad("no_poll");
      p.open = !!b.open;
      break;
    }
    case "setShared": {
      const p = st.polls.find((x) => x.id === b.id);
      if (!p) return bad("no_poll");
      p.shared = b.on ? await tally(s, p) : null;
      break;
    }
    case "setEntry":
      if (b.id && !st.polls.some((p) => p.id === b.id)) return bad("no_poll");
      st.live.entryPollId = b.id || null;
      break;
    case "setLive":
      if (b.id && !st.polls.some((p) => p.id === b.id)) return bad("no_poll");
      st.live.livePollId = b.id || null;
      st.live.liveAt = Date.now();
      break;

    case "startTimer": {
      const m = Math.max(1, Math.min(180, Math.round(Number(b.minutes)) || 10));
      st.live.timerEnd = Date.now() + m * 60000;
      st.live.timerLabel = clip(b.label, 40);
      break;
    }
    case "stopTimer":
      st.live.timerEnd = null;
      break;

    case "deleteAsk":
      if (/^\d{13}-[a-f0-9]+$/.test(String(b.id || ""))) await s.delete(`qa/${b.id}`);
      return json({ ok: true });

    default:
      return bad("unknown_action");
  }
  await saveState(s, st);
  return json({ ok: true });
}

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  try {
    if (req.method === "GET" && path === "state") return await publicState(req);
    if (req.method === "GET" && path.startsWith("img/")) return await image(path.slice(4));
    if (req.method === "POST" && path === "vote") return await vote(req);
    if (req.method === "POST" && path === "ask") return await ask(req);
    if (req.method === "POST" && path === "ask/delete") return await askDelete(req);
    if (req.method === "POST" && path === "admin") return await admin(req);
    if (req.method === "POST" && path === "admin-upload") return await upload(req);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
};
