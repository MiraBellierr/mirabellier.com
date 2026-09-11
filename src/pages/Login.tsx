import { useEffect } from "react";

import { getDiscordAuthUrl } from "@/lib/discord-auth";
import { usePageSeo } from "@/lib/seo";

// Nothing links here anymore (login buttons go straight to Discord), but the
// route stays as a fallback for old bookmarks/links — it just forwards on.
const Login = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/login",
    structuredDataId: "login-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Login",
      description: "Login to Mirabellier",
      url: "https://mirabellier.com/login",
    },
  });

  const discordAuthUrl = getDiscordAuthUrl();

  useEffect(() => {
    window.location.href = discordAuthUrl;
  }, [discordAuthUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 text-center">
      <div>
        <div className="text-4xl mb-4">🌸</div>
        <p className="text-blue-600">
          Taking you to Discord to log in…{" "}
          <a href={discordAuthUrl} className="underline font-semibold">
            click here
          </a>{" "}
          if nothing happens.
        </p>
      </div>
    </div>
  );
};

export default Login;
