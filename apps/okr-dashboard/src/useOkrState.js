import { useState, useEffect, useCallback } from "react";
import { defaultData } from "./data";

const STORAGE_KEY = "nathans-okr-data";

let nextId = Date.now();
function genId(prefix) {
  return `${prefix}-${nextId++}`;
}

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Fall through to defaults
  }
  return structuredClone(defaultData);
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Silently fail on storage errors
  }
}

export function useOkrState() {
  const [data, setData] = useState(loadData);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const updateKeyResult = useCallback((period, objectiveId, krId, delta) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const objective = next[period].objectives.find(
        (o) => o.id === objectiveId
      );
      if (!objective) return prev;
      const kr = objective.keyResults.find((k) => k.id === krId);
      if (!kr) return prev;
      const newValue = kr.current + delta;
      if (newValue < 0 || newValue > kr.target) return prev;
      kr.current = newValue;
      return next;
    });
  }, []);

  const setKeyResult = useCallback((period, objectiveId, krId, value) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const objective = next[period].objectives.find(
        (o) => o.id === objectiveId
      );
      if (!objective) return prev;
      const kr = objective.keyResults.find((k) => k.id === krId);
      if (!kr) return prev;
      const clamped = Math.max(0, Math.min(kr.target, value));
      kr.current = clamped;
      return next;
    });
  }, []);

  const updateObjective = useCallback((period, objectiveId, fields) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const objective = next[period].objectives.find(
        (o) => o.id === objectiveId
      );
      if (!objective) return prev;
      Object.assign(objective, fields);
      return next;
    });
  }, []);

  const addObjective = useCallback((period) => {
    setData((prev) => {
      const next = structuredClone(prev);
      next[period].objectives.push({
        id: genId("obj"),
        title: "New Objective",
        color: "#6b7280",
        keyResults: [
          {
            id: genId("kr"),
            description: "New key result",
            current: 0,
            target: 10,
            unit: "",
          },
        ],
      });
      return next;
    });
  }, []);

  const removeObjective = useCallback((period, objectiveId) => {
    setData((prev) => {
      const next = structuredClone(prev);
      next[period].objectives = next[period].objectives.filter(
        (o) => o.id !== objectiveId
      );
      return next;
    });
  }, []);

  const updateKr = useCallback((period, objectiveId, krId, fields) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const objective = next[period].objectives.find(
        (o) => o.id === objectiveId
      );
      if (!objective) return prev;
      const kr = objective.keyResults.find((k) => k.id === krId);
      if (!kr) return prev;
      Object.assign(kr, fields);
      return next;
    });
  }, []);

  const addKr = useCallback((period, objectiveId) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const objective = next[period].objectives.find(
        (o) => o.id === objectiveId
      );
      if (!objective) return prev;
      objective.keyResults.push({
        id: genId("kr"),
        description: "New key result",
        current: 0,
        target: 10,
        unit: "",
      });
      return next;
    });
  }, []);

  const removeKr = useCallback((period, objectiveId, krId) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const objective = next[period].objectives.find(
        (o) => o.id === objectiveId
      );
      if (!objective) return prev;
      objective.keyResults = objective.keyResults.filter(
        (k) => k.id !== krId
      );
      return next;
    });
  }, []);

  return {
    data,
    updateKeyResult,
    setKeyResult,
    updateObjective,
    addObjective,
    removeObjective,
    updateKr,
    addKr,
    removeKr,
  };
}
