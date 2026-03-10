import { Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef } from "react";

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
import { ConfirmProvider, useConfirm } from "./states/ConfirmContext";
import { ToastProvider } from "./states/ToastContext";
import GuestbookReminder from "./parts/GuestbookReminder";

function ExternalLinkWarning() {
  const { confirm } = useConfirm();
  const isPromptOpenRef = useRef(false);

  useEffect(() => {
    const handleClick = async (event: MouseEvent) => {
      if (event.defaultPrevented || isPromptOpenRef.current) return;
      if (!(event.target instanceof Element)) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      const isHttpLink = url.protocol === "http:" || url.protocol === "https:";

      if (!isHttpLink || url.origin === window.location.origin) {
        return;
      }

      event.preventDefault();
      isPromptOpenRef.current = true;

      try {
        const shouldContinue = await confirm({
          title: "External Link Warning",
          message: `You are leaving mirabellier.com and opening ${url.hostname}. External websites can be malicious, misleading, or unsafe. Continue only if you trust this destination.`,
          confirmLabel: "Take a risk",
          cancelLabel: "Cancel",
        });

        if (!shouldContinue) {
          return;
        }

        const target = anchor.target === "_blank" ? "_blank" : "_self";
        if (target === "_blank") {
          window.open(url.href, "_blank", "noopener,noreferrer");
          return;
        }

        window.location.assign(url.href);
      } finally {
        isPromptOpenRef.current = false;
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [confirm]);

  return null;
}

function App() {
  return (
    <div>
      <CursorProvider>
        <AuthProvider>
          <ConfirmProvider>
            <ToastProvider>
              <ExternalLinkWarning />
              <GuestbookReminder />

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
            </ToastProvider>
          </ConfirmProvider>
        </AuthProvider>
      </CursorProvider>
    </div>
  );
}

export default App;
