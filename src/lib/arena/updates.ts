import type { ArenaUpdate } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaUpdates(limit = 5): Promise<ArenaUpdate[]> {
  const payload = await arenaRequest<{ updates: ArenaUpdate[] }>("/arena/updates", {
    query: { limit },
  });
  return payload.updates;
}
export async function createArenaUpdate(
  token: string,
  input: { title: string; body: string },
): Promise<ArenaUpdate> {
  const payload = await arenaRequest<{ update: ArenaUpdate }>("/arena/updates", {
    token,
    body: input,
  });
  return payload.update;
}
export async function deleteArenaUpdate(
  token: string,
  updateId: string,
): Promise<void> {
  await arenaRequest<void>(
    `/arena/updates/${encodeURIComponent(updateId)}`,
    { token, method: "DELETE" },
  );
}
