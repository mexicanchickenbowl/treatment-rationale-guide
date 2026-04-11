export function ProgressBar({ percent, color, height = "h-2" }) {
  return (
    <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-300 ease-out`}
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
