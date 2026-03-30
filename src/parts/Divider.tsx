const Divider = () => {
  return (
    <div
      className="hidden items-center gap-3 py-1 text-blue-300 md:flex dark:text-purple-300/70"
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-current/60" />
      <span className="text-xs font-mono tracking-[0.36em]">* * *</span>
      <span className="h-px flex-1 bg-current/60" />
    </div>
  );
};

export default Divider;
