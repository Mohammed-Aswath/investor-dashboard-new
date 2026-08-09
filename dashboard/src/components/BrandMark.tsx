import Image from "next/image";

type Props = {
  size?: number;
  showWordmark?: boolean;
};

export function BrandMark({ size = 36, showWordmark = true }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/logo.png"
        alt="Aqademiq"
        width={size}
        height={size}
        priority
        className="rounded-[10px] object-cover"
      />
      {showWordmark ? (
        <p className="text-[21px] font-extrabold tracking-[-0.02em] text-ink">
          Aqademiq
        </p>
      ) : null}
    </div>
  );
}
