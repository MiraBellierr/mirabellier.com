import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { usePageSeo } from "@/lib/seo";

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  usePageSeo({ canonical: "https://mirabellier.com/auth/callback" });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");

    if (token) {
      auth
        .handleAuthCallback(token)
        .then(() => {
          navigate("/");
        })
        .catch(() => {
          navigate("/login?error=callback_failed");
        });
    } else {
      navigate("/login?error=no_token");
    }
  }, [location, auth, navigate]);

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
