import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";

import Home from "./pages/Home";

const Blog = lazy(() => import("./pages/Blog"));
const About = lazy(() => import("./pages/About"));
const Projects = lazy(() => import("./pages/Projects"));
const Shrine = lazy(() => import("./pages/Shrine"));
const Kanna = lazy(() => import("./pages/Kanna"));
const Rossina = lazy(() => import("./pages/Rossina"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const BlogEdit = lazy(() => import("./pages/BlogEdit"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Anime = lazy(() => import("./pages/Anime"));
const Fanart = lazy(() => import("./pages/Fanart"));
const Twitch = lazy(() => import("./pages/Twitch"));
const Arena = lazy(() => import("./pages/Arena"));
const ArenaFight = lazy(() => import("./pages/ArenaFight"));
const ArenaHallOfFame = lazy(() => import("./pages/ArenaHallOfFame"));
const ArenaShop = lazy(() => import("./pages/ArenaShop"));
const ArenaInventory = lazy(() => import("./pages/ArenaInventory"));
const ArenaInbox = lazy(() => import("./pages/ArenaInbox"));
const ArenaLeaderboard = lazy(() => import("./pages/ArenaLeaderboard"));
const ArenaCollection = lazy(() => import("./pages/ArenaCollection"));
const ArenaArchive = lazy(() => import("./pages/ArenaArchive"));
const ArenaMarket = lazy(() => import("./pages/ArenaMarket"));
const ArenaMint = lazy(() => import("./pages/ArenaMint"));
const ArenaSkillTree = lazy(() => import("./pages/ArenaSkillTree"));
const ArenaTrade = lazy(() => import("./pages/ArenaTrade"));
const TcgDecks = lazy(() => import("./pages/TcgDecks"));
const TcgMatch = lazy(() => import("./pages/TcgMatch"));
const Guestbook = lazy(() => import("./pages/Guestbook"));
const GuestbookSign = lazy(() => import("./pages/GuestbookSign"));
const QuestionOfTheDay = lazy(() => import("./pages/QuestionOfTheDay"));
const QuestionArchive = lazy(() => import("./pages/QuestionArchive"));
const QuestionArchiveDay = lazy(() => import("./pages/QuestionArchiveDay"));
const AdminHome = lazy(() => import("./pages/AdminHome"));
const AdminArenaUpdates = lazy(() => import("./pages/AdminArenaUpdates"));
const AdminArenaMetrics = lazy(() => import("./pages/AdminArenaMetrics"));
const AdminQuestionOfTheDay = lazy(
  () => import("./pages/AdminQuestionOfTheDay"),
);
const AdminShrines = lazy(() => import("./pages/AdminShrines"));
const AdminShrinePreview = lazy(() => import("./pages/AdminShrinePreview"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminTwitch = lazy(() => import("./pages/AdminTwitch"));
const ShrineEntry = lazy(() => import("./pages/ShrineEntry"));
const Login = lazy(() => import("./pages/Login"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const CursorManager = lazy(() => import("./parts/CursorManager"));
const InteractiveUiChrome = lazy(() => import("./parts/InteractiveUiChrome"));
const ArenaCompensationPopup = lazy(
  () => import("./parts/ArenaCompensationPopup"),
);

import { CursorProvider } from "./states/CursorContext";
import { AuthProvider } from "./states/AuthContext";
import { WebSocketProvider } from "./states/WebSocketProvider";
import { ErrorBoundary } from "./parts/ErrorBoundary";

const HOME_CANONICAL_PATH = "/";
const HOME_ALIAS_PATHS = ["/home"] as const;
const HOME_PATHS = new Set<string>([HOME_CANONICAL_PATH, ...HOME_ALIAS_PATHS]);

function App() {
  const location = useLocation();
  const isHomePath = HOME_PATHS.has(location.pathname);
  const [showCursorManager, setShowCursorManager] = useState(false);

  useEffect(() => {
    let timeoutId: number | null = null;

    const enableCursorManager = () => {
      timeoutId = window.setTimeout(() => {
        setShowCursorManager(true);
      }, 1500);
    };

    if (document.readyState === "complete") {
      enableCursorManager();
    } else {
      window.addEventListener("load", enableCursorManager, { once: true });
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      window.removeEventListener("load", enableCursorManager);
    };
  }, []);

  const routeTree = (
    <Routes>
      <Route path={HOME_CANONICAL_PATH} element={<Home />} />
      {HOME_ALIAS_PATHS.map((path) => (
        <Route
          key={path}
          path={path}
          element={<Navigate to={HOME_CANONICAL_PATH} replace />}
        />
      ))}
      <Route path="/about" element={<About />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/anime" element={<Anime />} />
      <Route path="/fanart" element={<Fanart />} />
      <Route path="/twitch" element={<Twitch />} />
      <Route path="/arena" element={<Arena />} />
      <Route path="/arena/fight" element={<ArenaFight />} />
      <Route path="/arena/hall-of-fame" element={<ArenaHallOfFame />} />
      <Route path="/arena/shop" element={<ArenaShop />} />
      <Route path="/arena/inventory" element={<ArenaInventory />} />
      <Route path="/arena/inbox" element={<ArenaInbox />} />
      <Route path="/arena/leaderboard" element={<ArenaLeaderboard />} />
      <Route path="/arena/collection" element={<ArenaCollection />} />
      <Route path="/arena/archive" element={<ArenaArchive />} />
      <Route path="/arena/market" element={<ArenaMarket />} />
      <Route path="/arena/mint" element={<ArenaMint />} />
      <Route path="/arena/skill-tree" element={<ArenaSkillTree />} />
      <Route path="/arena/trade" element={<ArenaTrade />} />
      <Route path="/arena/tcg" element={<Navigate to="/arena/tcg/decks" replace />} />
      <Route path="/arena/tcg/decks" element={<TcgDecks />} />
      <Route path="/arena/tcg/match" element={<TcgMatch />} />
      <Route path="/ar" element={<Arena />} />
      <Route path="/ar/fight" element={<ArenaFight />} />
      <Route path="/ar/hall-of-fame" element={<ArenaHallOfFame />} />
      <Route path="/ar/shop" element={<ArenaShop />} />
      <Route path="/ar/inventory" element={<ArenaInventory />} />
      <Route path="/ar/inbox" element={<ArenaInbox />} />
      <Route path="/ar/leaderboard" element={<ArenaLeaderboard />} />
      <Route path="/ar/collection" element={<ArenaCollection />} />
      <Route path="/ar/archive" element={<ArenaArchive />} />
      <Route path="/ar/market" element={<ArenaMarket />} />
      <Route path="/ar/mint" element={<ArenaMint />} />
      <Route path="/ar/skill-tree" element={<ArenaSkillTree />} />
      <Route path="/ar/trade" element={<ArenaTrade />} />
      <Route path="/ar/tcg" element={<Navigate to="/ar/tcg/decks" replace />} />
      <Route path="/ar/tcg/decks" element={<TcgDecks />} />
      <Route path="/ar/tcg/match" element={<TcgMatch />} />
      <Route path="/staging/tcg" element={<Navigate to="/arena/tcg/decks" replace />} />
      <Route path="/shrine" element={<Shrine />} />
      <Route path="/shrine/kanna" element={<Kanna />} />
      <Route path="/shrine/rossina" element={<Rossina />} />
      <Route path="/shrine/:slug" element={<ShrineEntry />} />
      <Route path="/quotes" element={<Quotes />} />
      <Route path="/question-of-the-day" element={<QuestionOfTheDay />} />
      <Route
        path="/question-of-the-day/archive"
        element={<QuestionArchive />}
      />
      <Route
        path="/question-of-the-day/archive/:recordedDate"
        element={<QuestionArchiveDay />}
      />
      <Route path="/guestbook" element={<Guestbook />} />
      <Route path="/guestbook/sign" element={<GuestbookSign />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/blog/edit" element={<BlogEdit />} />
      <Route path="/admin" element={<AdminHome />} />
      <Route path="/admin/arena-updates" element={<AdminArenaUpdates />} />
      <Route path="/admin/arena-metrics" element={<AdminArenaMetrics />} />
      <Route
        path="/admin/question-of-the-day"
        element={<AdminQuestionOfTheDay />}
      />
      <Route path="/admin/shrines" element={<AdminShrines />} />
      <Route path="/admin/shrines/preview" element={<AdminShrinePreview />} />
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/twitch" element={<AdminTwitch />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/profile/:username" element={<Profile />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
    </Routes>
  );

  return (
    <ErrorBoundary>
      <div>
        <CursorProvider>
          <AuthProvider>
            <WebSocketProvider>
              <Suspense fallback={null}>
                <ArenaCompensationPopup />
              </Suspense>
              <Suspense fallback={null}>
                {showCursorManager ? <CursorManager /> : null}
              </Suspense>

              <Suspense
                fallback={
                  <div
                    style={{
                      minHeight: "100vh",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      contain: "layout style paint",
                    }}
                  >
                    Loading...
                  </div>
                }
              >
                {isHomePath ? (
                  routeTree
                ) : (
                  <InteractiveUiChrome>{routeTree}</InteractiveUiChrome>
                )}
              </Suspense>
            </WebSocketProvider>
          </AuthProvider>
        </CursorProvider>
      </div>
    </ErrorBoundary>
  );
}

export default App;
