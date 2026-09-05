import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { usePageSeo } from "@/lib/seo";
import { consumePostLoginRedirect } from "@/lib/post-login-redirect";

const AuthCallback = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const startedRef = useRef(false);

  usePageSeo({ canonical: "https://mirabellier.com/auth/callback" });

  useEffect(() => {
    // `auth` gets a fresh identity when `handleAuthCallback` sets the user,
    // which re-runs this effect. Run the redirect logic exactly once, and read
    // the stored target *before* the await — consuming it is destructive, so a
    // second pass would see nothing and fall back to "/".
    if (startedRef.current) return;
    startedRef.current = true;

    const target = consumePostLoginRedirect() ?? "/";

    auth
      .handleAuthCallback()
      .then(() => {
        navigate(target, { replace: true });
      })
      .catch(() => {
        navigate("/login?error=callback_failed", { replace: true });
      });
  }, [auth, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="text-center">
        <div className="text-4xl mb-4">🌸</div>
        <p className="text-blue-600">Completing Discord authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
