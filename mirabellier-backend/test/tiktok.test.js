const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeTikTokUrl,
  extractTikTokVideoId,
  parseTikTokPage,
  normalizeTikTokQueueEntry,
  readTikTokList,
} = require("../lib/tiktok");

function buildUniversalItem() {
  return {
    id: "7351234567890123456",
    desc: "my favorite cat video #cats #funny",
    author: {
      uniqueId: "coolcreator",
      nickname: "Cool Creator",
      avatarLarger: "https://p16-sign.tiktokcdn-us.com/obj/avatar.jpeg",
    },
    video: {
      duration: 12,
      playAddr: "https:\\u002F\\u002Fv16-webapp.tiktok.com\\u002Fvid.mp4?a=1\\u0026b=2",
      bitrateInfo: [
        { Bitrate: 2000000, PlayAddr: { UrlList: ["https:\\u002F\\u002Fcdn.tiktok.com\\u002Fhd.mp4"] } },
        { Bitrate: 500000, PlayAddr: { UrlList: ["https:\\u002F\\u002Fcdn.tiktok.com\\u002Fsd.mp4"] } },
      ],
      cover: "https:\\u002F\\u002Fp16-sign.tiktokcdn-us.com\\u002Fcover.jpeg",
    },
    textExtra: [{ hashtagName: "cats" }, { hashtagName: "funny" }],
    challenges: [{ title: "catsoftiktok" }],
  };
}

function buildUniversalHtml(item) {
  const payload = JSON.stringify({
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": { itemInfo: { itemStruct: item } },
    },
  });
  return `<html><head><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${payload}</script></head><body></body></html>`;
}

function buildSigiHtml(item) {
  const payload = JSON.stringify({ ItemModule: { "7351234567890123456": item } });
  return `<html><script>window['SIGI_STATE']=${payload};window['SIGI_RETRY']=false;</script></html>`;
}

test("normalizeTikTokUrl accepts tiktok urls and rejects others", () => {
  const url = normalizeTikTokUrl(
    "https://www.tiktok.com/@coolcreator/video/7351234567890123456",
  );
  assert.ok(url);
  assert.equal(url.hostname, "www.tiktok.com");

  assert.ok(normalizeTikTokUrl("https://vm.tiktok.com/ZMj1a2b3c/"));
  assert.equal(normalizeTikTokUrl("https://example.com/video/123"), null);
  assert.equal(normalizeTikTokUrl("not a url"), null);
  assert.equal(normalizeTikTokUrl(""), null);
});

test("extractTikTokVideoId pulls the numeric id from the path", () => {
  const url = new URL("https://www.tiktok.com/@someone/video/7350000000000000000");
  assert.equal(extractTikTokVideoId(url), "7350000000000000000");
});

test("parseTikTokPage extracts metadata from the universal data script", () => {
  const html = buildUniversalHtml(buildUniversalItem());
  const meta = parseTikTokPage(html, "7351234567890123456");

  assert.ok(meta);
  assert.equal(meta.username, "coolcreator");
  assert.equal(meta.caption, "my favorite cat video #cats #funny");
  assert.equal(meta.avatarUrl, "https://p16-sign.tiktokcdn-us.com/obj/avatar.jpeg");
  assert.deepEqual(meta.tags, ["cats", "funny", "catsoftiktok"]);
  assert.equal(meta.durationSeconds, 12);
  assert.equal(meta.thumbnailUrl, "https://p16-sign.tiktokcdn-us.com/cover.jpeg");
  assert.equal(meta.playAddr, "https://v16-webapp.tiktok.com/vid.mp4?a=1&b=2");
});

test("parseTikTokPage prefers the highest bitrate play addr", () => {
  const item = buildUniversalItem();
  delete item.video.playAddr;
  const meta = parseTikTokPage(buildUniversalHtml(item), "7351234567890123456");

  assert.ok(meta);
  assert.equal(meta.playAddr, "https://cdn.tiktok.com/hd.mp4");
});

test("parseTikTokPage falls back to the legacy SIGI_STATE blob", () => {
  const meta = parseTikTokPage(
    buildSigiHtml(buildUniversalItem()),
    "7351234567890123456",
  );

  assert.ok(meta);
  assert.equal(meta.username, "coolcreator");
  assert.equal(meta.playAddr, "https://v16-webapp.tiktok.com/vid.mp4?a=1&b=2");
});

test("parseTikTokPage returns null when no item is present", () => {
  assert.equal(parseTikTokPage("<html><body>nothing</body></html>", "123"), null);
});

test("parseTikTokPage reads the author verified flag", () => {
  const plain = parseTikTokPage(
    buildUniversalHtml(buildUniversalItem()),
    "7351234567890123456",
  );
  assert.equal(plain.verified, false);

  const item = buildUniversalItem();
  item.author.verified = true;
  const badged = parseTikTokPage(
    buildUniversalHtml(item),
    "7351234567890123456",
  );
  assert.equal(badged.verified, true);
});

test("normalizeTikTokQueueEntry accepts objects and plain url strings", () => {
  assert.deepEqual(
    normalizeTikTokQueueEntry({
      url: "https://www.tiktok.com/@a/video/1",
      username: "@a",
      avatarUrl: "https://example.com/av.png",
      caption: "hi #cats",
      tags: ["#cats", "funny"],
      videoUrl: "https://v16-webapp.tiktok.com/x.mp4",
    }),
    {
      url: "https://www.tiktok.com/@a/video/1",
      // Parsed out of the URL when the entry does not carry it explicitly.
      videoId: "1",
      username: "a",
      avatarUrl: "https://example.com/av.png",
      caption: "hi #cats",
      tags: ["cats", "funny"],
      thumbnailUrl: undefined,
      videoUrl: "https://v16-webapp.tiktok.com/x.mp4",
    },
  );

  // An explicit videoId (the resolver's shape) wins over the URL parse.
  assert.equal(
    normalizeTikTokQueueEntry({
      url: "https://www.tiktok.com/@a/video/1",
      videoId: "7654321",
    }).videoId,
    "7654321",
  );

  // A plain URL string also gets its video id extracted (the feed
  // scheduler relies on it for the dedupe key).
  assert.deepEqual(normalizeTikTokQueueEntry("https://www.tiktok.com/@b/video/2"), {
    url: "https://www.tiktok.com/@b/video/2",
    videoId: "2",
    tags: [],
  });

  assert.equal(normalizeTikTokQueueEntry(null), null);
  assert.equal(normalizeTikTokQueueEntry({}), null);
});

test("readTikTokList returns an array", () => {
  const entries = readTikTokList();
  assert.ok(Array.isArray(entries));
});
