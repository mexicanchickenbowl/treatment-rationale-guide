import { useState } from "react";

const HASH = "c0ac7b4768118f14995c53ce01ce82515365ed087211ef3a4b26b27adc6603a6";
const SESSION_KEY = "okr-auth";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useAuth() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "1"
  );

  const login = async (password) => {
    const hashed = await sha256(password);
    if (hashed === HASH) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      return true;
    }
    return false;
  };

  return { authed, login };
}

export function PasswordGate({ onLogin }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const ok = await onLogin(value);
    if (!ok) {
      setError(true);
      setValue("");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-[320px]">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Nathan's OKRs
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter password to continue
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 transition-shadow"
          />
          {error && (
            <p className="text-sm text-red-500 mt-2 text-center">
              Incorrect password
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !value}
            className="w-full mt-3 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Checking..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
