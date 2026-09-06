import type { ArenaSkillTreeResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaSkillTree(
  token: string,
): Promise<ArenaSkillTreeResponse> {
  return arenaRequest("/arena/skill-tree", { token });
}
export async function activateArenaSkill(
  token: string,
  nodeId: string,
): Promise<ArenaSkillTreeResponse> {
  return arenaRequest("/arena/skill-tree/activate", { token, body: { nodeId } });
}
export async function resetArenaSkillTree(
  token: string,
): Promise<ArenaSkillTreeResponse> {
  return arenaRequest("/arena/skill-tree/reset", { token, body: {} });
}
