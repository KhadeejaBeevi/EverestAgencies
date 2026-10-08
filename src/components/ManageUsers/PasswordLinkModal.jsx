import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { auth } from "../firebase";
import { apiFetch } from "../../api/apiClient";
import {
    getWhatsappMobile,
    openWhatsappChat,
} from "../SalesOrder/QuotationWise/quotationUtils";

// =========================================================
// PASSWORD RESET LINK (admin)
// Creates a one-time Firebase reset link on the server and lets
// the admin send it to the user's mobile by WhatsApp or SMS.
// Nothing is emailed, so it works for dummy email addresses.
// =========================================================

const ENDPOINT = "/serverphp/generate_reset_link.php";

const buildMessage = (user, link) => {
    const name = (user.firstName || "").trim() || "there";
    return (
        `Hi ${name}, use this link to set a new password for your Everest Agencies login:\n` +
        `${link}\n\n` +
        `Login ID: ${user.email}\n` +
        `The link works once and expires in 1 hour.`
    );
};

const PasswordLinkModal = ({ user, onClose }) => {
    const [mobile, setMobile] = useState("");
    const [link, setLink] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMobile(user?.phone || "");
        setLink("");
    }, [user]);

    if (!user) return null;

    const waNumber = getWhatsappMobile(mobile);
    const message = link ? buildMessage(user, link) : "";

    const createLink = async () => {
        setLoading(true);
        try {
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) throw new Error("Please log in again");

            const res = await apiFetch(ENDPOINT, {
                method: "POST",
                headers: { Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ uid: user.id }),
            });
            const data = await res.json();

            if (!data?.success || !data.link) {
                throw new Error(data?.message || "Could not create the link");
            }

            setLink(data.link);
            toast.success("Reset link created");
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Could not create the link");
        } finally {
            setLoading(false);
        }
    };

    const sendWhatsapp = () => {
        if (!waNumber) return toast.error("Enter a mobile number");
        openWhatsappChat(waNumber, message);
    };

    const sendSms = () => {
        if (!waNumber) return toast.error("Enter a mobile number");
        window.location.href = `sms:+${waNumber}?body=${encodeURIComponent(message)}`;
    };

    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(message);
            toast.success("Message copied");
        } catch {
            toast.error("Could not copy. Select the text and copy it manually");
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="edit-modal" onClick={(e) => e.stopPropagation()}>

                <h2>Password Reset Link</h2>

                <p className="pw-user">
                    <strong>{`${user.firstName || ""} ${user.lastName || ""}`.trim()}</strong>
                    <br />
                    <span>{user.email}</span>
                </p>

                <div className="form-group">
                    <label>Mobile Number</label>
                    <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="10-digit mobile number"
                    />
                    {!user.phone && (
                        <small className="pw-hint">
                            No mobile saved for this user. Type it here, or save it with Edit.
                        </small>
                    )}
                </div>

                {!link ? (
                    <div className="button-group">
                        <button
                            className="save-btn"
                            onClick={createLink}
                            disabled={loading}
                        >
                            {loading ? "Creating..." : "Create Link"}
                        </button>
                        <button className="cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="form-group">
                            <label>Message</label>
                            <textarea
                                className="pw-message"
                                readOnly
                                value={message}
                                rows={7}
                                onFocus={(e) => e.target.select()}
                            />
                        </div>

                        <div className="pw-actions">
                            <button className="pw-btn pw-whatsapp" onClick={sendWhatsapp}>
                                WhatsApp
                            </button>
                            <button className="pw-btn pw-sms" onClick={sendSms}>
                                SMS
                            </button>
                            <button className="pw-btn" onClick={copyMessage}>
                                Copy
                            </button>
                        </div>

                        <div className="button-group">
                            <button className="cancel-btn" onClick={onClose}>
                                Close
                            </button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
};

export default PasswordLinkModal;
