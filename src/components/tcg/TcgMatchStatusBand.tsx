import type { TcgGameState } from "@/lib/arena";
import { getActivePlayerLabel } from "@/lib/tcg-utils";
import CountdownTimer from "@/components/tcg/CountdownTimer";

export default function TcgMatchStatusBand({ gameState, queueState, actionPending, aiActionText, onExpire }: {
  gameState: TcgGameState;
  queueState: "idle" | "searching" | "matched";
  actionPending: boolean;
  aiActionText: string | null;
  onExpire: () => void;
}) {
  const score = `${gameState.p1Score ?? gameState.player1Score ?? 0}-${gameState.p2Score ?? gameState.player2Score ?? 0}`;
  const activeText = getActivePlayerLabel(gameState);
  const activeClass = activeText.includes("Your") || activeText.includes("P1") || activeText.includes("P2")
    ? "text-emerald-700"
    : "text-slate-500";

  return (
    <div className="border-y border-sky-100 bg-white/75 px-3 py-2 dark:border-purple-400/20 dark:bg-purple-950/20">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold">
        <span className={activeClass}>{activeText}</span>
        <span className="text-blue-700 dark:text-blue-200">Score {score}</span>
        <span className="text-slate-500 dark:text-slate-300">Queue {queueState === "searching" ? "searching" : gameState.solo ? "solo" : "matched"}</span>
        {gameState.turnStartedAt && gameState.phase !== "finished" ? (
          <CountdownTimer startMs={gameState.turnStartedAt} onExpire={onExpire} />
        ) : null}
        {actionPending ? <span className="text-amber-600 dark:text-amber-300">Action pending</span> : null}
      </div>
      {aiActionText || gameState.lastAction ? (
        <p className={`mt-1 text-center text-xs font-semibold ${aiActionText ? "text-purple-600 dark:text-purple-200 animate-pulse" : "text-slate-500"}`}>
          {aiActionText || gameState.lastAction}
        </p>
      ) : null}
    </div>
  );
}
