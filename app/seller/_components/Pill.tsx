type PillProps = {
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
};

export default function Pill({ label, value, active, onClick }: PillProps) {
  const base =
    "w-full rounded-xl border px-3 py-2 text-left transition-colors";
  const cls = active
    ? "border-emerald-200 bg-emerald-50/70"
    : "border-slate-200 bg-white hover:bg-slate-50";

  const Comp: any = onClick ? "button" : "div";

  return (
    <Comp onClick={onClick} className={`${base} ${cls}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-extrabold tracking-tight text-slate-900">
        {value}
      </div>
    </Comp>
  );
}
