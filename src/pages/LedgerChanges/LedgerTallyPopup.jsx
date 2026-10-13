import React, { useState } from "react";
import { apiFetch } from "../../api/apiClient";

/*
|--------------------------------------------------------------------------
| Popup: all details of one edited ledger before inserting in Tally
|--------------------------------------------------------------------------
|
| Every field is listed with the value Tally has now and the value
| that will be sent. Changed fields are shown in red.
|
|--------------------------------------------------------------------------
*/

export default function LedgerTallyPopup({ ledger, apiBase, onClose, onInserted }) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    const insertIntoTally = async () => {
        if (!window.confirm(`Update "${ledger.PartyLedgerName}" in Tally?`)) {
            return;
        }

        setBusy(true);
        setError("");

        try {
            const res = await apiFetch(`${apiBase}/push_ledger_to_tally.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ MSIDs: [ledger.MSID], mode: "push" }),
            });

            const data = await res.json();
            const row = data.results?.[0] || null;

            setResult(row);

            if (row && row.status !== "error" && onInserted) {
                onInserted(row);
            }
        } catch (err) {
            console.error("Tally insert error:", err);
            setError(err.message || "Request failed");
        } finally {
            setBusy(false);
        }
    };

    const downloadXml = () => {
        const blob = new Blob([ledger.xml], { type: "text/xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${ledger.PartyLedgerName || ledger.MSID}_Tally.xml`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-[95%] max-w-3xl max-h-[90vh] flex flex-col shadow-xl">

                <div className="px-6 py-4 border-b bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-800 break-words">
                        {ledger.PartyLedgerName}
                    </h2>
                    <p className="text-xs text-gray-500">
                        MSID {ledger.MSID}
                        {ledger.edited_by ? ` · edited by ${ledger.edited_by}` : ""}
                        {" · "}
                        <span className="text-red-700 font-semibold">
                            {ledger.changed_count} changed
                        </span>
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">

                    {ledger.tally_error && !result && (
                        <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                            Last attempt: {ledger.tally_error}
                        </p>
                    )}

                    <table className="w-full text-sm border border-gray-300 border-collapse">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="border px-2 py-1 w-1/4">Field</th>
                                <th className="border px-2 py-1">In Tally now</th>
                                <th className="border px-2 py-1">Will be sent</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledger.fields.map((f) => (
                                <tr
                                    key={f.key}
                                    className={f.changed ? "bg-red-50 text-red-700 font-semibold" : ""}
                                >
                                    <td className="border px-2 py-1">
                                        {f.label}
                                        {!f.sent_to_tally && (
                                            <span
                                                className="ml-1 text-[10px] font-normal text-gray-500"
                                                title="This field is not sent to Tally"
                                            >
                                                (not in Tally)
                                            </span>
                                        )}
                                    </td>
                                    <td className={`border px-2 py-1 break-all ${f.changed ? "line-through font-normal" : ""}`}>
                                        {f.tally_value || "-"}
                                    </td>
                                    <td className="border px-2 py-1 break-all">
                                        {f.new_value || "-"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <details className="mt-3 text-xs">
                        <summary className="cursor-pointer text-blue-700">Show XML</summary>
                        <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-x-auto whitespace-pre">
                            {ledger.xml}
                        </pre>
                    </details>

                    {error && (
                        <p className="mt-3 text-xs text-red-700">{error}</p>
                    )}

                    {result && (
                        <div
                            className={`mt-3 text-sm rounded p-2 border ${
                                result.status === "error"
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : "bg-green-50 border-green-200 text-green-700"
                            }`}
                        >
                            {result.status === "updated" && "Updated in Tally."}
                            {result.status === "nothing_to_send" && (result.message || "Nothing to send.")}
                            {result.status === "error" && `Tally error: ${result.message}`}
                            {result.skipped_fields?.length > 0 && (
                                <div className="text-amber-700 mt-1">
                                    Not sent (update manually in Tally): {result.skipped_fields.join(", ")}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="border-t bg-white px-6 py-4 flex flex-wrap justify-end gap-3 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-gray-500 text-white rounded-md font-medium hover:bg-gray-600"
                    >
                        Close
                    </button>
                    <button
                        onClick={downloadXml}
                        className="px-5 py-2 border border-blue-700 text-blue-700 rounded-md font-medium hover:bg-blue-50"
                    >
                        ⬇ XML
                    </button>
                    <button
                        onClick={insertIntoTally}
                        disabled={busy || !ledger.found || result?.status === "updated"}
                        className={`px-5 py-2 rounded-md font-medium text-white ${
                            busy || !ledger.found || result?.status === "updated"
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-green-600 hover:bg-green-700"
                        }`}
                    >
                        {busy ? "Inserting..." : "Insert into Tally"}
                    </button>
                </div>
            </div>
        </div>
    );
}
