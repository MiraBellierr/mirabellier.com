const Toast = ({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) => {
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-blue-100 border border-blue-400 text-blue-700 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
        <span>{message}</span>
        <button
          onClick={onClose}
          className="ml-2 text-blue-700 hover:text-blue-900 font-bold"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Toast;
