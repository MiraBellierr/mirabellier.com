import { useEffect, useMemo, useRef, useState } from "react";

import AsyncStateCard from "@/components/AsyncStateCard";
import AnimeSticker from "@/components/AnimeSticker";
import anime4Gif from "@/assets/anime/anime4.webp";
import anime4Poster from "@/assets/anime/anime4-poster.webp";
import { usePageSeo } from "@/lib/seo";
import { getFriendlyFetchMessage } from "@/lib/friendly-fetch-message";
import {
  HSR_ELEMENTS,
  HSR_PATHS,
  HSR_TEAM_MODES,
  fetchHsrRoster,
  fetchHsrTeamIndex,
  hsrImageUrl,
  type HsrCharacter,
  type HsrIndexedTeam,
  type HsrRosterPayload,
  type HsrTeamIndexPayload,
  type HsrTeamMode,
  type HsrTeamModeKey,
} from "@/lib/hsr-api";
import {
  buildPlannerState,
  parseStoredPlannerState,
  teamMembers,
  type LockedTeam,
  type StoredPlannerState,
  type TeamsByMode,
} from "@/lib/hsr-planner";

import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";

const HSR_DESCRIPTION =
  "Pick the Honkai: Star Rail characters you own and get every team you can build, ranked by prydwen.gg. Lock a team and the next one uses only what is left.";

const STORAGE_KEY = "hsr-planner:v1";
const DEFAULT_MODE: HsrTeamModeKey = "moc";

function readStored(): StoredPlannerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parseStoredPlannerState(raw ? JSON.parse(raw) : null, DEFAULT_MODE);
  } catch {
    return { owned: [], locked: [], mode: DEFAULT_MODE };
  }
}

function writeStored(state: StoredPlannerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota); the planner still works for
    // this session.
  }
}

function formatRate(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function formatScore(value: number | null) {
  return value === null ? "no data" : String(value);
}

function formatUpdated(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(parsed),
  );
}

type CharacterLookup = Map<string, HsrCharacter>;

/**
 * Square character tile for a lineup: the icon with its element badge and a
 * name plate along the bottom.
 */
function LineupTile({
  slug,
  lookup,
  highlight = false,
}: {
  slug: string;
  lookup: CharacterLookup;
  highlight?: boolean;
}) {
  const character = lookup.get(slug);
  const icon = hsrImageUrl(character?.images.icon);
  const elementIcon = hsrImageUrl(character?.images.elementIcon);
  const label = character?.name ?? slug;

  return (
    <span
      className={`relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg border ${
        highlight ? "border-pink-400 ring-2 ring-pink-200" : "border-blue-200"
      }`}
      title={character?.role ? `${label} · ${character.role}` : label}
    >
      {icon ? (
        <img
          src={icon}
          alt={label}
          className="h-full w-full object-cover"
          width="80"
          height="80"
          loading="lazy"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-blue-50 px-1 text-center text-[9px] font-bold text-blue-400">
          {label}
        </span>
      )}

      {elementIcon ? (
        <img
          src={elementIcon}
          alt=""
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 h-4 w-4 drop-shadow"
          width="16"
          height="16"
          loading="lazy"
        />
      ) : null}

      {/* Name plate along the bottom, like the in-game team bar. */}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-[2px] text-center text-[9px] font-bold leading-tight text-white">
        {label}
      </span>
    </span>
  );
}

function TeamLineup({
  slugs,
  lookup,
  highlightSlug,
}: {
  slugs: string[];
  lookup: CharacterLookup;
  highlightSlug?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.map((slug) => (
        <LineupTile
          key={slug}
          slug={slug}
          lookup={lookup}
          highlight={slug === highlightSlug}
        />
      ))}
    </div>
  );
}

function TeamCard({
  team,
  lookup,
  mode,
  rank,
  onLock,
}: {
  team: HsrIndexedTeam;
  lookup: CharacterLookup;
  mode: HsrTeamMode;
  rank: number;
  onLock: () => void;
}) {
  return (
    <li className="rounded-xl border border-blue-100 bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-500">
        <span>
          <span className="font-bold text-blue-700">#{rank}</span>
          {team.rank !== null ? (
            <span className="text-blue-400"> · prydwen rank {team.rank}</span>
          ) : null}
          {team.appRate !== null ? (
            <span> · app. rate {formatRate(team.appRate)}</span>
          ) : null}
        </span>
        <span className="text-right">
          {mode.scoreLabel}: <strong>{formatScore(team.avgRound)}</strong>
          {team.avgRoundE1 !== null ? (
            <span className="text-blue-400">
              {" "}
              · E1+: <strong>{formatScore(team.avgRoundE1)}</strong>
            </span>
          ) : null}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TeamLineup slugs={teamMembers(team)} lookup={lookup} />
        <button
          type="button"
          onClick={onLock}
          className="ml-auto rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-pink-600"
        >
          lock team
        </button>
      </div>
    </li>
  );
}

const HsrTeams = () => {
  const [roster, setRoster] = useState<HsrRosterPayload | null>(null);
  const [index, setIndex] = useState<HsrTeamIndexPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const initial = useRef<StoredPlannerState | null>(null);
  if (initial.current === null) initial.current = readStored();

  const [owned, setOwned] = useState<Set<string>>(
    () => new Set(initial.current!.owned),
  );
  const [locked, setLocked] = useState<LockedTeam[]>(
    () => initial.current!.locked,
  );
  const [mode, setMode] = useState<HsrTeamModeKey>(
    () => initial.current!.mode as HsrTeamModeKey,
  );

  const [search, setSearch] = useState("");
  const [element, setElement] = useState("all");
  const [path, setPath] = useState("all");
  const [showPicker, setShowPicker] = useState(true);

  usePageSeo({
    canonical: "https://mirabellier.com/hsr",
    structuredDataId: "hsr-teams-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Honkai: Star Rail Team Planner",
      description: HSR_DESCRIPTION,
      url: "https://mirabellier.com/hsr",
      isPartOf: {
        "@type": "WebSite",
        name: "Mirabellier",
        url: "https://mirabellier.com",
      },
    },
    socialMeta: {
      title: "Star Rail Team Planner | Mirabellier",
      description: HSR_DESCRIPTION,
      url: "https://mirabellier.com/hsr",
      image: "https://mirabellier.com/og-image.jpg",
      type: "website",
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetchHsrRoster(controller.signal),
      fetchHsrTeamIndex(controller.signal),
    ])
      .then(([rosterData, indexData]) => {
        if (controller.signal.aborted) return;
        setRoster(rosterData);
        setIndex(indexData);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load teams");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadTick]);

  useEffect(() => {
    writeStored({ owned: [...owned], locked, mode });
  }, [owned, locked, mode]);

  const friendlyError = useMemo(
    () => getFriendlyFetchMessage("Star Rail teams", error),
    [error],
  );

  const lookup = useMemo(() => {
    const map = new Map<string, HsrCharacter>();
    for (const character of roster?.characters ?? []) {
      map.set(character.slug, character);
    }
    return map;
  }, [roster]);

  // Every mode's team list, so a lock consumes its members globally rather
  // than only in the mode it was locked from.
  const teamsByMode: TeamsByMode = useMemo(() => {
    const map: TeamsByMode = {};
    for (const key of Object.keys(index?.modes ?? {})) {
      map[key] = index?.modes?.[key as HsrTeamModeKey]?.teams ?? [];
    }
    return map;
  }, [index]);

  const activeMode: HsrTeamMode | null = index?.modes?.[mode] ?? null;

  const planner = useMemo(
    () => buildPlannerState({ owned, locked, teamsByMode, mode }),
    [owned, locked, teamsByMode, mode],
  );

  const lockedIdsHere = useMemo(
    () => new Set(locked.map((entry) => entry.id)),
    [locked],
  );

  // Each lock paired with its resolved team so the card can show stats and
  // which mode the lock came from.
  const lockedCards = useMemo(() => {
    const modeLabel = (entry: LockedTeam) =>
      index?.modes?.[entry.mode as HsrTeamModeKey]?.label ?? entry.mode;

    return locked.map((entry) => ({
      entry,
      team: planner.locked.find((team) => team.id === entry.id) ?? null,
      modeLabel: modeLabel(entry),
    }));
  }, [locked, planner.locked, index]);

  const filteredCharacters = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (roster?.characters ?? []).filter((character) => {
      if (needle && !character.name.toLowerCase().includes(needle)) return false;
      if (element !== "all" && character.element !== element) return false;
      if (path !== "all" && character.path !== path) return false;
      return true;
    });
  }, [roster, search, element, path]);

  const toggleOwned = (slug: string) => {
    setOwned((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const lockTeam = (team: HsrIndexedTeam) => {
    if (lockedIdsHere.has(team.id)) return;
    setLocked((current) => [...current, { id: team.id, mode }]);
  };

  const unlockTeam = (teamId: string) => {
    setLocked((current) => current.filter((entry) => entry.id !== teamId));
  };

  const updated = formatUpdated(roster?.sourceLastUpdated ?? null);
  const teamCount = activeMode?.teams.length ?? 0;
  const candidateCount = planner.candidates.length;

  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-fixed bg-no-repeat"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <div className="relative">
              <img
                className="pointer-events-none absolute h-14 w-14 object-contain"
                src="/flower.webp"
                width="56"
                height="56"
                alt=""
                aria-hidden="true"
                style={{ top: "-18px", right: "-10px", zIndex: 2 }}
              />

              <section className="card-border space-y-4 bg-white/55 p-4">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-blue-700">
                    star rail team planner
                  </h2>
                  <p className="text-sm text-blue-500">{HSR_DESCRIPTION}</p>
                  {updated ? (
                    <p className="text-xs font-medium text-blue-400">
                      Teams from prydwen.gg, last updated {updated}
                    </p>
                  ) : null}
                </div>

                {loading ? (
                  <AsyncStateCard
                    variant="loading"
                    title="Loading teams..."
                    message="Fetching the roster and team index from the API."
                  />
                ) : error ? (
                  <AsyncStateCard
                    variant="error"
                    title={friendlyError.title}
                    message={friendlyError.message}
                    detail={friendlyError.detail}
                    actionLabel="Retry"
                    onAction={() => setReloadTick((value) => value + 1)}
                  />
                ) : (
                  <>
                    {/* 1. What do you own? */}
                    <div className="rounded-xl border border-blue-100 bg-white/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg font-bold text-blue-700">
                          1. pick your characters
                        </h3>
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="planner-pill planner-pill--available">
                            {planner.available.size} available
                          </span>
                          {planner.used.size > 0 ? (
                            <span className="planner-pill planner-pill--locked">
                              {planner.used.size} locked
                            </span>
                          ) : null}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-blue-400">
                        Tap a character to mark it as owned. Selected characters
                        are highlighted pink; ones already locked into a team
                        are greyed out.
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPicker((value) => !value)}
                          className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-500 transition hover:bg-blue-50"
                        >
                          {showPicker ? "hide picker" : "show picker"}
                        </button>
                        <button
                          type="button"
                          disabled={owned.size === 0}
                          onClick={() => {
                            setOwned(new Set());
                            setLocked([]);
                          }}
                          className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-500 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          clear all
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOwned(
                              new Set(
                                (roster?.characters ?? [])
                                  .filter((character) => character.isReleased)
                                  .map((character) => character.slug),
                              ),
                            )
                          }
                          className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-500 transition hover:bg-blue-50"
                        >
                          select everyone
                        </button>
                      </div>

                      {showPicker ? (
                        <>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <input
                              value={search}
                              onChange={(event) =>
                                setSearch(event.target.value)
                              }
                              placeholder="search name"
                              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                            />
                            <select
                              value={element}
                              onChange={(event) =>
                                setElement(event.target.value)
                              }
                              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-pink-300"
                            >
                              <option value="all">all elements</option>
                              {HSR_ELEMENTS.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            <select
                              value={path}
                              onChange={(event) => setPath(event.target.value)}
                              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-pink-300"
                            >
                              <option value="all">all paths</option>
                              {HSR_PATHS.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-2 grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
                            {filteredCharacters.map((character) => {
                              const isUsed = planner.used.has(character.slug);
                              const isOwned =
                                owned.has(character.slug) && !isUsed;
                              const icon = hsrImageUrl(character.images.icon);

                              return (
                                <button
                                  key={character.slug}
                                  type="button"
                                  onClick={() => toggleOwned(character.slug)}
                                  aria-pressed={isOwned}
                                  title={
                                    isUsed
                                      ? `${character.name} is locked into a team`
                                      : isOwned
                                        ? `${character.name} is selected`
                                        : `Select ${character.name}`
                                  }
                                  className={`relative flex items-center gap-2 rounded-lg border p-1.5 text-left transition ${
                                    isUsed
                                      ? "planner-char--used border-amber-300 bg-amber-50/80"
                                      : isOwned
                                        ? "planner-char--owned border-pink-400 bg-pink-100 ring-2 ring-pink-200"
                                        : "border-blue-100 bg-white/70 hover:border-blue-200 hover:bg-white"
                                  }`}
                                >
                                  <span className="relative shrink-0">
                                    {icon ? (
                                      <img
                                        src={icon}
                                        alt=""
                                        aria-hidden="true"
                                        className={`h-8 w-8 rounded-md border object-cover ${
                                          isUsed
                                            ? "border-amber-200 opacity-70 grayscale"
                                            : isOwned
                                              ? "border-pink-300"
                                              : "border-blue-100 opacity-80"
                                        }`}
                                        width="32"
                                        height="32"
                                        loading="lazy"
                                      />
                                    ) : null}

                                    {isOwned ? (
                                      <span
                                        aria-hidden="true"
                                        className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-pink-500 text-[9px] font-black leading-none text-white shadow-sm"
                                      >
                                        ✓
                                      </span>
                                    ) : null}
                                    {isUsed ? (
                                      <span
                                        aria-hidden="true"
                                        className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] leading-none text-white shadow-sm"
                                      >
                                        🔒
                                      </span>
                                    ) : null}
                                  </span>

                                  <span className="min-w-0 flex-1">
                                    <span
                                      className={`planner-char-name block truncate text-xs font-bold ${
                                        isUsed
                                          ? "text-amber-700"
                                          : isOwned
                                            ? "text-pink-700"
                                            : "text-blue-700"
                                      }`}
                                    >
                                      {character.name}
                                    </span>
                                    <span
                                      className={`planner-char-meta block truncate text-[10px] ${
                                        isUsed
                                          ? "text-amber-600/80"
                                          : isOwned
                                            ? "text-pink-600/80"
                                            : "text-blue-400"
                                      }`}
                                    >
                                      {isUsed ? "locked in a team" : character.element}
                                      {isUsed ? "" : ` · ${character.path}`}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                            {filteredCharacters.length === 0 ? (
                              <p className="col-span-full p-2 text-sm text-blue-500">
                                No character matches those filters.
                              </p>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>

                    {/* 2. Ranked teams you can build */}
                    <div className="rounded-xl border border-blue-100 bg-white/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg font-bold text-blue-700">
                          2. teams you can build
                        </h3>
                        <span className="text-xs text-blue-500">
                          {candidateCount} of {teamCount}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {HSR_TEAM_MODES.map((entry) => {
                          const active = mode === entry.key;
                          const modeData = index?.modes?.[entry.key];
                          const phase = index?.phases?.[entry.key];

                          return (
                            <button
                              key={entry.key}
                              type="button"
                              onClick={() => setMode(entry.key)}
                              aria-pressed={active}
                              title={phase?.phase || undefined}
                              className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                                active
                                  ? "border-pink-300 bg-pink-100 text-pink-700"
                                  : "border-blue-200 bg-white/70 text-blue-500 hover:bg-blue-50"
                              }`}
                            >
                              {entry.label}
                              <span className="ml-1 text-xs font-normal opacity-70">
                                {modeData?.count ?? 0}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {owned.size === 0 ? (
                        <AsyncStateCard
                          className="mt-3"
                          variant="empty"
                          title="Pick your characters first"
                          message="Select the characters you own above, and every team you can build shows up here."
                        />
                      ) : candidateCount === 0 ? (
                        <AsyncStateCard
                          className="mt-3"
                          variant="empty"
                          title="No complete teams left"
                          message="Nothing you own matches a full four-character team in this mode. Unlock a team or add more characters."
                        />
                      ) : (
                        <ol className="mt-3 space-y-2">
                          {planner.candidates
                            .slice(0, 20)
                            .map((team, order) => (
                              <TeamCard
                                key={team.id}
                                team={team}
                                lookup={lookup}
                                mode={activeMode ?? {
                                  key: mode,
                                  label: mode,
                                  scoreLabel: "Avg. score",
                                  count: 0,
                                  teams: [],
                                }}
                                rank={order + 1}
                                onLock={() => lockTeam(team)}
                              />
                            ))}
                        </ol>
                      )}

                      {candidateCount > 20 ? (
                        <p className="mt-2 text-xs text-blue-400">
                          Showing the top 20 of {candidateCount} teams. Lock one
                          to see the next best options.
                        </p>
                      ) : null}
                    </div>

                    {/* 3. Locked teams */}
                    <div className="rounded-xl border border-blue-100 bg-white/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg font-bold text-blue-700">
                          3. locked teams
                        </h3>
                        <span className="text-xs text-blue-500">
                          {planner.used.size} characters used
                        </span>
                      </div>

                      {locked.length === 0 ? (
                        <p className="mt-2 text-sm text-blue-500">
                          Nothing locked yet. Lock a team above and its
                          characters stop appearing in the suggestions.
                        </p>
                      ) : (
                        <ol className="mt-2 space-y-2">
                          {lockedCards.map(({ entry, team, modeLabel }) => {
                            const isStranded = planner.stranded.some(
                              (stranded) => stranded.id === entry.id,
                            );

                            return (
                              <li
                                key={entry.id}
                                className={`rounded-xl border p-3 ${
                                  isStranded
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-pink-200 bg-pink-50/60"
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-blue-500">
                                    <span className="font-bold text-blue-700">
                                      {team && team.rank !== null
                                        ? `prydwen rank ${team.rank}`
                                        : "locked"}
                                    </span>
                                    <span className="text-blue-400">
                                      {" "}
                                      · from {modeLabel}
                                    </span>
                                    {team && team.appRate !== null ? (
                                      <span>
                                        {" "}
                                        · app. rate {formatRate(team.appRate)}
                                      </span>
                                    ) : null}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => unlockTeam(entry.id)}
                                    className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-500 transition hover:bg-blue-50"
                                  >
                                    unlock
                                  </button>
                                </div>

                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                  <TeamLineup
                                    slugs={entry.id.split("|")}
                                    lookup={lookup}
                                  />
                                </div>

                                {isStranded ? (
                                  <p className="mt-2 text-xs text-amber-700">
                                    You no longer own every member of this team.
                                    Unlock it to free the slots.
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>

            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  about this planner
                </h2>
                <p>
                  Teams are ranked by prydwen.gg usage data. Pick the characters
                  you own, take the best team, lock it, and repeat with what is
                  left.
                </p>
                <p className="text-xs text-blue-400">
                  Your picks are saved in this browser only.
                </p>
              </div>
            </div>

            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-xs text-blue-500">
                <h3 className="text-center text-sm font-bold text-blue-700">
                  what the numbers mean
                </h3>
                <p>
                  <strong>app. rate</strong> — share of runs using this exact
                  team.
                </p>
                <p>
                  <strong>{activeMode?.scoreLabel ?? "avg. score"}</strong> —
                  average result for the lineup.{" "}
                  {mode === "moc" || mode === "aa"
                    ? "Lower is better here."
                    : "Higher is better here."}
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <AnimeSticker
                className="w-full max-w-[220px] rounded-xl"
                animatedSrc={anime4Gif}
                posterSrc={anime4Poster}
                width="480"
                height="270"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default HsrTeams;
