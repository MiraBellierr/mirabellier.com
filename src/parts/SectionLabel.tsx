type SectionLabelProps = {
  label: string;
  className?: string;
};

const SectionLabel = ({ label, className = "" }: SectionLabelProps) => {
  return (
    <div
      className={`text-center font-mono text-[11px] uppercase tracking-[0.24em] text-blue-400 dark:text-purple-300/80 ${className}`.trim()}
    >
      ─ ·✶· ─<span className="font-bold">{`${label}`}</span>─ ·✶· ─
    </div>
  );
};

export default SectionLabel;
