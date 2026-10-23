const test = require("node:test");
const assert = require("node:assert/strict");

const { serializePublicUser } = require("../lib/public-user");

test("public user serialization omits private authentication fields", () => {
  const user = {
    id: "user-1",
    username: "mira",
    discordId: "548050617889980426",
    passwordHash: "not-for-clients",
    avatar: "/images/avatar.webp",
    bio: "hello",
    roles: ["user"],
  };

  const result = serializePublicUser(user);

  assert.deepEqual(result, {
    id: "user-1",
    username: "mira",
    avatar: "/images/avatar.webp",
    bio: "hello",
    roles: ["user"],
  });
  assert.equal(user.discordId, "548050617889980426");
  assert.equal(user.passwordHash, "not-for-clients");
});

test("public user serialization preserves null input", () => {
  assert.equal(serializePublicUser(null), null);
});
