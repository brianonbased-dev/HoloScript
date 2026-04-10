'use client';

interface VisitorCounterProps {
  count: number;
  themeColor: string;
}

export function VisitorCounter({ count, themeColor }: VisitorCounterProps) {
  const digits = String(count).padStart(6, '0').split('');

  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[10px] text-white/30 mr-1">visitors:</span>
      {digits.map((digit, i) => (
        <span
          key={i}
          className="inline-flex h-5 w-4 items-center justify-center rounded border text-[10px] font-mono font-bold"
          style={{
            borderColor: themeColor + '30',
            color: themeColor,
            backgroundColor: themeColor + '10',
          }}
        >
          {digit}
        </span>
      ))}
    </div>
  );
}
