import { useCursor } from "../states/CursorContext";

export default function ToggleCursor() {
  const { isCustomCursor, toggleCursor } = useCursor();

  return (
    <button
      onClick={toggleCursor}
      className="text-sm text-center font-bold text-blue-500 hover:underline"
      aria-label={`${isCustomCursor ? "Disable" : "Enable"} custom cursor`}
    >
      {isCustomCursor ? (
        <>
          <span className="hidden sm:inline">anya cursor</span> on
        </>
      ) : (
        <>
          <span className="hidden sm:inline">anya cursor</span> off
        </>
      )}
    </button>
  );
}
