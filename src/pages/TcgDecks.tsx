import { Link } from "react-router-dom";
import { DECK_SIZE, ELEMENTS, ELEMENT_COLORS, ELEMENT_ICONS, type CollectionSort } from "@/lib/tcg-constants";
import { toCardId, saveDeck, saveElementPool } from "@/lib/tcg-utils";
import { useTcg } from "@/hooks/use-tcg";

import CardDetailTooltip from "@/components/tcg/CardDetailTooltip";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ConfirmDialog from "@/parts/ConfirmDialog";
import ArenaSubNav from "@/parts/ArenaSubNav";

export default function TcgDecks() {
  const tcg = useTcg("decks");

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
              <h2 className="text-2xl sm:text-4xl font-bold text-blue-900">TCG Showdown</h2>
              <ArenaSubNav />
              {!tcg.showStagingModal ? (
                <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-200">
                  Alpha build: matches and deck tools may still change.
                </p>
              ) : null}

              {!tcg.token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 text-center">
                  <p className="font-semibold">Sign in required to access TCG.</p>
                  <Link to="/login" className="mt-2 inline-block underline font-bold text-pink-600">go to login</Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-3 dark:border-purple-400/20">
                    <div>
                      <p className="text-sm font-black text-blue-800 dark:text-purple-100">
                        Deck readiness: {tcg.selectedDeck.size}/{DECK_SIZE}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {tcg.selectedDeck.size >= DECK_SIZE ? "Ready to play." : `${DECK_SIZE - tcg.selectedDeck.size} more card${DECK_SIZE - tcg.selectedDeck.size === 1 ? "" : "s"} needed.`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => tcg.handleStartSolo("solo")} disabled={tcg.loading || tcg.selectedDeck.size < DECK_SIZE} className="arena-redraw-button hover:animate-wiggle text-xs">
                        {tcg.loading ? "[ Starting... ]" : "[ Play Solo ]"}
                      </button>
                      <button onClick={() => tcg.handleStartSolo("ai")} disabled={tcg.loading || tcg.selectedDeck.size < DECK_SIZE} className="arena-redraw-button hover:animate-wiggle text-xs">
                        {tcg.loading ? "[ Starting... ]" : "[ Play AI ]"}
                      </button>
                      <button onClick={tcg.handleFindMatch} disabled={tcg.loading || tcg.selectedDeck.size < DECK_SIZE} className="arena-redraw-button hover:animate-wiggle text-xs">
                        {tcg.loading ? "[ Searching... ]" : "[ Find Match ]"}
                      </button>
                    </div>
                  </div>

                  {/* Selected deck */}
                  {tcg.selectedDeck.size > 0 ? (
                    <div className="border border-blue-200 rounded-xl bg-blue-50/60 p-3 dark:border-purple-400/20 dark:bg-purple-950/30">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-blue-700 dark:text-purple-100">
                          Your Deck ({tcg.selectedDeck.size}/{DECK_SIZE})
                        </p>
                        <div className="flex items-center gap-1">
                          <span className="text-[0.55rem] font-semibold text-slate-500 dark:text-slate-400">elements:</span>
                          {tcg.elementPool.map((el) => (
                            <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 select-none" onContextMenu={(e) => e.preventDefault()}>
                        {tcg.selectedDeckCards.map((card) => {
                          const id = toCardId(card);
                          return (
                            <div key={id} className="relative cursor-pointer flex-shrink-0 hover:scale-105 transition rounded-xl overflow-hidden" onClick={() => tcg.handleToggleCard(id)} title="Click to remove">
                              <ArenaPortraitCard card={card} size="compact" showIvLine={false} />
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                                <span className="text-white text-sm font-bold bg-red-500/80 px-2 py-0.5 rounded-full">Remove</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Element spawn selector */}
                  <div className="flex flex-wrap items-center gap-2 bg-amber-50/60 border border-amber-200 rounded-lg p-2 dark:bg-amber-950/20 dark:border-amber-800/40">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-200">⚡ Elements to spawn:</span>
                    {ELEMENTS.map((el) => {
                      const active = tcg.elementPool.includes(el);
                      return (
                        <button
                          key={el} type="button" aria-pressed={active}
                          onClick={() => {
                            const next = active ? tcg.elementPool.filter((e) => e !== el) : [...tcg.elementPool, el];
                            if (next.length === 0) return;
                            tcg.setElementPool(next);
                            saveElementPool(next);
                          }}
                          style={{ backgroundColor: active ? ELEMENT_COLORS[el] : "transparent", borderColor: ELEMENT_COLORS[el], color: active ? "#fff" : ELEMENT_COLORS[el] }}
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border-2 transition hover:scale-105 ${active ? "ring-2 ring-amber-300 ring-offset-1 shadow-md" : "opacity-70 hover:opacity-100"}`}
                        >
                          {active ? "✓ " : ""}{el}
                        </button>
                      );
                    })}
                  </div>

                  {/* Filters & search */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-blue-600 dark:text-purple-100/70">Cards available: {tcg.filteredDeckCards.length}</p>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <label htmlFor="tcg-deck-sort" className="sr-only">Sort deck cards</label>
                        <span className="text-xs text-slate-500 dark:text-slate-400">sort:</span>
                        <select id="tcg-deck-sort" value={tcg.deckSort} onChange={(event) => tcg.setDeckSort(event.target.value as CollectionSort)} className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100">
                          <option value="recent">Recent</option>
                          <option value="rarity-desc">Rarity ▼</option>
                          <option value="rarity-asc">Rarity ▲</option>
                          <option value="iv-desc">IV ▼</option>
                          <option value="iv-asc">IV ▲</option>
                          <option value="power-desc">Power ▼</option>
                          <option value="guard-desc">Guard ▼</option>
                          <option value="speed-desc">Speed ▼</option>
                          <option value="effectHit-desc">Effect Hit ▼</option>
                        </select>
                        <input id="tcg-deck-search" type="search" value={tcg.deckSearch} onChange={(event) => tcg.setDeckSearch(event.target.value)} placeholder="Lelouch Lamperouge..." className="w-48 rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100" />
                        {tcg.hasDeckFilters ? (
                          <button type="button" onClick={() => { tcg.setDeckSearch(""); tcg.setDeckFilterEl(""); tcg.setDeckDuplicatesFilter(false); }} className="arena-redraw-button text-xs">
                            [ clear filters ]
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">element:</span>
                      {ELEMENTS.map((el) => {
                        const active = tcg.deckFilterEl === el;
                        return (
                          <button key={el} type="button" onClick={() => tcg.setDeckFilterEl(active ? "" : el)} style={{ backgroundColor: active ? ELEMENT_COLORS[el] : "transparent", borderColor: ELEMENT_COLORS[el], color: active ? "#fff" : ELEMENT_COLORS[el] }} className="text-xs font-bold px-2 py-0.5 rounded-full border transition">
                            {el}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">show:</span>
                      <button type="button" onClick={() => tcg.setDeckDuplicatesFilter((prev) => !prev)} className={`text-xs font-bold px-2 py-0.5 rounded-full border transition ${tcg.deckDuplicatesFilter ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300" : "text-purple-500 border-purple-300 hover:bg-purple-50"}`}>
                        duplicates only
                      </button>
                    </div>
                  </div>

                  {/* Card grid */}
                  {tcg.eligibleCards.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading cards...</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 max-h-96 overflow-y-auto select-none" onContextMenu={(e) => e.preventDefault()}>
                        {tcg.filteredDeckCards.map((card) => {
                          const id = toCardId(card);
                          return (
                            <div key={id} className="relative cursor-pointer transition hover:scale-105" onClick={() => tcg.handleToggleCard(id)}
                              onMouseEnter={(e) => { tcg.onCardHover(card, e); }}
                              onMouseLeave={tcg.onCardHoverLeave}>
                              <ArenaPortraitCard card={card} size="compact" showIvLine={false} />
                            </div>
                          );
                        })}
                      </div>
                      {tcg.filteredDeckCards.length === 0 ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">No cards match your search.</p>
                      ) : null}
                    </>
                  )}
                  <div className="flex gap-2 justify-center">
                    {tcg.selectedDeck.size > 0 ? (
                      <button onClick={() => { tcg.setSelectedDeck(new Set()); saveDeck([]); }} className="arena-redraw-button hover:animate-wiggle text-xs">
                        [ Clear deck ]
                      </button>
                    ) : null}
                  </div>
                </div>
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
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
}
