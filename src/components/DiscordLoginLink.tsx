import type { AnchorHTMLAttributes } from "react";

import { getDiscordAuthUrl } from "@/lib/discord-auth";

/**
 * Drop-in replacement for `<Link to="/login">`: goes straight to Discord
 * OAuth instead of stopping at an in-app login page first.
 */
const DiscordLoginLink = (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a href={getDiscordAuthUrl()} {...props} />
);

export default DiscordLoginLink;
