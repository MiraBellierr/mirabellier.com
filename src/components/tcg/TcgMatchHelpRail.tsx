export default function TcgMatchHelpRail() {
  return (
    <details className="border-y border-sky-100 bg-sky-50/40 px-3 py-2 text-xs text-blue-700 dark:border-purple-400/20 dark:bg-purple-950/20 dark:text-purple-100">
      <summary className="cursor-pointer text-center font-black">quick rules</summary>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.7rem] font-semibold text-slate-600 dark:text-purple-100/80">
        <span>1 attacker + 3 support</span>
        <span>Energy can go on any card</span>
        <span>Attack with 2 matching energy</span>
        <span>Off-element energy can switch</span>
        <span>First to 3 points wins</span>
      </div>
    </details>
  );
}
