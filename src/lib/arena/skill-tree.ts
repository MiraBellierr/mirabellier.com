import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaSkillTreeResponse } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function fetchArenaSkillTree(
  token: string,
): Promise<ArenaSkillTreeResponse> {
  const response = await fetch(joinApi("/arena/skill-tree"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSkillTreeResponse;
}
export async function activateArenaSkill(
  token: string,
  nodeId: string,
): Promise<ArenaSkillTreeResponse> {
  const response = await fetch(joinApi("/arena/skill-tree/activate"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ nodeId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSkillTreeResponse;
}
export async function resetArenaSkillTree(
  token: string,
): Promise<ArenaSkillTreeResponse> {
  const response = await fetch(joinApi("/arena/skill-tree/reset"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSkillTreeResponse;
}
