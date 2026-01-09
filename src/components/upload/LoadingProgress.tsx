import { Loader2, CheckCircle2, Clock } from 'lucide-react';
import { clsx } from 'clsx';

interface LoadingProgressProps {
  progress: number;
  stage: string;
  rowsProcessed?: number;
}

interface Stage {
  id: string;
  label: string;
  minProgress: number;
}

const stages: Stage[] = [
  { id: 'parsing', label: 'Parsing CSV...', minProgress: 0 },
  { id: 'building', label: 'Building folder tree...', minProgress: 90 },
  { id: 'stats', label: 'Calculating statistics...', minProgress: 95 },
  { id: 'complete', label: 'Complete!', minProgress: 100 },
];

function getStageStatus(stage: Stage, currentProgress: number): 'done' | 'active' | 'pending' {
  const nextStage = stages.find((s) => s.minProgress > stage.minProgress);
  const nextMinProgress = nextStage?.minProgress ?? 101;

  if (currentProgress >= nextMinProgress) {
    return 'done';
  }
  if (currentProgress >= stage.minProgress) {
    return 'active';
  }
  return 'pending';
}

export function LoadingProgress({ progress, stage, rowsProcessed }: LoadingProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Processing your inventory</h2>
          <p className="text-gray-500 mt-1">{stage}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>{Math.round(progress)}%</span>
            {rowsProcessed && <span>{rowsProcessed.toLocaleString()} rows</span>}
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stage list */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          {stages.map((s) => {
            const status = getStageStatus(s, progress);

            return (
              <div
                key={s.id}
                className={clsx(
                  'flex items-center gap-3 text-sm',
                  status === 'active' && 'text-blue-600 font-medium',
                  status === 'done' && 'text-green-600',
                  status === 'pending' && 'text-gray-400'
                )}
              >
                {status === 'done' && <CheckCircle2 className="w-5 h-5" />}
                {status === 'active' && <Loader2 className="w-5 h-5 animate-spin" />}
                {status === 'pending' && <Clock className="w-5 h-5" />}
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
