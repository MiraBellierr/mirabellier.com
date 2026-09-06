import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useConfirm } from "@/states/ConfirmContext";
import {
  normalizeArenaError,
  type ArenaSkillNode,
  type ArenaSkillTreeResponse,
  activateArenaSkill,
  fetchArenaSkillTree,
  resetArenaSkillTree,
} from "@/lib/arena";
import { usePageSeo } from "@/lib/seo";


function hasStats(node: ArenaSkillNode) {
  return Object.values(node.statBonus).some((value) => value !== 0);
}

const ArenaSkillTree = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const { confirm } = useConfirm();

  const [tree, setTree] = useState<ArenaSkillTreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/skill-tree",
    structuredDataId: "arena-skill-tree-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Skill Tree",
      description:
        "Spend arena level-up points across offense, defense, and utility skills.",
      url: "https://mirabellier.com/arena/skill-tree",
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setTree(null);
      return () => {
        cancelled = true;
      };
    }

    const loadTree = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaSkillTree(token);
        if (!cancelled) setTree(payload);
      } catch (error) {
        if (!cancelled) setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadTree();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const allocated = useMemo(
    () => new Set(tree?.allocations.map((entry) => entry.nodeId) || []),
    [tree],
  );
  const nodesById = useMemo(
    () => new Map(tree?.nodes.map((node) => [node.id, node]) || []),
    [tree],
  );
  const branchChains = useMemo(() => {
    if (!tree) return [];
    return tree.branches.map((branch) => {
      const branchNodes = tree.nodes.filter((node) => node.branch === branch.id);
      const chainIds = [...new Set(branchNodes.map((node) => node.chain))];
      return {
        ...branch,
        chains: chainIds.map((chainId) => ({
          id: chainId,
          name:
            branchNodes.find((node) => node.chain === chainId)?.chainName ||
            chainId,
          nodes: branchNodes
            .filter((node) => node.chain === chainId)
            .sort((a, b) => a.tier - b.tier),
        })),
      };
    });
  }, [tree]);
  const canActivate = (node: ArenaSkillNode) =>
    !allocated.has(node.id) &&
    tree !== null &&
    tree.availablePoints > 0 &&
    (!node.prerequisiteId || allocated.has(node.prerequisiteId));

  const handleActivate = async (node: ArenaSkillNode) => {
    if (!token || !canActivate(node)) return;
    const shouldActivate = await confirm({
      title: `Activate ${node.name}?`,
      message: (
        <div className="space-y-2">
          <p>{node.description}</p>
          <p className="text-sm">
            This permanently spends 1 skill point until you reset the skill
            tree.
          </p>
        </div>
      ),
      confirmLabel: "Activate skill",
      cancelLabel: "Cancel",
    });
    if (!shouldActivate) return;

    setActioning(`activate:${node.id}`);
    setErrorMessage(null);
    try {
      setTree(await activateArenaSkill(token, node.id));
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioning(null);
    }
  };

  const handleReset = async () => {
    if (!token || !tree || tree.spentPoints === 0) return;
    if (
      !window.confirm(
        `Reset all ${tree.spentPoints} activated skills for ${tree.resetCost.toLocaleString()} coins?`,
      )
    ) {
      return;
    }
    setActioning("reset");
    setErrorMessage(null);
    try {
      const payload = await resetArenaSkillTree(token);
      setTree(payload);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full min-w-0 space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/70 p-3 sm:p-4">
              <div>
                <h2 className="text-4xl font-bold text-blue-900">
                  Skill Tree {`>^. .^<`}
                </h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Shape your champion
                  with your chosen skills.{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <ArenaSubNav />

              {tree ? (
                <div className="border-y border-sky-500 p-2 text-sm font-bold text-blue-950">
                  <p className="mb-2 text-lg font-semibold underline">
                    Skill Points
                  </p>
                  <div className="flex-row flex-wrap items-center gap-x-5 gap-y-2">
                    <p>
                      <span className="font-normal">✦ Level</span>{" "}
                      <span className="font-black text-blue-600">{tree.level}</span>
                    </p>
                    <p>
                      <span className="font-normal">✦ Available</span>{" "}
                      <span className="font-black text-blue-600">
                        {tree.availablePoints}
                      </span>
                    </p>
                    <p>
                      <span className="font-normal">✦ Spent</span>{" "}
                      <span className="font-black text-blue-600">
                        {tree.spentPoints} / {tree.earnedPoints}
                      </span>
                    </p>
                    <p>
                      <span className="font-normal">✦ Coins</span>{" "}
                      <span className="font-black text-blue-600">
                        {tree.coins.toLocaleString()} 🪙
                      </span>
                    </p>
                    <button
                      type="button"
                      className="arena-redraw-button disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={tree.spentPoints === 0 || actioning !== null}
                      onClick={() => void handleReset()}
                    >
                      {actioning === "reset"
                        ? "[ Resetting... ]"
                        : `[ Reset ${tree.resetCost.toLocaleString()} ]`}
                    </button>
                  </div>
                </div>
              ) : null}

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  <p className="font-semibold">Login is required to use the skill tree.</p>
                  <Link to="/login" className="mt-2 inline-block underline dark:text-white">
                    go to login
                  </Link>
                </div>
              ) : loading && !tree ? (
                <p className="text-blue-500">Loading skill tree...</p>
              ) : tree ? (
                <>
                  <div className="space-y-5 p-3">
                    {branchChains.map((branch) => (
                      <section key={branch.id}>
                        <h3 className="mb-3 text-center text-sm font-black uppercase tracking-[0.15em] text-blue-900 dark:text-sky-200">
                          {branch.name}
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-3">
                          {branch.chains.map((chain) => (
                            <div key={chain.id} className="flex flex-col items-center">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                {chain.name}
                              </p>
                              <div className="h-4 w-px bg-slate-500" aria-hidden="true" />
                              {chain.nodes.map((node, index) => {
                                return (
                                  <div
                                    key={node.id}
                                    className="group relative flex flex-col items-center"
                                  >
                                    <button
                                      type="button"
                                      className={[
                                        "min-w-24 bg-transparent px-1 py-1 text-[11px] font-black uppercase text-blue-900 transition hover:underline disabled:cursor-not-allowed dark:text-white",
                                        allocated.has(node.id)
                                          ? "line-through decoration-2"
                                          : "",
                                      ].join(" ")}
                                      aria-label={`${node.name}: ${node.description}`}
                                      onDoubleClick={() => void handleActivate(node)}
                                    >
                                      [ {chain.name} {node.tier} ]
                                    </button>
                                    <div
                                      className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-950 p-3 text-left normal-case text-white shadow-xl group-hover:block group-focus-within:block"
                                      role="tooltip"
                                    >
                                      <p className="font-black">{node.name}</p>
                                      <p className="text-[10px] font-bold uppercase text-slate-400">
                                        {node.branchName} · {node.chainName} tier{" "}
                                        {node.tier}
                                      </p>
                                      <p className="mt-2 text-xs leading-relaxed text-slate-100">
                                        {node.description}
                                      </p>
                                      {node.prerequisiteId ? (
                                        <p className="mt-2 text-xs text-slate-300">
                                          Requires:{" "}
                                          {nodesById.get(node.prerequisiteId)?.name ||
                                            node.prerequisiteId}
                                        </p>
                                      ) : null}
                                      {hasStats(node) ? (
                                        <p className="mt-1 text-xs font-semibold text-slate-200">
                                          Permanent stat bonus
                                        </p>
                                      ) : null}
                                    </div>
                                    {index < chain.nodes.length - 1 ? (
                                      <div
                                        className="h-5 w-px bg-slate-500"
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              ) : null}

              {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  skill tree tips
                </h2>
                <p>Earn one skill point whenever your Arena level increases.</p>
                <p>Each skill requires the previous skill in its vertical chain.</p>
                <p>You can freely mix Offense, Utility, and Defense skills.</p>
                <p>Double-click an available skill to activate it quickly.</p>
                <p>Resetting refunds every spent point and costs coins.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaSkillTree;
