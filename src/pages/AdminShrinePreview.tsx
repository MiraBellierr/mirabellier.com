import { Link } from "react-router-dom";

import CharacterShrinePage, {
  type CharacterShrineData,
} from "@/components/CharacterShrinePage";

function readPreviewPayload() {
  try {
    const raw = localStorage.getItem("adminShrinePreviewPayload");
    if (!raw) return null;
    return JSON.parse(raw) as CharacterShrineData;
  } catch {
    return null;
  }
}

const AdminShrinePreview = () => {
  const payload = readPreviewPayload();

  if (!payload) {
    return (
      <div className="p-6 text-sm text-red-600">
        No preview payload found. Go back to{" "}
        <Link to="/admin/shrines" className="text-blue-600 underline">
          shrine admin
        </Link>{" "}
        and click Preview page.
      </div>
    );
  }

  return <CharacterShrinePage shrine={payload} />;
};

export default AdminShrinePreview;
