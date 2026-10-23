const test = require("node:test");
const assert = require("node:assert/strict");

const { isLikelyCrawler } = require("../lib/share-preview-utils");

// This is the single source of truth for "serve the SSR share/SEO page vs.
// redirect to the SPA" across routes/{auth,posts,shrines,pixies,quotes,
// question-of-the-day} and lib/anime-embed. Lock the crawler set so the
// regex can't quietly drift back apart.
test("isLikelyCrawler matches the unfurlers and search bots we care about", () => {
  const crawlers = [
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "Discordbot/2.0 (+https://discordapp.com)",
    "Slackbot-LinkExpanding 1.0",
    "LinkedInBot/1.0",
    "TelegramBot (like TwitterBot)",
    "Pinterest/0.2 (+https://www.pinterest.com/bot.html)",
    "redditbot/1.0",
    "Embedly/0.2",
    "Viber",
    "KakaoTalk-Scrap/1.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Google-InspectionTool/1.0",
    "Mozilla/5.0 (compatible; YandexBot/3.0)",
    "DuckDuckBot/1.1",
    "Baiduspider/2.0",
    "some-random-crawler/1.0",
  ];
  for (const ua of crawlers) {
    assert.equal(isLikelyCrawler(ua), true, ua);
  }
});

test("isLikelyCrawler treats the WhatsApp preview fetcher as a crawler", () => {
  assert.equal(isLikelyCrawler("WhatsApp/2.23.20.0"), true);
  // ...but a real browser that merely has WhatsApp in the UA is not
  assert.equal(
    isLikelyCrawler(
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 WhatsApp/2.23",
    ),
    false,
  );
});

test("isLikelyCrawler leaves real browsers and empty UAs alone", () => {
  assert.equal(
    isLikelyCrawler(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    ),
    false,
  );
  assert.equal(
    isLikelyCrawler(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    ),
    false,
  );
  assert.equal(isLikelyCrawler(""), false);
  assert.equal(isLikelyCrawler(undefined), false);
  assert.equal(isLikelyCrawler(null), false);
});
