import { useState } from "react";
import { useOkrState } from "./useOkrState";
import { ObjectiveCard } from "./ObjectiveCard";
import { PasswordGate, useAuth } from "./PasswordGate";

function computeOverallPercent(periodData) {
  const allKrs = periodData.objectives.flatMap((o) => o.keyResults);
  if (allKrs.length === 0) return 0;
  const total = allKrs.reduce(
    (sum, kr) => sum + (kr.target > 0 ? (kr.current / kr.target) * 100 : 0),
    0
  );
  return Math.round(total / allKrs.length);
}

const tabs = [
  { key: "quarterly", label: "Q2 2026" },
  { key: "annual", label: "2026 Annual" },
];

export default function App() {
  const { authed, login } = useAuth();
  const [activeTab, setActiveTab] = useState("quarterly");
  const {
    data,
    updateKeyResult,
    setKeyResult,
    updateObjective,
    addObjective,
    removeObjective,
    updateKr,
    addKr,
    removeKr,
  } = useOkrState();
  const periodData = data[activeTab];
  const overallPercent = computeOverallPercent(periodData);

  if (!authed) {
    return <PasswordGate onLogin={login} />;
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-gray-950">
      <div className="max-w-[640px] mx-auto px-4 pb-12">
        {/* Header */}
        <div className="pt-8 pb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Nathan's OKRs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Endodontics Residency · Fort Eisenhower
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.key
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-750"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overall progress banner */}
        <div className="bg-gray-900 dark:bg-gray-800 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-medium text-gray-300">
              {periodData.label}
            </span>
            <span className="text-sm font-bold text-white">
              {overallPercent}%
            </span>
          </div>
          <div className="w-full bg-gray-700 dark:bg-gray-600 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-2.5 rounded-full bg-white transition-all duration-300 ease-out"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>

        {/* Objective cards */}
        <div className="flex flex-col gap-3">
          {periodData.objectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              period={activeTab}
              onUpdate={updateKeyResult}
              onSet={setKeyResult}
              onUpdateObjective={updateObjective}
              onRemoveObjective={removeObjective}
              onUpdateKr={updateKr}
              onAddKr={addKr}
              onRemoveKr={removeKr}
            />
          ))}
        </div>

        {/* Add objective */}
        <button
          onClick={() => addObjective(activeTab)}
          className="mt-4 w-full py-3 text-sm font-medium text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:bg-white dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          + Add objective
        </button>
      </div>
    </div>
  );
}
