const Toast = ({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) => {
  return (
    <div className="fixed top-4 left-1/2 z-[220000] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-blue-300 bg-blue-100/95 px-6 py-4 text-blue-700 shadow-lg animate-fade-in dark:border-purple-400/30 dark:bg-purple-950/90 dark:text-purple-100">
        <span className="whitespace-pre-line">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 font-bold text-blue-700 hover:text-blue-900 dark:text-purple-100 dark:hover:text-white"
        >
          x
        </button>
      </div>
    </div>
  );
};

export default Toast;
