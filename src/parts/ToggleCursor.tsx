import { useCursor } from "../states/CursorContext";

export default function ToggleCursor() {
  const { isCustomCursor, toggleCursor } = useCursor();

  return (
    <button
      onClick={toggleCursor}
      className="text-center text-sm font-bold text-blue-500 hover:underline dark:text-purple-200"
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
