function serializePublicUser(user) {
  if (!user) return null;

  const publicUser = { ...user };
  delete publicUser.passwordHash;
  delete publicUser.discordId;
  return publicUser;
}

module.exports = { serializePublicUser };
