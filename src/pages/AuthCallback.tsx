import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { usePageSeo } from "@/lib/seo";

const AuthCallback = () => {
  const navigate = useNavigate();
  const auth = useAuth();

  usePageSeo({ canonical: "https://mirabellier.com/auth/callback" });

  useEffect(() => {
    auth
      .handleAuthCallback()
      .then(() => {
        navigate("/");
      })
      .catch(() => {
        navigate("/login?error=callback_failed");
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
