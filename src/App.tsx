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
const Arena = lazy(() => import("./pages/Arena"));
const ArenaFight = lazy(() => import("./pages/ArenaFight"));
const ArenaShop = lazy(() => import("./pages/ArenaShop"));
const ArenaCrafting = lazy(() => import("./pages/ArenaCrafting"));
const ArenaInventory = lazy(() => import("./pages/ArenaInventory"));
const ArenaLeaderboard = lazy(() => import("./pages/ArenaLeaderboard"));
const ArenaCollection = lazy(() => import("./pages/ArenaCollection"));
const ArenaMarket = lazy(() => import("./pages/ArenaMarket"));
const ArenaSkillTree = lazy(() => import("./pages/ArenaSkillTree"));
const Guestbook = lazy(() => import("./pages/Guestbook"));
const GuestbookSign = lazy(() => import("./pages/GuestbookSign"));
const QuestionOfTheDay = lazy(() => import("./pages/QuestionOfTheDay"));
const QuestionArchive = lazy(() => import("./pages/QuestionArchive"));
const QuestionArchiveDay = lazy(() => import("./pages/QuestionArchiveDay"));
const AdminHome = lazy(() => import("./pages/AdminHome"));
const AdminArenaUpdates = lazy(() => import("./pages/AdminArenaUpdates"));
const AdminQuestionOfTheDay = lazy(
  () => import("./pages/AdminQuestionOfTheDay"),
);
const AdminShrines = lazy(() => import("./pages/AdminShrines"));
const AdminShrinePreview = lazy(() => import("./pages/AdminShrinePreview"));
const ShrineEntry = lazy(() => import("./pages/ShrineEntry"));
const Login = lazy(() => import("./pages/Login"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const CursorManager = lazy(() => import("./parts/CursorManager"));
const InteractiveUiChrome = lazy(() => import("./parts/InteractiveUiChrome"));

import { CursorProvider } from "./states/CursorContext";
import { AuthProvider } from "./states/AuthContext";

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
      <Route path="/arena" element={<Arena />} />
      <Route path="/arena/fight" element={<ArenaFight />} />
      <Route path="/arena/shop" element={<ArenaShop />} />
      <Route path="/arena/crafting" element={<ArenaCrafting />} />
      <Route path="/arena/inventory" element={<ArenaInventory />} />
      <Route path="/arena/leaderboard" element={<ArenaLeaderboard />} />
      <Route path="/arena/collection" element={<ArenaCollection />} />
      <Route path="/arena/market" element={<ArenaMarket />} />
      <Route path="/arena/skill-tree" element={<ArenaSkillTree />} />
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
      <Route
        path="/admin/question-of-the-day"
        element={<AdminQuestionOfTheDay />}
      />
      <Route path="/admin/shrines" element={<AdminShrines />} />
      <Route path="/admin/shrines/preview" element={<AdminShrinePreview />} />
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
    <div>
      <CursorProvider>
        <AuthProvider>
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
        </AuthProvider>
      </CursorProvider>
    </div>
  );
}

export default App;
