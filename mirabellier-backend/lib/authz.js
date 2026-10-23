const DEFAULT_OWNER_DISCORD_ID = "548050617889980426";

function buildOwnerDiscordIdSet() {
  const rawConfigured = String(
    process.env.OWNER_DISCORD_IDS ||
      process.env.OWNER_DISCORD_ID ||
      DEFAULT_OWNER_DISCORD_ID,
  );

  return new Set(
    rawConfigured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

const OWNER_DISCORD_IDS = buildOwnerDiscordIdSet();

function isOwner(user) {
  return Boolean(
    user &&
      typeof user.discordId === "string" &&
      OWNER_DISCORD_IDS.has(user.discordId),
  );
}

function getUserRoles(user) {
  if (!user) return [];
  if (isOwner(user)) return ["user", "admin", "owner"];
  return ["user"];
}

function getUserPermissions(user) {
  const owner = isOwner(user);
  return {
    adminPanel: owner,
    moderateGuestbook: owner,
    moderateQuestionOfTheDay: owner,
    manageShrines: owner,
  };
}

module.exports = {
  isOwner,
  getUserRoles,
  getUserPermissions,
};
