import maintenanceImage from "@/assets/maintenance.jpg";

type ArenaErrorNoticeProps = {
  message: string;
  variant?: "default" | "duel";
};

function isMaintenanceMessage(message: string) {
  return message.toLowerCase().includes("maintenance");
}

export default function ArenaErrorNotice({ message, variant = "default" }: ArenaErrorNoticeProps) {
  if (variant === "duel") {
    return (
      <div className="arena-duel-maintenance">
        <div
          className="arena-duel-maintenance__image"
          aria-hidden="true"
        >
          <img
            src={maintenanceImage}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-black text-blue-900">
            Arena card pool is currently unavailable.
          </p>
          <p className="text-base font-semibold text-blue-800">
            Please try again in a moment.
          </p>
          <p className="sr-only">{message}</p>
        </div>
        <div className="ml-auto hidden text-5xl opacity-70 sm:block" aria-hidden="true">
          ☁️
        </div>
      </div>
    );
  }

  if (!isMaintenanceMessage(message)) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {message}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-pink-50 shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div
          className="relative mx-auto h-20 w-20 shrink-0 overflow-hidden rounded-full border border-blue-200 bg-white shadow-inner sm:mx-0"
          aria-hidden="true"
        >
          <img
            src={maintenanceImage}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
        <div className="space-y-1 text-center sm:text-left">
          <p className="text-base font-bold text-blue-700">Arena is taking a rest !!!</p>
          <p className="text-sm text-slate-700">{message}</p>
          <p className="text-xs text-blue-500">
            Character draws and battles will be back when Jikan is healthy again.
          </p>
        </div>
      </div>
    </div>
  );
}
