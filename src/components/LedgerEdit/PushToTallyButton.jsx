import React, { useState } from "react";
import { apiFetch } from "../../api/apiClient";

/*
|--------------------------------------------------------------------------
| Send ledger changes straight into Tally
|--------------------------------------------------------------------------
|
| Bulk actions on the Ledger Changes page (replaces the Excel export).
|
| msids   ledgers selected on the page; when empty, every ledger
|         still pending for Tally is sent. Either way they go to
|         Tally together in one XML request.
| apiBase folder that holds push_ledger_to_tally.php.
| onDone  called with the server result after a push, so the page
|         can reload its list.
|
|--------------------------------------------------------------------------
*/

const STATUS_STYLE = {
    updated: "text-green-700",
    ready: "text-blue-700",
    nothing_to_send: "text-gray-600",
    error: "text-red-700",
};

const STATUS_LABEL = {
    updated: "Updated in Tally",
    ready: "In XML",
    nothing_to_send: "Nothing to send",
    error: "Failed",
};

export default function PushToTallyButton({
    msids = [],
    apiBase = "/serverphp",
    onDone,
}) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    const call = async (mode) => {
        setBusy(true);
        setError("");

        try {
            const res = await apiFetch(`${apiBase}/push_ledger_to_tally.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ MSIDs: msids, mode }),
            });

            const data = await res.json();
            setResult(data);
            return data;
        } catch (err) {
            console.error("Tally push error:", err);
            setError(err.message || "Request failed");
            return null;
        } finally {
            setBusy(false);
        }
    };

    const sendToTally = async () => {
        const target = msids.length > 0
            ? `${msids.length} selected ledger(s)`
            : "all pending ledger changes";

        if (!window.confirm(`Insert ${target} into Tally in one XML request?`)) {
            return;
        }

        const data = await call("push");

        if (data && onDone) {
            onDone(data);
        }
    };

    const downloadXml = async () => {
        const data = await call("xml");

        if (!data) return;

        if (!data.xml) {
            alert("No ledger changes to send to Tally.");
            return;
        }

        const blob = new Blob([data.xml], { type: "text/xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "LedgerChanges_Tally.xml";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div className="flex gap-2">
                <button
                    onClick={sendToTally}
                    disabled={busy}
                    className={`inline-flex items-center h-9 px-4 text-sm font-semibold rounded-md border ${
                        busy
                            ? "bg-gray-200 border-gray-300 text-gray-500 cursor-not-allowed"
                            : "border-green-700 bg-green-600 text-white hover:bg-green-700"
                    }`}
                >
                    {busy
                        ? "Sending..."
                        : msids.length > 0
                            ? `⬆ Insert selected (${msids.length}) into Tally`
                            : "⬆ Insert all into Tally"}
                </button>
                <button
                    onClick={downloadXml}
                    disabled={busy}
                    title="Download the XML to import manually in Tally (Import > Masters)"
                    className={`inline-flex items-center h-9 px-4 text-sm font-semibold rounded-md border ${
                        busy
                            ? "bg-gray-200 border-gray-300 text-gray-500 cursor-not-allowed"
                            : "border-blue-700 text-blue-700 bg-white hover:bg-blue-100"
                    }`}
                >
                    {msids.length > 0 ? `⬇ XML of selected (${msids.length})` : "⬇ Tally XML"}
                </button>
            </div>

            {error && (
                <p className="mt-2 text-xs text-red-700">{error}</p>
            )}

            {result && result.mode === "push" && (
                <div className="mt-3 text-xs border border-gray-200 rounded-md p-2 bg-gray-50 max-h-60 overflow-y-auto">
                    <p className="font-semibold mb-1">
                        {result.summary.updated} updated, {result.summary.errors} failed,{" "}
                        {result.summary.nothing_to_send} with nothing to send
                    </p>

                    {result.results.map((r) => (
                        <div key={r.MSID} className="py-1 border-t">
                            <span className="font-medium">{r.PartyLedgerName}</span>
                            {" — "}
                            <span className={STATUS_STYLE[r.status] || ""}>
                                {STATUS_LABEL[r.status] || r.status}
                            </span>
                            {r.status === "error" && r.message && (
                                <span className="text-red-700">: {r.message}</span>
                            )}
                            {r.skipped_fields?.length > 0 && (
                                <div className="text-amber-700">
                                    Not sent (update manually in Tally): {r.skipped_fields.join(", ")}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
