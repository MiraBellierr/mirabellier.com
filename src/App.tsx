import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";

// Eagerly load critical routes (Home, Blog) for faster initial load
import Home from "./pages/Home";
import Blog from "./pages/Blog";

// Lazy load non-critical routes to reduce initial bundle size
const About = lazy(() => import("./pages/About"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const BlogEdit = lazy(() => import("./pages/BlogEdit"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Guestbook = lazy(() => import("./pages/Guestbook"));
const GuestbookSign = lazy(() => import("./pages/GuestbookSign"));
const AdminAnime = lazy(() => import("./pages/AdminAnime"));
const Login = lazy(() => import("./pages/Login"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

// Lazy load cursor manager - visual enhancement, not critical for content
const CursorManager = lazy(() => import("./parts/CursorManager"));
import { CursorProvider } from "./states/CursorContext";
import { AuthProvider } from "./states/AuthContext";

function App() {
  return (
    <div>
      <CursorProvider>
        <AuthProvider>
          <Suspense fallback={null}>
            <CursorManager />
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
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/spill" element={<Home />} />
              <Route path="/home" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/guestbook" element={<Guestbook />} />
              <Route path="/guestbook/sign" element={<GuestbookSign />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/blog/edit" element={<BlogEdit />} />
              <Route path="/admin/anime" element={<AdminAnime />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:username" element={<Profile />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </CursorProvider>
    </div>
  );
}

export default App;
