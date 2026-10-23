// Fetch HSR data from prydwen.gg through a headless Chromium.
//
// prydwen.gg sits behind Cloudflare's managed challenge: plain HTTP clients get
// "Just a moment..." HTML instead of the page. Playwright's Chromium clears the
// challenge like a normal browser, so every page load goes through it.
//
// The site is a Next.js App Router build whose server components stream their
// data as `self.__next_f.push([1,"..."])` chunks. `lib/hsr-prydwen.js` parses
// that flight payload; this module only owns the browser lifecycle and fetches.

const { chromium } = require("playwright");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_NAV_TIMEOUT_MS = 45000;
const DEFAULT_SETTLE_MS = 2500;

class HsrBrowser {
  constructor(options = {}) {
    this.navTimeoutMs = options.navTimeoutMs || DEFAULT_NAV_TIMEOUT_MS;
    this.settleMs = options.settleMs || DEFAULT_SETTLE_MS;
    this.browser = null;
    this.context = null;
  }

  async launch() {
    if (this.browser && this.context) return;

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1366, height: 900 },
    });

    // The page is ad-funded and loads a lot of third-party scripts. Blocking
    // the heavy ones keeps a full roster sync from crawling, and the data we
    // want is in the server-rendered payload regardless.
    await this.context.route(
      /(google|doubleclick|intergient|btloader|sentry|playwire|amazon-adsystem|facebook|twitter|reddit|taboola|outbrain)/i,
      (route) => route.abort().catch(() => {}),
    );
  }

  async fetchHtml(url) {
    await this.launch();

    const page = await this.context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.navTimeoutMs,
      });
      const status = response ? response.status() : 0;
      if (status >= 400) {
        throw new Error(`Request to ${url} failed with status ${status}`);
      }

      // The flight payload lands with the first HTML flush, but the app may
      // still be hydrating; a short settle makes the capture deterministic.
      await page.waitForTimeout(this.settleMs);
      const html = await page.content();
      if (!html.includes("__next_f")) {
        throw new Error(`No Next.js flight payload in response from ${url}`);
      }
      return html;
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close() {
    const browser = this.browser;
    this.browser = null;
    this.context = null;
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  DEFAULT_NAV_TIMEOUT_MS,
  DEFAULT_SETTLE_MS,
  HsrBrowser,
  USER_AGENT,
};
