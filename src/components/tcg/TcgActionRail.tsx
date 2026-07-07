import type { TcgGameState, TcgPlayerState } from "@/lib/arena";
import { canTcgCardAttack, canTcgCardSwitch, getAssignedEnergyText } from "@/lib/tcg-utils";
import { type TcgAction } from "@/lib/tcg-constants";

export default function TcgActionRail({ gameState, myBoard, oppBoard, myKey, oppKey, actionPending, onAction }: {
  gameState: TcgGameState;
  myBoard: TcgPlayerState | null;
  oppBoard: TcgPlayerState | null;
  myKey: string;
  oppKey: string;
  actionPending: boolean;
  onAction: (action: TcgAction) => void;
}) {
  const activeKey = gameState.solo ? (gameState.currentPlayer || "p1") : myKey;
  const activeBoard = activeKey === myKey ? myBoard : activeKey === oppKey ? oppBoard : null;
  const isAiTurn = gameState.mode === "ai" && activeKey === "p2";
  const isActionTurn = gameState.solo ? !isAiTurn : gameState.myTurn;
  const activeLabel = gameState.solo
    ? activeKey === "p1" ? "P1" : gameState.mode === "ai" ? "AI" : "P2"
    : "You";
  const activeEnergy = activeBoard?.elementPool[0] || null;
  const canDraw = !!activeBoard && activeBoard.drawPile.length > 0 && !activeBoard.drawnCardThisTurn && gameState.turn > 1;
  const attacker = activeBoard?.board.attacker || null;
  const support = activeBoard?.board.support || [];
  const canPlace = !!activeBoard && !activeBoard.placedCardThisTurn && activeBoard.hand.length > 0 && (!attacker || support.some((card) => !card));
  const assignTargets = [
    { slot: "attacker", label: "atk", card: attacker },
    ...support.map((card, index) => ({ slot: `support_${index}`, label: `S${index + 1}`, card })),
  ].filter((target) => !!target.card);
  const canAttack = canTcgCardAttack(attacker);
  const attackReason = attacker
    ? `Attack needs 2 matching ${attacker.element || "element"} energy. ${getAssignedEnergyText(attacker)} assigned.`
    : "Place an attacker first.";
  const switchTargets = activeBoard && canTcgCardSwitch(attacker, activeBoard)
    ? support
        .map((card, index) => ({ slot: `support_${index}`, label: index + 1, card }))
        .filter((target) => !!target.card)
    : [];
  const canSwitch = switchTargets.length > 0;
  const switchReason = !attacker
    ? "Place an attacker first."
    : activeBoard?.switchedCardThisTurn
      ? "Already switched this turn."
      : support.some((card) => !!card)
        ? "Switch needs at least 1 energy on the attacker."
        : "Place a support card to switch.";
  const disabledReason = !isActionTurn
    ? isAiTurn ? "AI is taking its turn." : "Waiting for opponent."
    : actionPending
      ? "Action pending."
      : !activeBoard
        ? "Board not ready."
        : null;
  const hints = [
    canPlace ? "Click a hand card to place it." : null,
    canDraw ? "Draw is available." : null,
    activeEnergy && assignTargets.length > 0 ? `Assign ${activeEnergy} to a card.` : null,
    canAttack ? "Attack is ready." : null,
    canSwitch ? "Switch is ready." : null,
  ].filter((hint): hint is string => !!hint);

  const baseBtn = "rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 w-full text-center";
  const readyBtn = `${baseBtn} border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:border-pink-300 hover:text-pink-600 dark:border-emerald-300/50 dark:bg-emerald-950/40 dark:text-emerald-100`;
  const idleBtn = `${baseBtn} border-blue-200 bg-white/80 text-blue-700 dark:border-purple-300/30 dark:bg-purple-950/40 dark:text-purple-100`;
  const dangerBtn = `${baseBtn} border-red-200 bg-white/80 text-red-600 hover:bg-red-50 dark:border-red-400/30 dark:bg-red-950/20 dark:text-red-300`;
  const disabled = !!disabledReason;

  const statusText = disabledReason
    || (attacker && !canAttack ? attackReason : null)
    || (attacker && support.some((c) => !!c) && !canSwitch ? switchReason : null)
    || hints[0]
    || null;

  return (
    <div className="border-y border-sky-100 bg-sky-50/60 px-3 py-3 dark:border-purple-400/20 dark:bg-purple-950/20 space-y-3">
      {/* ── Status line ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {activeLabel}&apos;s turn
        </span>
        <span className="text-[0.6rem] font-semibold text-slate-400 dark:text-slate-500">
          turn {gameState.turn || 1}
        </span>
      </div>

      {/* ── Primary actions: Draw + Attack ── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={canDraw ? readyBtn : idleBtn}
          disabled={disabled || !canDraw}
          title={disabledReason || (canDraw ? "Draw one card" : "Already drew this turn")}
          onClick={() => onAction({ type: "draw" })}
        >
          🂠 Draw
        </button>
        <button
          type="button"
          className={canAttack ? readyBtn : idleBtn}
          disabled={disabled || !canAttack}
          title={canAttack ? "Attack opponent" : attackReason}
          onClick={() => onAction({ type: "attack" })}
        >
          ⚔ Attack
        </button>
      </div>

      {/* ── Energy assignment ── */}
      {assignTargets.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[0.6rem] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
            ⚡ assign {activeEnergy || "energy"}
          </p>
          <div className="flex gap-1.5">
            {assignTargets.map((target) => (
              <button
                key={`assign-${target.slot}`}
                type="button"
                className={activeEnergy ? readyBtn : idleBtn}
                disabled={disabled || !activeEnergy}
                title={activeEnergy ? `Assign ${activeEnergy} to ${target.label}` : "No energy available"}
                onClick={() => onAction({ type: "assign", slot: target.slot })}
              >
                {target.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Switch ── */}
      {switchTargets.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[0.6rem] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
            🔄 switch
          </p>
          <div className="flex gap-1.5">
            {switchTargets.map((target) => (
              <button
                key={`switch-${target.slot}`}
                type="button"
                className={readyBtn}
                disabled={disabled}
                title="Switch attacker with this support card"
                onClick={() => onAction({ type: "switch", slot: target.slot })}
              >
                S{target.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Turn actions: End + Forfeit ── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={isActionTurn && !actionPending ? readyBtn : idleBtn}
          disabled={disabled}
          title={disabledReason || "End this turn"}
          onClick={() => onAction({ type: "end" })}
        >
          ⏹ End turn
        </button>
        <button
          type="button"
          className={dangerBtn}
          disabled={actionPending}
          title="Forfeit this game"
          onClick={() => onAction({ type: "forfeit" })}
        >
          🏳 Forfeit
        </button>
      </div>

      {/* ── Hint / status message ── */}
      {statusText ? (
        <p className={`text-center text-[0.65rem] font-semibold leading-snug ${
          disabledReason || (attacker && !canAttack)
            ? "text-amber-600 dark:text-amber-300"
            : "text-emerald-700 dark:text-emerald-200"
        }`}>
          {statusText}
        </p>
      ) : null}
    </div>
  );
}
