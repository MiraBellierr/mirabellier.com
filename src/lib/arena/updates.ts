import { joinApi } from "@/lib/config";
import type { ArenaUpdate } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function fetchArenaUpdates(limit = 5): Promise<ArenaUpdate[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(joinApi(`/arena/updates?${params.toString()}`), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  const payload = (await response.json()) as { updates: ArenaUpdate[] };
  return payload.updates;
}
export async function createArenaUpdate(
  token: string,
  input: { title: string; body: string },
): Promise<ArenaUpdate> {
  const response = await fetch(joinApi("/arena/updates"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  const payload = (await response.json()) as { update: ArenaUpdate };
  return payload.update;
}
export async function deleteArenaUpdate(
  token: string,
  updateId: string,
): Promise<void> {
  const response = await fetch(
    joinApi(`/arena/updates/${encodeURIComponent(updateId)}`),
    {
      method: "DELETE",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) {
    throw await readApiError(response);
  }
}
