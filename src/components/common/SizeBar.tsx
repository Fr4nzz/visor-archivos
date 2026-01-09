import { clsx } from 'clsx';

interface SizeBarProps {
  percentage: number;
  color?: string;
  className?: string;
}

export function SizeBar({ percentage, color = '#3B82F6', className }: SizeBarProps) {
  return (
    <div className={clsx('h-2 bg-gray-200 rounded-full overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(100, Math.max(0, percentage))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
