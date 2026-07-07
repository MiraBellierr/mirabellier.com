import { Link } from "react-router-dom";
import { DECK_SIZE, ELEMENT_COLORS, ELEMENT_ICONS } from "@/lib/tcg-constants";
import { readMobileTcgDrag, clearActiveTcgGame } from "@/lib/tcg-utils";
import { useTcg } from "@/hooks/use-tcg";

import CardDetailTooltip from "@/components/tcg/CardDetailTooltip";
import PlayerBoard from "@/components/tcg/PlayerBoard";
import BoardHand from "@/components/tcg/BoardHand";
import BoardPiles from "@/components/tcg/BoardPiles";
import MobileDragGhost from "@/components/tcg/MobileDragGhost";
import TcgActionRail from "@/components/tcg/TcgActionRail";
import TcgMatchStatusBand from "@/components/tcg/TcgMatchStatusBand";
import TcgMatchHelpRail from "@/components/tcg/TcgMatchHelpRail";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ConfirmDialog from "@/parts/ConfirmDialog";
import ArenaSubNav from "@/parts/ArenaSubNav";

export default function TcgMatch() {
  const tcg = useTcg("match");

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      {tcg.showStagingModal ? (
        <ConfirmDialog
          title="Staging Area"
          message={<>You are on the <strong>staging stage</strong> of the website. Expect bugs, broken features, and unfinished content.<br /><br />Contact <span className="font-semibold text-pink-600">Mira</span> if you encounter any bugs.</>}
          confirmLabel="I Understand"
          cancelLabel="Go Back"
          onConfirm={tcg.dismissStaging}
          onCancel={() => window.history.back()}
        />
      ) : null}
      <Header />
      <div className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: "var(--page-bg)" }}>
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-2 p-2 sm:gap-4 sm:p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col hidden lg:flex">
            <Navigation />
          </div>
          <main className="w-full space-y-2 p-2 sm:p-4 lg:w-3/5">
            <section className="card-border space-y-3 sm:space-y-4 bg-white/60 p-3 sm:p-4 dark:bg-purple-950/20">
              {/* Projectile overlay */}
              {tcg.projectile ? (
                <div key={tcg.projectile.key} className="animate-projectile-fly" style={{ '--proj-from-x': `${tcg.projectile.fromX}px`, '--proj-from-y': `${tcg.projectile.fromY}px`, '--proj-to-x': `${tcg.projectile.toX}px`, '--proj-to-y': `${tcg.projectile.toY}px` } as React.CSSProperties}>
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 shadow-[0_0_12px_rgba(251,191,36,0.8)]" style={{ marginLeft: -8, marginTop: -8 }} />
                </div>
              ) : null}
              <MobileDragGhost ghost={tcg.mobileDragGhost} card={tcg.mobileDragGhostCard} />
              <h2 className="text-2xl sm:text-4xl font-bold text-blue-900">TCG Showdown</h2>
              <ArenaSubNav />
              {!tcg.showStagingModal ? (
                <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-200">Alpha build: matches and deck tools may still change.</p>
              ) : null}

              {!tcg.token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 text-center">
                  <p className="font-semibold">Sign in required to access TCG.</p>
                  <Link to="/login" className="mt-2 inline-block underline font-bold text-pink-600">go to login</Link>
                </div>
              ) : (
                <>
                  {/* No game active */}
                  {!tcg.gameId && tcg.queueState !== "searching" ? (
                    <div className="space-y-4 text-center">
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-200">TCG Showdown</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {tcg.selectedDeck.size >= DECK_SIZE ? "Deck ready!" : (<>Need {DECK_SIZE} cards in your deck. <Link to={tcg.decksPath} className="font-bold text-pink-600 underline">Go to Decks</Link>.</>)}
                      </p>
                      <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
                        <button onClick={() => tcg.handleStartSolo("solo")} disabled={tcg.loading || tcg.selectedDeck.size < DECK_SIZE} className="arena-redraw-button hover:animate-wiggle text-lg">{tcg.loading ? "[ Starting... ]" : "[ Play Solo ]"}</button>
                        <button onClick={() => tcg.handleStartSolo("ai")} disabled={tcg.loading || tcg.selectedDeck.size < DECK_SIZE} className="arena-redraw-button hover:animate-wiggle text-lg">{tcg.loading ? "[ Starting... ]" : "[ Play AI ]"}</button>
                        <button onClick={tcg.handleFindMatch} disabled={tcg.loading || tcg.selectedDeck.size < DECK_SIZE} className="arena-redraw-button hover:animate-wiggle text-lg">{tcg.loading ? "[ Starting... ]" : "[ Find Match ]"}</button>
                      </div>
                    </div>
                  ) : tcg.queueState === "searching" ? (
                    <div className="space-y-4 text-center">
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-200 animate-pulse">Searching for opponent...</p>
                      <button onClick={tcg.handleCancelQueue} className="arena-redraw-button hover:animate-wiggle">[ Cancel ]</button>
                    </div>
                  ) : null}

                  {/* Game Board */}
                  {tcg.gameId && tcg.gameState?.board && !tcg.gameState?.winner ? (
                    <div
                      ref={tcg.boardElementRef}
                      className="space-y-2 overscroll-contain touch-pan-x select-none sm:space-y-4"
                      data-tcg-board="true"
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStartCapture={tcg.startBoardDrag}
                      onDragEndCapture={tcg.stopBoardDrag}
                      onDropCapture={tcg.stopBoardDrag}
                      onTouchStartCapture={(e) => {
                        const drag = readMobileTcgDrag(e.target);
                        if (drag) {
                          const touch = e.touches[0];
                          const point = touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
                          tcg.mobileDragRef.current = drag;
                          tcg.mobileDragPointRef.current = point;
                          tcg.setMobileDragGhost(point ? { drag, ...point } : null);
                          tcg.startBoardDrag();
                        }
                      }}
                      onTouchMoveCapture={(e) => {
                        if (!tcg.mobileDragRef.current) return;
                        const touch = e.touches[0];
                        if (touch) {
                          tcg.mobileDragPointRef.current = { clientX: touch.clientX, clientY: touch.clientY };
                          tcg.setMobileDragGhost((prev) => prev ? { ...prev, clientX: touch.clientX, clientY: touch.clientY } : null);
                        }
                      }}
                      onTouchEndCapture={(e) => {
                        const drag = tcg.mobileDragRef.current;
                        const touch = e.changedTouches[0];
                        const point = touch ? { clientX: touch.clientX, clientY: touch.clientY } : tcg.mobileDragPointRef.current;
                        tcg.mobileDragRef.current = null;
                        tcg.mobileDragPointRef.current = null;
                        tcg.setMobileDragGhost(null);
                        tcg.stopBoardDrag();
                        if (drag && point) tcg.handleMobileTcgDrop(drag, document.elementFromPoint(point.clientX, point.clientY));
                      }}
                      onTouchCancelCapture={() => { tcg.mobileDragRef.current = null; tcg.mobileDragPointRef.current = null; tcg.setMobileDragGhost(null); tcg.stopBoardDrag(); }}
                    >
                      {/* Top Player (P2/opponent) */}
                      {tcg.gameState.solo ? (
                        <div className={`border-y p-2 sm:p-3 ${tcg.gameState.currentPlayer === "p2" ? "border-blue-300 bg-blue-50/70 dark:border-purple-400/30 dark:bg-purple-950/30" : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/30"}`}>
                          <p className="text-xs font-bold text-center mb-2">
                            <span className={tcg.gameState.currentPlayer === "p2" ? "text-blue-700 dark:text-blue-200" : "text-slate-500 dark:text-slate-300"}>
                              P2{tcg.gameState.currentPlayer === "p2" ? " (active)" : ""}{tcg.gameState.mode === "ai" ? " 🤖" : ""}
                            </span>
                            {" · Score: "}{tcg.gameState.p2Score}
                          </p>
                          {tcg.gameState.elementPools?.[tcg.oppKey] && tcg.gameState.elementPools[tcg.oppKey].length > 0 ? (
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">pool:</span>
                              {tcg.gameState.elementPools[tcg.oppKey].map((el: string) => <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />)}
                            </div>
                          ) : null}
                          <div className="flex items-center justify-center gap-1 mb-2">
                            <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">active energy:</span>
                            {tcg.oppBoard && tcg.oppBoard.elementPool.length > 0 ? tcg.oppBoard.elementPool.map((el: string, i: number) => <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />) : <span className="text-slate-400 text-[0.65rem] dark:text-slate-500">none</span>}
                          </div>
                          <div className="relative mx-auto w-fit max-w-full">
                            <div className="static mb-2 flex justify-center sm:absolute sm:top-0 sm:left-full sm:mb-0 sm:ml-2">
                              {tcg.oppBoard && tcg.oppBoard.elementPool.length > 0 && tcg.gameState.solo && tcg.gameState.currentPlayer === "p2" ? (
                                (() => {
                                  const el = tcg.oppBoard.elementPool[0];
                                  const hasTarget = !!tcg.oppBoard.board.attacker || tcg.oppBoard.board.support.some((s: unknown) => !!s);
                                  return (
                                    <div className={`w-10 h-10 touch-none select-none rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg cursor-grab active:cursor-grabbing ${hasTarget ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`} style={{ backgroundColor: ELEMENT_COLORS[el] || "#888", borderColor: ELEMENT_COLORS[el] || "#888" }} title={`Drag ${el} energy to a card`} draggable data-tcg-draggable="true" data-tcg-drag-kind="element" data-tcg-element={el} onDragStart={(e) => { e.dataTransfer.setData("element", el); e.dataTransfer.effectAllowed = "move"; }}>
                                      <img src={ELEMENT_ICONS[el] || ""} alt={el} className="w-6 h-6 object-contain pointer-events-none" draggable={false} />
                                    </div>
                                  );
                                })()
                              ) : tcg.oppBoard && tcg.oppBoard.elementPool.length > 0 ? (
                                <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg opacity-50" style={{ backgroundColor: ELEMENT_COLORS[tcg.oppBoard.elementPool[0]] || "#888", borderColor: ELEMENT_COLORS[tcg.oppBoard.elementPool[0]] || "#888" }} title={tcg.oppBoard.elementPool[0]}>
                                  <img src={ELEMENT_ICONS[tcg.oppBoard.elementPool[0]] || ""} alt={tcg.oppBoard.elementPool[0]} className="w-6 h-6 object-contain pointer-events-none" draggable={false} />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center text-xs text-slate-400">-</div>
                              )}
                            </div>
                            <div>
                              <BoardHand board={tcg.oppBoard} isTurn={tcg.gameState.solo && tcg.gameState.currentPlayer === "p2"} mirror onAction={tcg.gameState.solo ? tcg.handleAction : undefined} boardKey={tcg.oppKey} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                              <div className="mt-4">
                                <PlayerBoard board={tcg.oppBoard} isTurn={tcg.gameState.solo && tcg.gameState.currentPlayer === "p2"} onAction={tcg.handleAction} mirror boardKey={tcg.oppKey} shakeOpponentCard={tcg.shakeOpponent} attackFloaters={tcg.attackFloaters} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                              </div>
                            </div>
                            <div className="static mt-2 flex justify-center sm:absolute sm:top-0 sm:right-full sm:mt-0 sm:mr-2">
                              <BoardPiles board={tcg.oppBoard} isTurn={tcg.gameState.solo && tcg.gameState.currentPlayer === "p2"} onAction={tcg.gameState.solo ? tcg.handleAction : undefined} turn={tcg.gameState.turn} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="border-y border-slate-200 p-2 sm:p-3 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/30">
                          <p className="text-xs font-bold text-slate-500 dark:text-slate-300 mb-1 text-center">
                            {tcg.gameState?.opponentName || "Opponent"} · Score: {tcg.gameState?.p2Score ?? tcg.gameState?.player2Score ?? 0}
                          </p>
                          {tcg.gameState.elementPools?.[tcg.oppKey] && tcg.gameState.elementPools[tcg.oppKey].length > 0 ? (
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">pool:</span>
                              {tcg.gameState.elementPools[tcg.oppKey].map((el: string) => <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />)}
                            </div>
                          ) : null}
                          <div className="flex items-center justify-center gap-1 mb-2">
                            <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">active energy:</span>
                            {tcg.oppBoard && tcg.oppBoard.elementPool.length > 0 ? tcg.oppBoard.elementPool.map((el: string, i: number) => <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />) : <span className="text-slate-400 text-[0.65rem] dark:text-slate-500">none</span>}
                          </div>
                          <div className="relative mx-auto w-fit max-w-full">
                            <div>
                              <PlayerBoard board={tcg.oppBoard} isTurn={false} onAction={tcg.handleAction} mirror boardKey={tcg.oppKey} shakeOpponentCard={tcg.shakeOpponent} attackFloaters={tcg.attackFloaters} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                              <p className="text-xs text-slate-400 mt-1 text-center dark:text-slate-500">Hand: {tcg.oppBoard?.hand.length ?? 0}</p>
                            </div>
                            <div className="static mt-2 flex justify-center sm:absolute sm:top-0 sm:right-full sm:mt-0 sm:mr-2">
                              <BoardPiles board={tcg.oppBoard} isTurn={tcg.gameState.solo && tcg.gameState.currentPlayer === "p2"} onAction={tcg.gameState.solo ? tcg.handleAction : undefined} turn={tcg.gameState.turn} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bottom Player (You/P1) */}
                      <div className={`border-y p-2 sm:p-3 ${tcg.gameState.solo && tcg.gameState.currentPlayer === "p1" ? "border-blue-300 bg-blue-50/80 dark:border-purple-400/30 dark:bg-purple-950/40" : "border-blue-200 bg-blue-50/70 dark:border-purple-400/20 dark:bg-purple-950/30"}`}>
                        <p className="text-xs font-bold text-center mb-2">
                          {tcg.gameState.solo ? (
                            <span className={tcg.gameState.currentPlayer === "p1" ? "text-blue-700 dark:text-blue-200" : "text-slate-500 dark:text-slate-300"}>P1{tcg.gameState.currentPlayer === "p1" ? " (active)" : ""}</span>
                          ) : <span className="dark:text-purple-100">You</span>}
                          <span className="dark:text-slate-300">{" · Score: "}{tcg.gameState.p1Score}</span>
                        </p>
                        {tcg.gameState.elementPools?.[tcg.myKey] && tcg.gameState.elementPools[tcg.myKey].length > 0 ? (
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">pool:</span>
                            {tcg.gameState.elementPools[tcg.myKey].map((el: string) => <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />)}
                          </div>
                        ) : null}
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">active energy:</span>
                          {tcg.myBoard && tcg.myBoard.elementPool.length > 0 ? tcg.myBoard.elementPool.map((el: string, i: number) => <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />) : <span className="text-slate-400 text-[0.65rem] dark:text-slate-500">none</span>}
                        </div>
                        <div className="relative mx-auto w-fit max-w-full">
                          <div className="static mb-2 flex justify-center sm:absolute sm:top-0 sm:right-full sm:mb-0 sm:mr-2">
                            {tcg.myBoard && tcg.myBoard.elementPool.length > 0 && (tcg.gameState.solo ? tcg.gameState.currentPlayer === "p1" : tcg.gameState?.myTurn) ? (
                              (() => {
                                const el = tcg.myBoard.elementPool[0];
                                const hasTarget = !!tcg.myBoard.board.attacker || tcg.myBoard.board.support.some((s: unknown) => !!s);
                                return (
                                  <div className={`w-10 h-10 touch-none select-none rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg cursor-grab active:cursor-grabbing ${hasTarget ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`} style={{ backgroundColor: ELEMENT_COLORS[el] || "#888", borderColor: ELEMENT_COLORS[el] || "#888" }} title={`Drag ${el} energy to a card`} draggable data-tcg-draggable="true" data-tcg-drag-kind="element" data-tcg-element={el} onDragStart={(e) => { e.dataTransfer.setData("element", el); e.dataTransfer.effectAllowed = "move"; }}>
                                    <img src={ELEMENT_ICONS[el] || ""} alt={el} className="w-6 h-6 object-contain pointer-events-none" draggable={false} />
                                  </div>
                                );
                              })()
                            ) : tcg.myBoard && tcg.myBoard.elementPool.length > 0 ? (
                              <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg opacity-50" style={{ backgroundColor: ELEMENT_COLORS[tcg.myBoard.elementPool[0]] || "#888", borderColor: ELEMENT_COLORS[tcg.myBoard.elementPool[0]] || "#888" }} title={tcg.myBoard.elementPool[0]}>
                                <img src={ELEMENT_ICONS[tcg.myBoard.elementPool[0]] || ""} alt={tcg.myBoard.elementPool[0]} className="w-6 h-6 object-contain pointer-events-none" draggable={false} />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center text-xs text-slate-400">-</div>
                            )}
                          </div>
                          <div>
                            <PlayerBoard board={tcg.myBoard} isTurn={tcg.gameState.solo ? tcg.gameState.currentPlayer === "p1" : tcg.gameState.myTurn} onAction={tcg.handleAction} boardKey={tcg.myKey} shakePlayerCard={tcg.shakePlayer} attackFloaters={tcg.attackFloaters} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                            <BoardHand board={tcg.myBoard} isTurn={tcg.gameState.solo ? tcg.gameState.currentPlayer === "p1" : tcg.gameState.myTurn} onAction={tcg.handleAction} boardKey={tcg.myKey} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                          </div>
                          <div className="static mt-2 flex justify-center sm:absolute sm:top-0 sm:left-full sm:mt-0 sm:ml-2">
                            <BoardPiles board={tcg.myBoard} isTurn={tcg.gameState.solo ? tcg.gameState.currentPlayer === "p1" : tcg.gameState.myTurn} onAction={tcg.handleAction} turn={tcg.gameState.turn} onCardHover={tcg.onCardHover} onCardHoverLeave={tcg.onCardHoverLeave} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Finished */}
                  {tcg.gameState?.winner ? (
                    <div className="space-y-3 border-y border-sky-100 bg-white/75 py-5 text-center dark:border-purple-400/20 dark:bg-purple-950/20">
                      <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-slate-300">match finished</p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-200">{tcg.gameState.winner === tcg.myKey ? "You Win!" : "You Lose!"}</p>
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Final score: {tcg.gameState.p1Score}-{tcg.gameState.p2Score}</p>
                      {tcg.gameState.lastAction ? <p className="mx-auto max-w-xl px-3 text-xs font-semibold text-slate-500 dark:text-slate-300">{tcg.gameState.lastAction}</p> : null}
                      <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={() => { tcg.setGameId(null); tcg.setGameState(null); clearActiveTcgGame(); }} className="arena-redraw-button hover:animate-wiggle">[ Play again ]</button>
                        <Link to={tcg.decksPath} onClick={() => { tcg.setGameId(null); tcg.setGameState(null); clearActiveTcgGame(); }} className="arena-redraw-button hover:animate-wiggle">[ Back to decks ]</Link>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {tcg.errorMessage && tcg.errorState !== "hidden" && tcg.errorState !== "pending" ? (
                <div className={`site-entry-toast-shell ${tcg.errorState === "visible" ? "site-entry-toast-shell--visible" : ""} ${tcg.errorState === "leaving" ? "site-entry-toast-shell--leaving" : ""}`}
                  style={{ top: "1rem", bottom: "auto", right: "50%", transform: tcg.errorState === "visible" ? "translateX(50%) translateY(0)" : tcg.errorState === "leaving" ? "translateX(50%) translateY(-100%)" : "translateX(50%) translateY(-100%)", width: "auto", maxWidth: "min(88vw, 24rem)" }}
                  role="status" aria-live="polite">
                  <div className="site-entry-toast"><p className="site-entry-toast__message">{tcg.errorMessage}</p></div>
                </div>
              ) : null}
            </section>
            <CardDetailTooltip detail={tcg.hoverDetail} />
            <Divider />
          </main>

          <aside className="w-full space-y-4 sm:block lg:w-1/5">
            <div className="sticky top-4 space-y-4">
              {tcg.gameId && tcg.gameState?.board && !tcg.gameState?.winner ? (
                <>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-white/80 p-3 opacity-95 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40">
                    <h2 className="text-center text-sm font-bold text-blue-700 mb-2 dark:text-purple-100">score board</h2>
                    <TcgMatchStatusBand gameState={tcg.gameState} queueState={tcg.queueState} actionPending={tcg.actionPending} aiActionText={tcg.aiActionText} onExpire={tcg.refreshActiveGameState} />
                  </div>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-white/80 p-3 opacity-95 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40">
                    <h2 className="text-center text-sm font-bold text-blue-700 mb-2 dark:text-purple-100">controls</h2>
                    <TcgActionRail gameState={tcg.gameState} myBoard={tcg.myBoard} oppBoard={tcg.oppBoard} myKey={tcg.myKey} oppKey={tcg.oppKey} actionPending={tcg.actionPending} onAction={tcg.handleAction} />
                  </div>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-sky-50/60 p-3 opacity-95 shadow-md dark:border-purple-400/30 dark:bg-purple-950/30">
                    <h2 className="text-center text-sm font-bold text-blue-700 mb-2 dark:text-purple-100">rules</h2>
                    <TcgMatchHelpRail />
                  </div>
                </>
              ) : (
                <>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100">
                    <h2 className="text-center text-lg font-bold text-blue-700 mb-2 dark:text-purple-100">weakness chart</h2>
                    <div className="space-y-1 text-xs">
                      {[{ el: "Fire", beats: "Earth" }, { el: "Water", beats: "Fire" }, { el: "Earth", beats: "Water" }, { el: "Wind", beats: "Light" }, { el: "Light", beats: "Dark" }, { el: "Dark", beats: "Wind" }].map((row) => (
                        <div key={row.el} className="flex items-center gap-1.5">
                          <span className="inline-block w-14 px-1.5 py-0.5 rounded-full text-center font-bold text-white text-[0.6rem]" style={{ backgroundColor: ELEMENT_COLORS[row.el] }}>{row.el}</span>
                          <span className="text-slate-500">beats</span>
                          <span className="inline-block px-1.5 py-0.5 rounded-full text-center font-bold text-white text-[0.6rem]" style={{ backgroundColor: ELEMENT_COLORS[row.beats] }}>{row.beats}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40">
                    <div className="space-y-2 text-sm text-blue-600 dark:text-purple-100/80">
                      <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">tcg rules</h2>
                      <p>10-card deck. 1 attacker + 3 support.</p><p>Energy can go on any card.</p><p>Attack with 2 matching energy.</p><p>Off-element energy can switch.</p><p>Each turn spawns 1 random element type.</p><p>Super-effective = 3x damage!</p><p>First to 3 points wins.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
}
