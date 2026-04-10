import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import CharacterShrinePage, {
  type CharacterShrineData,
} from "@/components/CharacterShrinePage";
import { fetchShrinePage } from "@/lib/shrine-api";

const ShrineEntry = () => {
  const { slug = "" } = useParams();
  const [shrine, setShrine] = useState<CharacterShrineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShrine(null);

    const load = async () => {
      try {
        const entry = await fetchShrinePage(slug);
        if (cancelled) return;
        if (!entry.payload) {
          setError("This shrine has no content payload yet.");
          return;
        }
        setShrine(entry.payload);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Shrine not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return <div className="p-6 text-sm text-blue-600">Loading shrine page...</div>;
  }

  if (error || !shrine) {
    return (
      <div className="p-6 text-sm text-red-600">
        {error || "Shrine not found"}.{" "}
        <Link to="/shrine" className="text-blue-600 underline">
          Go back to shrine directory
        </Link>
      </div>
    );
  }

  return <CharacterShrinePage shrine={shrine} />;
};

export default ShrineEntry;
