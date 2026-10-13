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
    const [checked, setChecked] = useState([]);

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

            const list = data.ledgers || [];
            setLedgers(list);
            setChecked((prev) => prev.filter((id) => list.some((l) => l.MSID === id && l.found)));
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

    const selectable = visible.filter((l) => l.found);
    const allChecked = selectable.length > 0 && selectable.every((l) => checked.includes(l.MSID));

    const toggle = (msid) =>
        setChecked((prev) =>
            prev.includes(msid) ? prev.filter((id) => id !== msid) : [...prev, msid]
        );

    const toggleAll = () =>
        setChecked(allChecked ? [] : selectable.map((l) => l.MSID));

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

    const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-white whitespace-nowrap";
    const td = "px-3 py-2.5 align-middle border-t border-gray-200";

    return (
        <div className="min-h-screen bg-gray-50">
            <Banner />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-4">
                        <Link
                            to="/salescrm"
                            className="inline-flex shrink-0 items-center gap-2 h-9 px-3 text-sm font-medium whitespace-nowrap rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-100"
                        >
                            <ArrowLeft size={16} />
                            Back to CRM
                        </Link>

                        <div>
                            <h1 className="text-xl font-bold text-gray-800 leading-tight">Ledger Changes</h1>
                            <p className="text-sm text-gray-500">
                                Tick the ledgers to send; they go into Tally together in one XML
                            </p>
                        </div>
                    </div>

                    <span className="inline-flex items-center h-9 px-4 rounded-full bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">
                        {pendingCount} pending
                    </span>
                </div>

                {/* Toolbar */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <PushToTallyButton
                            apiBase={API}
                            msids={checked}
                            onDone={() => {
                                setChecked([]);
                                load();
                            }}
                        />

                        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                            <label className="inline-flex items-center h-9 text-sm text-gray-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includeDone}
                                    onChange={(e) => setIncludeDone(e.target.checked)}
                                    className="mr-2 w-4 h-4"
                                />
                                Show ledgers already in Tally
                            </label>

                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search party"
                                className="h-9 px-3 text-sm border border-gray-300 rounded-md w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        {error}
                    </p>
                )}

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm border-collapse">
                            <thead className="bg-[#1e3a8a]">
                                <tr>
                                    <th className={`${th} w-12 text-center`}>
                                        <input
                                            type="checkbox"
                                            checked={allChecked}
                                            onChange={toggleAll}
                                            disabled={selectable.length === 0}
                                            title="Select all"
                                            className="w-4 h-4 align-middle cursor-pointer"
                                        />
                                    </th>
                                    <th className={`${th} w-16 text-center`}>S.No.</th>
                                    <th className={th}>Party Name</th>
                                    <th className={th}>Changed Fields</th>
                                    <th className={th}>Edited By</th>
                                    <th className={`${th} w-40`}>Tally Status</th>
                                    <th className={`${th} w-36 text-center`}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td colSpan={7} className={`${td} py-8 text-center text-gray-500`}>
                                            Loading...
                                        </td>
                                    </tr>
                                )}

                                {!loading && visible.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className={`${td} py-8 text-center text-gray-500`}>
                                            No ledger changes.
                                        </td>
                                    </tr>
                                )}

                                {!loading && visible.map((l, idx) => (
                                    <tr
                                        key={l.MSID}
                                        className={checked.includes(l.MSID) ? "bg-blue-50" : "even:bg-gray-50 hover:bg-blue-50"}
                                    >
                                        <td className={`${td} text-center`}>
                                            <input
                                                type="checkbox"
                                                checked={checked.includes(l.MSID)}
                                                onChange={() => toggle(l.MSID)}
                                                disabled={!l.found}
                                                className="w-4 h-4 align-middle cursor-pointer"
                                            />
                                        </td>
                                        <td className={`${td} text-center text-gray-500`}>{idx + 1}</td>
                                        <td className={`${td} font-medium text-gray-800`}>{l.PartyLedgerName}</td>
                                        <td className={td}>
                                            <div className="flex flex-wrap gap-1.5">
                                                {l.fields.filter((f) => f.changed).map((f) => (
                                                    <span
                                                        key={f.key}
                                                        className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200"
                                                    >
                                                        {f.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className={`${td} text-gray-600`}>{l.edited_by}</td>
                                        <td className={td}>{statusCell(l)}</td>
                                        <td className={`${td} text-center`}>
                                            <button
                                                onClick={() => setSelected(l)}
                                                className="h-8 px-3 text-xs font-semibold rounded-md border border-green-700 text-green-700 bg-white hover:bg-green-50 whitespace-nowrap"
                                            >
                                                View & Insert
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
