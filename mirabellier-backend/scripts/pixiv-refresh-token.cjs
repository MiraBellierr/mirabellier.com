#!/usr/bin/env node

/**
 * One-time helper: obtain a Pixiv refresh token for the fan art search.
 *
 * Uses Pixiv's public mobile-app OAuth client (the same credentials the
 * backend already hardcodes in lib/fanart.js) with grant_type=password.
 *
 * Usage (from the mirabellier-backend folder):
 *   node scripts/pixiv-refresh-token.cjs
 *
 * Then copy the printed token into your .env:
 *   PIXIV_REFRESH_TOKEN=...
 *
 * Notes:
 *   - If Pixiv requires a captcha for your account, this flow will fail with
 *     error 103 or a "captcha" hint. In that case log in through the mobile
 *     app flow (or a tool like gppt) to capture the refresh_token instead.
 */

const axios = require("axios");
const readline = require("readline");

const PIXIV_TOKEN_URL = "https://oauth.secure.pixiv.net/auth/token";
const PIXIV_CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const PIXIV_CLIENT_SECRET = process.env.PIXIV_CLIENT_SECRET || "";
const USER_AGENT = "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)";

if (!PIXIV_CLIENT_SECRET) {
  console.error("Set PIXIV_CLIENT_SECRET to the Pixiv mobile-app OAuth client secret before running this script.");
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: hidden ? undefined : process.stdout,
    terminal: !hidden,
  });

  return new Promise((resolve) => {
    if (!hidden) {
      process.stdout.write(question);
    }

    rl.on("line", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const username = process.env.PIXIV_USERNAME
    ? process.env.PIXIV_USERNAME.trim()
    : await ask("Pixiv login (email or pixiv ID): ");

  let password = process.env.PIXIV_PASSWORD
    ? process.env.PIXIV_PASSWORD.trim()
    : await ask("Password (not echoed): ", { hidden: true });

  if (password) {
    process.stdout.write("\n");
  }

  if (!username || !password) {
    console.error("A pixiv login and password are required.");
    process.exit(1);
  }

  try {
    const response = await axios.post(
      PIXIV_TOKEN_URL,
      new URLSearchParams({
        client_id: PIXIV_CLIENT_ID,
        client_secret: PIXIV_CLIENT_SECRET,
        grant_type: "password",
        username,
        password,
        get_secure_url: "true",
        include_policy: "true",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        timeout: 20000,
      },
    );

    const refreshToken =
      response?.data?.response?.refresh_token ||
      response?.data?.refresh_token;

    if (typeof refreshToken === "string" && refreshToken) {
      console.log("\nAdd this to mirabellier-backend/.env:");
      console.log(`\n  PIXIV_REFRESH_TOKEN=${refreshToken}\n`);
      return;
    }

    console.error(
      `\nNo refresh token in the response: ${JSON.stringify(
        response?.data?.has_error
          ? { has_error: response.data.has_error, errors: response.data.errors }
          : response?.data,
      )}`,
    );
    process.exit(1);
  } catch (error) {
    const data = error?.response?.data;
    const errors = data?.has_error ? data.errors : null;
    const status = error?.response?.status;

    console.error(
      `\nPixiv token request failed${
        status ? ` (HTTP ${status})` : ""
      }. ${error.message}`,
    );

    if (errors) {
      console.error(
        JSON.stringify(errors, null, 2),
      );
    } else if (data) {
      console.error(JSON.stringify(data, null, 2));
    }

    if (errors && JSON.stringify(errors).includes("103")) {
      console.error(
        "\nError 103 means Pixiv did not accept the login (wrong credentials or captcha required).",
      );
    }

    const rawErrors = JSON.stringify(errors || data || {});
    if (rawErrors.includes("1508") || rawErrors.includes("grant type")) {
      console.error(
        '\nPixiv no longer allows password login with the public app client. Get a refresh token with the community tool gppt instead:\n' +
          "  pip install gppt\n" +
          "  gppt login\n" +
          "Then copy the printed refresh_token into your .env as PIXIV_REFRESH_TOKEN.",
      );
    }

    process.exit(1);
  }
}

main();
