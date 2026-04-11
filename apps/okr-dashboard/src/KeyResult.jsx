import { useState, useRef, useEffect } from "react";
import { ProgressBar } from "./ProgressBar";

export function KeyResult({
  kr,
  color,
  editing: editMode,
  onIncrement,
  onDecrement,
  onSet,
  onUpdateKr,
  onRemoveKr,
}) {
  const [editingValue, setEditingValue] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const percent = kr.target > 0 ? (kr.current / kr.target) * 100 : 0;
  const fraction =
    kr.unit === "%"
      ? `${kr.current}%`
      : `${kr.current}/${kr.target}`;

  useEffect(() => {
    if (editingValue && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingValue]);

  const startEditingValue = () => {
    setDraft(String(kr.current));
    setEditingValue(true);
  };

  const commitValue = () => {
    setEditingValue(false);
    const num = parseInt(draft, 10);
    if (!isNaN(num)) {
      onSet(num);
    }
  };

  if (editMode) {
    return (
      <div className="py-3 first:pt-0 last:pb-0">
        <div className="flex items-start gap-2">
          <input
            value={kr.description}
            onChange={(e) => onUpdateKr({ description: e.target.value })}
            className="text-sm text-gray-700 dark:text-gray-300 flex-1 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:outline-none focus:border-gray-900 dark:focus:border-gray-100 py-0.5"
            placeholder="Key result description"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-xs text-gray-400">target:</label>
            <input
              type="number"
              min={1}
              value={kr.target}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v > 0) onUpdateKr({ target: v });
              }}
              className="w-14 text-sm text-gray-700 dark:text-gray-300 text-center bg-transparent border-b border-gray-200 dark:border-gray-600 focus:outline-none focus:border-gray-900 dark:focus:border-gray-100 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <select
              value={kr.unit}
              onChange={(e) => onUpdateKr({ unit: e.target.value })}
              className="text-xs text-gray-500 dark:text-gray-400 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:outline-none py-0.5"
            >
              <option value="">#</option>
              <option value="%">%</option>
              <option value="weeks">wk</option>
            </select>
          </div>
          <button
            onClick={onRemoveKr}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0"
            title="Remove key result"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug flex-1">
          {kr.description}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onDecrement}
            disabled={kr.current <= 0}
            className="w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 active:bg-gray-100 dark:active:bg-gray-550 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            -
          </button>
          {editingValue ? (
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={kr.target}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitValue}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitValue();
                if (e.key === "Escape") setEditingValue(false);
              }}
              className="w-[3.5rem] text-sm font-medium text-gray-900 dark:text-gray-100 text-center tabular-nums bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <button
              onClick={startEditingValue}
              className="text-sm font-medium text-gray-900 dark:text-gray-100 min-w-[3rem] text-center tabular-nums hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md px-1 py-0.5 transition-colors"
              title="Tap to edit value"
            >
              {fraction}
            </button>
          )}
          <button
            onClick={onIncrement}
            disabled={kr.current >= kr.target}
            className="w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 active:bg-gray-100 dark:active:bg-gray-550 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>
      </div>
      <ProgressBar percent={percent} color={color} height="h-1.5" />
    </div>
  );
}
