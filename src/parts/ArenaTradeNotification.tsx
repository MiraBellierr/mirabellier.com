import type { ArenaTradeRequest } from "@/lib/arena-api";

type ArenaTradeNotificationProps = {
  request: ArenaTradeRequest;
  onAccept: (requestId: string) => void;
  onDeny: (requestId: string) => void;
};

const ArenaTradeNotification = ({
  request,
  onAccept,
  onDeny,
}: ArenaTradeNotificationProps) => {
  return (
    <div className="fixed top-4 left-1/2 z-[230000] -translate-x-1/2 animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-pink-300 bg-pink-100/95 px-5 py-3 text-pink-800 shadow-lg dark:border-pink-500/30 dark:bg-pink-950/90 dark:text-pink-100">
        <span className="text-sm font-semibold whitespace-pre-line">
          {request.askerUsername} wants to trade with you
        </span>
        <button
          type="button"
          onClick={() => onAccept(request.id)}
          className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => onDeny(request.id)}
          className="rounded-full bg-red-400 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-600"
        >
          Deny
        </button>
      </div>
    </div>
  );
};

export default ArenaTradeNotification;
