import { useState } from "react";
import { KeyResult } from "./KeyResult";

function computeObjectivePercent(objective) {
  const krs = objective.keyResults;
  if (krs.length === 0) return 0;
  const total = krs.reduce(
    (sum, kr) => sum + (kr.target > 0 ? (kr.current / kr.target) * 100 : 0),
    0
  );
  return Math.round(total / krs.length);
}

const COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
];

export function ObjectiveCard({
  objective,
  period,
  onUpdate,
  onSet,
  onUpdateObjective,
  onRemoveObjective,
  onUpdateKr,
  onAddKr,
  onRemoveKr,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(objective.title);
  const percent = computeObjectivePercent(objective);

  const startEdit = (e) => {
    e.stopPropagation();
    setTitleDraft(objective.title);
    setEditing(true);
    setExpanded(true);
  };

  const saveEdit = () => {
    if (titleDraft.trim()) {
      onUpdateObjective(period, objective.id, { title: titleDraft.trim() });
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setTitleDraft(objective.title);
    setEditing(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        {editing ? (
          <>
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: objective.color }}
            />
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              autoFocus
              className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1 leading-snug bg-transparent border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-gray-900 dark:focus:border-gray-100 py-0.5"
            />
          </>
        ) : (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 flex-1 text-left hover:bg-gray-50 dark:hover:bg-gray-750 -mx-4 -my-4 px-4 py-4 transition-colors"
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: objective.color }}
            />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1 leading-snug">
              {objective.title}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{
                backgroundColor: `${objective.color}18`,
                color: objective.color,
              }}
            >
              {percent}%
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
        )}
        {/* Edit toggle */}
        <button
          onClick={editing ? saveEdit : startEdit}
          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
          title={editing ? "Save" : "Edit objective"}
        >
          {editing ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
            </svg>
          )}
        </button>
      </div>

      {/* Edit toolbar: color picker + delete */}
      {editing && (
        <div className="px-4 pb-3 flex items-center gap-3">
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onUpdateObjective(period, objective.id, { color: c })}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  objective.color === c
                    ? "border-gray-900 dark:border-white scale-110"
                    : "border-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => onRemoveObjective(period, objective.id)}
            className="text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Delete objective
          </button>
        </div>
      )}

      {/* Key results */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <div className="divide-y divide-gray-100 dark:divide-gray-700 pt-3">
            {objective.keyResults.map((kr) => (
              <KeyResult
                key={kr.id}
                kr={kr}
                color={objective.color}
                editing={editing}
                onIncrement={() =>
                  onUpdate(period, objective.id, kr.id, kr.unit === "%" ? 5 : 1)
                }
                onDecrement={() =>
                  onUpdate(period, objective.id, kr.id, kr.unit === "%" ? -5 : -1)
                }
                onSet={(value) =>
                  onSet(period, objective.id, kr.id, value)
                }
                onUpdateKr={(fields) =>
                  onUpdateKr(period, objective.id, kr.id, fields)
                }
                onRemoveKr={() =>
                  onRemoveKr(period, objective.id, kr.id)
                }
              />
            ))}
          </div>
          {editing && (
            <button
              onClick={() => onAddKr(period, objective.id)}
              className="mt-3 w-full py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              + Add key result
            </button>
          )}
        </div>
      )}
    </div>
  );
}
