import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../../api/apiClient";
import Banner from "../../components/Banner/Banner.jsx";
import PushToTallyButton from "../../components/LedgerEdit/PushToTallyButton";
import LedgerTallyPopup from "./LedgerTallyPopup";

/*
|--------------------------------------------------------------------------
| Ledger Changes
|--------------------------------------------------------------------------
|
| Ledgers edited in the app (ledger_mirror) that still have to go into
| Tally. Open one to see all its details, changed fields in red, and
| insert it into Tally with XML. No Excel step.
|
|--------------------------------------------------------------------------
*/

const API = "/serverphp";

export default function LedgerChanges() {
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [includeDone, setIncludeDone] = useState(false);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    const load = async () => {
        setLoading(true);
        setError("");

        try {
            const res = await apiFetch(`${API}/get_ledger_changes_tally.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ include_done: includeDone }),
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.message || "Failed to load ledger changes");
            }

            setLedgers(data.ledgers || []);
        } catch (err) {
            console.error("Ledger changes load error:", err);
            setError(err.message || "Failed to load ledger changes");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includeDone]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();

        return ledgers.filter(
            (l) => !term || (l.PartyLedgerName || "").toLowerCase().includes(term)
        );
    }, [ledgers, search]);

    const pendingCount = ledgers.filter((l) => l.tally_pending).length;

    const statusCell = (l) => {
        if (l.tally_error) {
            return <span className="text-red-700">{l.tally_error}</span>;
        }
        if (l.tally_pending) {
            return <span className="text-amber-700 font-semibold">Pending</span>;
        }
        return (
            <span className="text-green-700">
                In Tally{l.tally_pushed_at ? ` (${l.tally_pushed_at})` : ""}
            </span>
        );
    };

    return (
        <div>
            <Banner />

            <div className="p-3 sm:p-6">
                <Link
                    to="/salescrm"
                    className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 text-sm font-medium rounded border border-gray-700 text-gray-700 bg-white hover:bg-gray-100"
                >
                    <ArrowLeft size={16} />
                    Back to CRM
                </Link>

                <h1 className="text-xl font-bold text-gray-800 mb-1">Ledger Changes</h1>
                <p className="text-sm text-gray-600 mb-4">
                    {pendingCount} ledger(s) waiting to be inserted into Tally.
                </p>

                <div className="flex flex-wrap items-start gap-3 mb-3">
                    <PushToTallyButton apiBase={API} onDone={load} />

                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search party"
                        className="px-2 py-1.5 text-sm border rounded w-full sm:w-64"
                    />

                    <label className="inline-flex items-center text-sm text-gray-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeDone}
                            onChange={(e) => setIncludeDone(e.target.checked)}
                            className="mr-2"
                        />
                        Show ledgers already in Tally
                    </label>
                </div>

                {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

                <div className="overflow-x-auto">
                    <table className="min-w-full text-xs sm:text-sm border border-gray-300 border-collapse">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="border px-2 py-1">S.No.</th>
                                <th className="border px-2 py-1">Party Name</th>
                                <th className="border px-2 py-1">Changed Fields</th>
                                <th className="border px-2 py-1">Edited By</th>
                                <th className="border px-2 py-1">Tally Status</th>
                                <th className="border px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="border px-2 py-4 text-center text-gray-500">
                                        Loading...
                                    </td>
                                </tr>
                            )}

                            {!loading && visible.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="border px-2 py-4 text-center text-gray-500">
                                        No ledger changes.
                                    </td>
                                </tr>
                            )}

                            {!loading && visible.map((l, idx) => (
                                <tr key={l.MSID} className="hover:bg-gray-50">
                                    <td className="border px-2 py-1">{idx + 1}</td>
                                    <td className="border px-2 py-1 font-medium">{l.PartyLedgerName}</td>
                                    <td className="border px-2 py-1">
                                        <div className="flex flex-wrap gap-1">
                                            {l.fields.filter((f) => f.changed).map((f) => (
                                                <span
                                                    key={f.key}
                                                    className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200"
                                                >
                                                    {f.label}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="border px-2 py-1">{l.edited_by}</td>
                                    <td className="border px-2 py-1">{statusCell(l)}</td>
                                    <td className="border px-2 py-1">
                                        <button
                                            onClick={() => setSelected(l)}
                                            className="px-2 py-1 text-xs font-semibold rounded border border-green-700 text-green-700 hover:bg-green-100 whitespace-nowrap"
                                        >
                                            View & Insert
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {selected && (
                    <LedgerTallyPopup
                        ledger={selected}
                        apiBase={API}
                        onClose={() => setSelected(null)}
                        onInserted={load}
                    />
                )}
            </div>
        </div>
    );
}
