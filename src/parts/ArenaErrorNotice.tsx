import maintenanceImage from "@/assets/maintenance.jpg";

type ArenaErrorNoticeProps = {
  message: string;
  variant?: "default" | "duel";
};

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

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}
