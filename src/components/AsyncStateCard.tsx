type AsyncStateVariant = "loading" | "error" | "empty";

type AsyncStateCardProps = {
  variant: AsyncStateVariant;
  title: string;
  message?: string;
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
};

const variantStyleMap: Record<
  AsyncStateVariant,
  {
    shell: string;
    icon: string;
    iconText: string;
    showIcon: boolean;
  }
> = {
  loading: {
    shell:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/50 dark:bg-slate-900/70 dark:text-blue-100",
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-200",
    iconText: "...",
    showIcon: true,
  },
  error: {
    shell:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-950/40 dark:text-rose-100",
    icon: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-200",
    iconText: "!!",
    showIcon: true,
  },
  empty: {
    shell:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100",
    icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-200",
    iconText: "",
    showIcon: false,
  },
};

const buttonClassName =
  "inline-flex items-center justify-center rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-blue-700/60 dark:bg-slate-900/60 dark:text-blue-100 dark:hover:bg-slate-800";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-full border border-transparent px-3 py-2 text-sm font-semibold text-blue-600 transition hover:underline dark:text-blue-200";

const AsyncStateCard = ({
  variant,
  title,
  message,
  detail,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}: AsyncStateCardProps) => {
  const variantStyles = variantStyleMap[variant];
  const hasPrimaryAction = Boolean(actionLabel && onAction);
  const hasSecondaryAction = Boolean(secondaryActionLabel && onSecondaryAction);

  return (
    <div
      className={`rounded-2xl border p-5 text-center shadow-sm ${variantStyles.shell}${className ? ` ${className}` : ""}`}
    >
      {variantStyles.showIcon ? (
        <div
          className={`mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-black ${variantStyles.icon}`}
          aria-hidden="true"
        >
          {variantStyles.iconText}
        </div>
      ) : null}
      <h3 className="text-base font-bold">{title}</h3>
      {message ? <p className="mt-2 text-sm opacity-90">{message}</p> : null}
      {detail ? (
        <p className="mt-2 text-xs opacity-70 break-words">{detail}</p>
      ) : null}
      {hasPrimaryAction || hasSecondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {hasPrimaryAction ? (
            <button type="button" className={buttonClassName} onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
          {hasSecondaryAction ? (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default AsyncStateCard;
