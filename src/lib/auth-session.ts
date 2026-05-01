export const COOKIE_SESSION_TOKEN_MARKER = "__cookie_session__";

export function shouldSendBearerToken(token: string | null | undefined): boolean {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token !== COOKIE_SESSION_TOKEN_MARKER
  );
}
