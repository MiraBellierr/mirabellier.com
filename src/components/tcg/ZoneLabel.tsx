export default function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block h-4 text-center text-[0.55rem] font-black uppercase tracking-normal text-slate-400 dark:text-slate-500">
      {children}
    </span>
  );
}
