import jsPDF from "jspdf";
// Letterhead: quotation_header.jpg next to this file if present (bundled by
// Vite), otherwise public/quotation_header.jpg. A missing file never breaks
// the build - the PDF is then made without the letterhead.
const bundledHeaders = import.meta.glob("./quotation_header.{jpg,jpeg,png}", {
    eager: true,
    query: "?url",
    import: "default"
});
const quotationHeaderUrl =
    Object.values(bundledHeaders)[0] ||
    `${import.meta.env.BASE_URL || "/"}quotation_header.jpg`;

// =====================================================
// QUOTATION PDF - same layout as the TallyPrime quotation
// =====================================================
// Fixed text printed on every quotation. Edit here when it changes.
export const EVEREST_COMPANY = {
    name: "Everest Agencies",
    // Letterhead (logo, address, "Suppliers of ..." line) - quotation_header.jpg
    headerImageUrl: quotationHeaderUrl,
    terms: [
        ["Terms of Delivery", "READY STOCK/2 WEEKS"],
        ["Payment Terms", "IMMEDIATELY"],
        ["Validity Up to", "THREE DAYS"]
    ],
    bank: [
        ["A/c Holder's Name", "Everest Agencies"],
        ["Bank Name", "SBI 43334740935 CA"],
        ["A/c No.", "43334740935"],
        ["Branch & IFS Code", "SME Branch, Ernakulam & SBIN0005387"],
        ["SWIFT Code", ""]
    ]
};

// ---------------- PAGE GEOMETRY (mm, A4) ----------------
const PAGE = { width: 210, height: 297 };
const BOX = { left: 9.3, right: 203.3, top: 45, bottom: 290 };
const TITLE_BOTTOM = 52.5;
// Party box holds the name plus four lines (address, GSTIN, mobile).
const PARTY_BOTTOM = 76;
const HEAD_BOTTOM = PARTY_BOTTOM + 10.2;
const TOTAL_TOP = 253.5;
const TOTAL_BOTTOM = 258.9;
const FOOTER_COLS = [83.8, 159.5];
const BUYER_RIGHT = 76.8;
const ORDER_LEFT = 141;
const ROW_HEIGHT = 4.6;
const LINE_HEIGHT = 3.6;
const PARTY_LINES = 4;
// Long godown names are wrapped in a smaller font to fit the narrow Gdn column.
const GODOWN_FONT_SIZE = 6;
const GODOWN_LINE_HEIGHT = 2.6;

// Item table columns: left edge of each column, then the box right edge.
const COLUMNS = [
    { key: "sl", title: ["Sl.", "No"], x: 9.3, align: "center" },
    { key: "description", title: ["Description of Goods"], x: 16.1, align: "left" },
    { key: "hsn", title: ["HSN/SAC"], x: 101.0, align: "left" },
    { key: "gst", title: ["GST", "%"], x: 116.8, align: "center" },
    { key: "godown", title: ["Gdn"], x: 125.2, align: "center" },
    { key: "qty", title: ["Qty"], x: 135.4, align: "right" },
    { key: "rate", title: ["Rate"], x: 157.4, align: "right" },
    { key: "disc", title: ["Disc", "%"], x: 173.0, align: "center" },
    { key: "amount", title: ["Amount"], x: 182.6, align: "right" }
];
const COLUMN_RIGHT = (index) =>
    index + 1 < COLUMNS.length ? COLUMNS[index + 1].x : BOX.right;
const COLUMN_PADDING = 1;

let headerImageCache = null;

const loadImage = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Quotation header image not found (${response.status}): ${url}`);
            return null;
        }

        const blob = await response.blob();
        // A missing file can come back as the app's index.html.
        if (!blob.type.startsWith("image/")) {
            console.error(`Quotation header is not an image (${blob.type}): ${url}`);
            return null;
        }
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const size = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve({ width: 1361, height: 257 });
            img.src = dataUrl;
        });

        return { dataUrl, ...size, format: blob.type.includes("png") ? "PNG" : "JPEG" };
    } catch (error) {
        console.error("Quotation header image load error:", error);
        return null;
    }
};

// ---------------- FORMATTERS ----------------
const money = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const formatQty = (quantity, unit) => {
    const number = Number(quantity || 0);
    const text = Number.isInteger(number)
        ? String(number)
        : number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    return unit ? `${text} ${unit}` : text;
};

// "225.00 mtr" and "225 MTR" are the same quantity.
const sameQuantity = (a, b) => {
    const parse = (text) => {
        const match = String(text).trim().match(/^([\d,.]+)\s*(.*)$/);
        return match
            ? [Number(match[1].replace(/,/g, "")), match[2].trim().toLowerCase()]
            : [NaN, String(text).trim().toLowerCase()];
    };
    const [numberA, unitA] = parse(a);
    const [numberB, unitB] = parse(b);
    return Number.isNaN(numberA) || Number.isNaN(numberB)
        ? unitA === unitB
        : numberA === numberB && unitA === unitB;
};

// Tally's quantity text: JasPriBillQty first, then JasSecBillQty in
// brackets, e.g. ["225.00 mtr", "(2 coil)"]. Shown once when both are equal.
const getItemQtyParts = (item) => {
    const unit = String(item?.unit || "").trim();
    const primaryText = String(item?.quantity_text || "").trim();
    const secondary = String(item?.secondary_quantity_text || "").trim();

    const primary = !primaryText
        ? formatQty(item?.quantity, unit)
        : /[a-z]/i.test(primaryText) || !unit
            ? primaryText
            : `${primaryText} ${unit}`;

    if (!secondary || sameQuantity(primary, secondary)) return [primary];
    return [primary, `(${secondary})`];
};

const formatPercent = (value) => {
    const number = Number(value || 0);
    if (!number) return "";
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
};

// Tally style date: 25-Sep-26
const formatTallyDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const month = d.toLocaleString("en-US", { month: "short" });
    return `${String(d.getDate()).padStart(2, "0")}-${month}-${String(d.getFullYear()).slice(-2)}`;
};

const formatRoundOff = (value) => {
    if (Math.abs(value) < 0.005) return "";
    return value < 0 ? `(-)${money(Math.abs(value))}` : money(value);
};

const getItemGst = (item) => {
    const gstAmount = Number(item?.gst_amount || 0);
    if (gstAmount !== 0) return gstAmount;
    return Number(item?.value || 0) * Number(item?.gst_rate || 0) / 100;
};

// Temporary items ("TEMPRORY ITEM", "TEMPORARY ITEM MTR", "TEMP ITEM", ...)
// print their temp_item_desc instead of the generic item name.
const isTemporaryItemName = (name) => /^TEMP[A-Z]*\s+ITEM\b|^TEMP\b/.test(name.toUpperCase());

const getItemName = (item) => {
    const name = String(item?.item_name || "").trim();
    const tempDesc = String(item?.temp_item_desc || "").trim();
    return isTemporaryItemName(name) && tempDesc ? tempDesc : name;
};

const getRowQuotationNo = (row) =>
    String(row?.quotation_no || row?.voucher_no || row?.VoucherNumber || "").trim();

export const getQuotationPdfFileName = (row) => {
    const safe = getRowQuotationNo(row).replace(/[^A-Za-z0-9_-]+/g, "_") || "Quotation";
    return `Quotation_${safe}.pdf`;
};

// ---------------- DRAWING HELPERS ----------------
const setFont = (doc, style = "normal", size = 8.5) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
};

const cellText = (doc, text, columnIndex, y) => {
    const column = COLUMNS[columnIndex];
    const left = column.x + COLUMN_PADDING;
    const right = COLUMN_RIGHT(columnIndex) - COLUMN_PADDING;

    // Shrink text that is wider than its column so it never crosses a line.
    const fontSize = doc.getFontSize();
    const width = doc.getTextWidth(text);
    if (width > right - left) {
        doc.setFontSize(fontSize * (right - left) / width);
    }

    if (column.align === "right") {
        doc.text(text, right, y, { align: "right" });
    } else if (column.align === "center") {
        doc.text(text, (left + right) / 2, y, { align: "center" });
    } else {
        doc.text(text, left, y);
    }

    doc.setFontSize(fontSize);
};

// "Label : value" lines with the colons lined up after the longest label.
// With maxRight, values longer than the space left are cut to one line.
const drawLabelValues = (doc, rows, x, firstY, lineGap, maxRight) => {
    const valueX = x + Math.max(...rows.map(([label]) => doc.getTextWidth(label))) + 1.5;
    rows.forEach(([label, value], index) => {
        const y = firstY + index * lineGap;
        const text = `: ${value || ""}`;
        doc.text(label, x, y);
        doc.text(maxRight ? doc.splitTextToSize(text, maxRight - valueX)[0] : text, valueX, y);
    });
};

// Address lines, then "PH: mobile" and GSTIN (when present), in PARTY_LINES
// lines. The address is cut short first so phone and GSTIN always print.
const getPartyLines = (doc, address, gstin, mobile, width) => {
    const extraLines = [mobile ? `PH: ${mobile}` : "", gstin ? `GSTIN : ${gstin}` : ""].filter(Boolean);
    const addressLines = address
        ? doc.splitTextToSize(address.replace(/\s*,?\s*\n\s*/g, ", "), width)
        : [];
    return [...addressLines.slice(0, PARTY_LINES - extraLines.length), ...extraLines];
};

/**
 * Draws one page frame: letterhead, title row, buyer / consignee /
 * order details, item table header, column lines and the footer.
 */
const drawPageFrame = (doc, row, headerImage, { isLastPage, pageNumber, pageCount }) => {
    doc.setDrawColor(0, 0, 0);
    doc.setTextColor(0, 0, 0);

    // Letterhead
    if (headerImage) {
        const width = BOX.right - BOX.left + 4;
        const height = (headerImage.height / headerImage.width) * width;
        doc.addImage(headerImage.dataUrl, headerImage.format, BOX.left - 2, BOX.top - height - 2, width, height);
    }

    // Outer box
    doc.setLineWidth(0.3);
    doc.rect(BOX.left, BOX.top, BOX.right - BOX.left, BOX.bottom - BOX.top);

    // ---- Title row ----
    doc.setLineWidth(0.2);
    doc.line(BOX.left, TITLE_BOTTOM, BOX.right, TITLE_BOTTOM);

    const titleY = BOX.top + 5;
    setFont(doc, "bold", 10.5);
    doc.text(`Quotation No. :${getRowQuotationNo(row)}`, BOX.left + 1.5, titleY);
    doc.text("Quotation", (BOX.left + BOX.right) / 2, titleY, { align: "center" });
    doc.text("Date", 161, titleY);
    doc.text(`:${formatTallyDate(row?.date || row?.quotation_date)}`, 176, titleY);

    // ---- Buyer / Consignee / Order & Despatch details ----
    doc.line(BUYER_RIGHT, TITLE_BOTTOM, BUYER_RIGHT, PARTY_BOTTOM);
    doc.line(ORDER_LEFT, TITLE_BOTTOM, ORDER_LEFT, PARTY_BOTTOM);
    doc.line(BOX.left, PARTY_BOTTOM, BOX.right, PARTY_BOTTOM);

    const buyerName = String(
        row?.mailing_name || row?.EveInvMailingName || row?.party_name || row?.PartyLedgerName || ""
    ).trim();
    const buyerAddress = String(row?.mailing_address || row?.EveInvMailingAdd || "").trim();
    const buyerMobile = String(row?.walkin_cust_no || row?.mobile || "").trim();
    const partyGstin = String(row?.party_gstin || row?.EvePartyGSTIN || "").trim();
    const consignee = String(
        row?.mailing_name || row?.EveInvMailingName || row?.party_name || row?.PartyLedgerName || ""
    ).trim();

    let y = TITLE_BOTTOM + 4;
    setFont(doc, "bold", 9);
    doc.text("Buyer (Bill To) :", BOX.left + 1.5, y);
    doc.text("Consignee (Ship To) :", BUYER_RIGHT + 1.5, y);
    doc.text("Order & Despatch Details:", ORDER_LEFT + 1.5, y);

    // Buyer
    const buyerWidth = BUYER_RIGHT - BOX.left - 3;
    let buyerY = y + LINE_HEIGHT;
    setFont(doc, "bold", 9);
    doc.splitTextToSize(buyerName, buyerWidth).slice(0, 1).forEach((line) => {
        doc.text(line, BOX.left + 1.5, buyerY);
        buyerY += LINE_HEIGHT;
    });
    setFont(doc, "normal", 8.5);
    getPartyLines(doc, buyerAddress, partyGstin, buyerMobile, buyerWidth).forEach((line) => {
        doc.text(line, BOX.left + 1.5, buyerY);
        buyerY += LINE_HEIGHT;
    });

    // Consignee: ledger name, then the same address, GSTIN and mobile.
    const consigneeWidth = ORDER_LEFT - BUYER_RIGHT - 3;
    let consigneeY = y + LINE_HEIGHT;
    setFont(doc, "bold", 9);
    doc.splitTextToSize(consignee, consigneeWidth).slice(0, 1).forEach((line) => {
        doc.text(line, BUYER_RIGHT + 1.5, consigneeY);
        consigneeY += LINE_HEIGHT;
    });
    setFont(doc, "normal", 8.5);
    getPartyLines(doc, buyerAddress, partyGstin, buyerMobile, consigneeWidth).forEach((line) => {
        doc.text(line, BUYER_RIGHT + 1.5, consigneeY);
        consigneeY += LINE_HEIGHT;
    });

    // Order & Despatch details. Payment Terms and Other Reference always
    // print; Salesman only when Tally has a value.
    setFont(doc, "normal", 8.5);
    const optionalDetails = [
        ["Salesman", String(row?.executive || row?.EveExecutive || "").trim()]
    ].filter(([, value]) => value);
    const orderDetails = [
        // Tally's due date of payment (EveBasicDueDateOfPymt), else the credit period.
        ["Payment Terms", String(
            row?.payment_due_date || row?.EveBasicDueDateOfPymt ||
            row?.payment_terms || row?.credit_days || ""
        ).trim()],
        // Tally's order reference (EveBasicOrderRef).
        ["Other Reference", String(row?.order_ref || row?.EveBasicOrderRef || row?.reference || "").trim()],
        ...optionalDetails
    ];
    drawLabelValues(doc, orderDetails, ORDER_LEFT + 1.5, y + LINE_HEIGHT, LINE_HEIGHT, BOX.right - 1);

    // ---- Item table header ----
    doc.line(BOX.left, HEAD_BOTTOM, BOX.right, HEAD_BOTTOM);
    setFont(doc, "bold", 8.5);
    COLUMNS.forEach((column, index) => {
        const centerX = (column.x + COLUMN_RIGHT(index)) / 2;
        column.title.forEach((titleLine, lineIndex) => {
            if (column.key === "sl") {
                doc.text(titleLine, column.x + COLUMN_PADDING, PARTY_BOTTOM + 3.8 + lineIndex * 3.6);
            } else {
                doc.text(titleLine, centerX, PARTY_BOTTOM + 3.8 + lineIndex * 3.6, { align: "center" });
            }
        });
    });

    // Column lines from the header down to the bottom of the Total row.
    COLUMNS.slice(1).forEach((column) => {
        doc.line(column.x, PARTY_BOTTOM, column.x, TOTAL_BOTTOM);
    });

    // ---- Total row ----
    doc.line(BOX.left, TOTAL_TOP, BOX.right, TOTAL_TOP);
    doc.line(BOX.left, TOTAL_BOTTOM, BOX.right, TOTAL_BOTTOM);
    setFont(doc, "bold", 8.5);
    doc.text(isLastPage ? "Total" : "continued ...", COLUMNS[1].x + COLUMN_PADDING, TOTAL_TOP + 3.9);

    // ---- Footer: terms / bank / signatory ----
    doc.line(FOOTER_COLS[0], TOTAL_BOTTOM, FOOTER_COLS[0], BOX.bottom);
    doc.line(FOOTER_COLS[1], TOTAL_BOTTOM, FOOTER_COLS[1], BOX.bottom);

    const footerY = TOTAL_BOTTOM + 4;

    setFont(doc, "bold", 8.5);
    doc.text("Terms & Conditions :", BOX.left + 1.5, footerY);
    setFont(doc, "normal", 8.5);
    drawLabelValues(doc, EVEREST_COMPANY.terms, BOX.left + 1.5, footerY + 4.5, 4.2);

    setFont(doc, "bold", 9);
    doc.text("Company's Bank Details", FOOTER_COLS[0] + 1.5, footerY + 0.8);
    setFont(doc, "normal", 7);
    drawLabelValues(doc, EVEREST_COMPANY.bank, FOOTER_COLS[0] + 1.5, footerY + 5.3, 4.4);

    setFont(doc, "bold", 9);
    const signX = (FOOTER_COLS[1] + BOX.right) / 2;
    doc.text(`For ${EVEREST_COMPANY.name}`, signX, footerY, { align: "center" });
    setFont(doc, "bold", 8);
    doc.text("Authorised Signatory", signX, footerY + 12, { align: "center" });

    if (pageCount > 1) {
        setFont(doc, "normal", 7);
        doc.text(`Page ${pageNumber} of ${pageCount}`, BOX.right, BOX.bottom + 4, { align: "right" });
    }
};

/**
 * Build the quotation PDF for one API row from quotation_wise.php.
 * Returns a jsPDF document.
 */
export const buildQuotationPdf = async (row) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    if (!headerImageCache) {
        headerImageCache = await loadImage(EVEREST_COMPANY.headerImageUrl);
    }
    const headerImage = headerImageCache;

    // ---------------- ITEM LINES ----------------
    const items = Array.isArray(row?.items) ? row.items : [];
    const descriptionWidth = COLUMN_RIGHT(1) - COLUMNS[1].x - COLUMN_PADDING * 2;
    const godownIndex = COLUMNS.findIndex((column) => column.key === "godown");
    const qtyIndex = COLUMNS.findIndex((column) => column.key === "qty");
    const qtyWidth = COLUMN_RIGHT(qtyIndex) - COLUMNS[qtyIndex].x - COLUMN_PADDING * 2;
    const godownWidth = COLUMN_RIGHT(godownIndex) - COLUMNS[godownIndex].x - COLUMN_PADDING * 2;
    setFont(doc, "normal", 8.5);

    let taxableTotal = 0;
    let gstTotal = 0;

    const lines = items.map((item, index) => {
        const value = Number(item?.value || 0);
        taxableTotal += value;
        gstTotal += getItemGst(item);

        const descriptionLines = doc.splitTextToSize(getItemName(item), descriptionWidth);

        // Short godown codes (GD1) print normally; long names shrink and wrap.
        const godown = String(item?.godown || "").trim();
        const godownFontSize = doc.getTextWidth(godown) <= godownWidth ? 8.5 : GODOWN_FONT_SIZE;
        setFont(doc, "normal", godownFontSize);
        const godownLines = doc.splitTextToSize(godown, godownWidth);
        setFont(doc, "normal", 8.5);

        // Qty and the bracketed second qty share one line when they fit.
        const qtyParts = getItemQtyParts(item);
        const qtyLines = doc.getTextWidth(qtyParts.join(" ")) <= qtyWidth
            ? [qtyParts.join(" ")]
            : qtyParts;

        return {
            type: "item",
            height: Math.max(
                Math.max(1, descriptionLines.length, qtyLines.length) * ROW_HEIGHT,
                (godownLines.length - 1) * GODOWN_LINE_HEIGHT + ROW_HEIGHT
            ),
            qtyLines,
            godownLines,
            godownFontSize,
            cells: [
                String(index + 1),
                descriptionLines,
                String(item?.hsn || ""),
                formatPercent(item?.gst_rate),
                "", // godown - drawn separately from godownLines
                "", // qty - drawn separately from qtyLines
                money(item?.rate),
                formatPercent(item?.discount),
                money(value)
            ]
        };
    });

    // ---------------- TAX + ROUND OFF ----------------
    // Use the Tally total only when it is just rounding away from the item
    // sum, so the printed rows always add up to the Total.
    const itemTotal = taxableTotal + gstTotal;
    const explicitTotal = Number(row?.quotation_amount_with_gst);
    const grandTotal =
        Number.isFinite(explicitTotal) &&
        explicitTotal !== 0 &&
        Math.abs(explicitTotal - itemTotal) <= 1
            ? explicitTotal
            : Math.round(itemTotal);
    const roundOff = grandTotal - itemTotal;

    const cgst = gstTotal / 2;
    const sgst = gstTotal - cgst;
    const summaryLines = [
        cgst ? ["CGST", money(cgst)] : null,
        sgst ? ["SGST", money(sgst)] : null,
        formatRoundOff(roundOff) ? ["Round Off", formatRoundOff(roundOff)] : null
    ]
        .filter(Boolean)
        .map(([label, amount]) => ({ type: "summary", height: ROW_HEIGHT, label, amount }));

    // ---------------- PAGINATION ----------------
    const bodyTop = HEAD_BOTTOM + 1.8;
    const bodyBottom = TOTAL_TOP - 1;
    const pages = [[]];
    let usedHeight = 0;

    [...lines, ...summaryLines].forEach((line) => {
        if (usedHeight + line.height > bodyBottom - bodyTop && pages[pages.length - 1].length) {
            pages.push([]);
            usedHeight = 0;
        }
        pages[pages.length - 1].push(line);
        usedHeight += line.height;
    });

    pages.forEach((pageLines, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        const isLastPage = pageIndex === pages.length - 1;
        drawPageFrame(doc, row, headerImage, {
            isLastPage,
            pageNumber: pageIndex + 1,
            pageCount: pages.length
        });

        let y = bodyTop + 2.6;
        setFont(doc, "normal", 8.5);

        pageLines.forEach((line) => {
            if (line.type === "item") {
                line.cells.forEach((cell, columnIndex) => {
                    if (columnIndex === 1) {
                        cell.forEach((textLine, lineIndex) => {
                            doc.text(textLine, COLUMNS[1].x + COLUMN_PADDING, y + lineIndex * ROW_HEIGHT);
                        });
                    } else if (cell) {
                        cellText(doc, cell, columnIndex, y);
                    }
                });

                line.qtyLines.forEach((textLine, lineIndex) => {
                    cellText(doc, textLine, qtyIndex, y + lineIndex * ROW_HEIGHT);
                });

                if (line.godownLines.length) {
                    setFont(doc, "normal", line.godownFontSize);
                    line.godownLines.forEach((textLine, lineIndex) => {
                        cellText(doc, textLine, godownIndex, y + lineIndex * GODOWN_LINE_HEIGHT);
                    });
                    setFont(doc, "normal", 8.5);
                }
            } else {
                doc.text(line.label, COLUMN_RIGHT(1) - COLUMN_PADDING - 1, y, { align: "right" });
                cellText(doc, line.amount, COLUMNS.length - 1, y);
            }
            y += line.height;
        });

        if (isLastPage) {
            setFont(doc, "bold", 8.5);
            cellText(doc, money(grandTotal), COLUMNS.length - 1, TOTAL_TOP + 3.9);
        }
    });

    return doc;
};

export const getQuotationPdfBlob = async (row) => {
    const doc = await buildQuotationPdf(row);
    return doc.output("blob");
};

export const downloadQuotationPdf = async (row) => {
    const doc = await buildQuotationPdf(row);
    doc.save(getQuotationPdfFileName(row));
};
