interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
      <span className="text-red-400 text-lg shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-red-300 text-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-400/40 rounded px-2 py-1"
        >
          Retry
        </button>
      )}
    </div>
  );
}
