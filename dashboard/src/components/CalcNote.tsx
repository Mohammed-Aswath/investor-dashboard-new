type Props = {
  /** Short plain English */
  means: string;
  /** Math / SQL formula */
  calc: string;
};

export function CalcNote({ means, calc }: Props) {
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs leading-snug text-mist">{means}</p>
      <p className="font-mono text-[10px] leading-snug text-mist/80">{calc}</p>
    </div>
  );
}
