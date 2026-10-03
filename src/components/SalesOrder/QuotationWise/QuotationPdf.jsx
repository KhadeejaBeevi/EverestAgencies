import jsPDF from "jspdf";

// =====================================================
// QUOTATION PDF - same layout as the TallyPrime quotation
// =====================================================
// Fixed text printed on every quotation. Edit here when it changes.
export const EVEREST_COMPANY = {
    name: "Everest Agencies",
    // Letterhead (logo, address, "Suppliers of ..." line) - public/quotation_header.jpg
    headerImageUrl: "/quotation_header.jpg",
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
const PARTY_BOTTOM = 71.7;
const HEAD_BOTTOM = 81.9;
const TOTAL_TOP = 253.5;
const TOTAL_BOTTOM = 258.9;
const FOOTER_COLS = [83.8, 159.5];
const BUYER_RIGHT = 76.8;
const ORDER_LEFT = 141;
const ROW_HEIGHT = 4.6;
const LINE_HEIGHT = 3.6;

// Item table columns: left edge of each column, then the box right edge.
const COLUMNS = [
    { key: "sl", title: ["Sl.", "No"], x: 9.3, align: "center" },
    { key: "description", title: ["Description of Goods"], x: 16.1, align: "left" },
    { key: "hsn", title: ["HSN/SAC"], x: 109.0, align: "left" },
    { key: "gst", title: ["GST", "%"], x: 124.8, align: "center" },
    { key: "godown", title: ["Gdn"], x: 133.2, align: "center" },
    { key: "qty", title: ["Qty"], x: 143.4, align: "right" },
    { key: "rate", title: ["Rate"], x: 164.3, align: "right" },
    { key: "disc", title: ["Disc", "%"], x: 178.4, align: "center" },
    { key: "amount", title: ["Amount"], x: 188.6, align: "right" }
];
const COLUMN_RIGHT = (index) =>
    index + 1 < COLUMNS.length ? COLUMNS[index + 1].x : BOX.right;
const COLUMN_PADDING = 1;

let headerImageCache = null;

const loadImage = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;

        const blob = await response.blob();
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

const getItemName = (item) => {
    const name = String(item?.item_name || "").trim();
    const upper = name.toUpperCase();
    const tempDesc = String(item?.temp_item_desc || "").trim();
    const isTemporaryItem = upper === "TEMPRORY ITEM" || upper === "TEMPRORY ITEM MTR";
    return isTemporaryItem && tempDesc ? `${name} (${tempDesc})` : name;
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

    if (column.align === "right") {
        doc.text(text, right, y, { align: "right" });
    } else if (column.align === "center") {
        doc.text(text, (left + right) / 2, y, { align: "center" });
    } else {
        doc.text(text, left, y);
    }
};

// "Label : value" lines with the colons lined up after the longest label.
const drawLabelValues = (doc, rows, x, firstY, lineGap) => {
    const valueX = x + Math.max(...rows.map(([label]) => doc.getTextWidth(label))) + 1.5;
    rows.forEach(([label, value], index) => {
        const y = firstY + index * lineGap;
        doc.text(label, x, y);
        doc.text(`: ${value || ""}`, valueX, y);
    });
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
    const consignee = String(row?.party_name || row?.PartyLedgerName || "").trim();

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
    const buyerLines = [
        ...doc.splitTextToSize(buyerAddress.replace(/\s*\n\s*/g, ", "), buyerWidth),
        buyerMobile
    ].filter(Boolean);
    buyerLines.slice(0, 3).forEach((line) => {
        doc.text(line, BOX.left + 1.5, buyerY);
        buyerY += LINE_HEIGHT;
    });

    // Consignee
    setFont(doc, "bold", 9);
    doc.splitTextToSize(consignee, ORDER_LEFT - BUYER_RIGHT - 3).slice(0, 3).forEach((line, index) => {
        doc.text(line, BUYER_RIGHT + 1.5, y + LINE_HEIGHT * (index + 1));
    });

    // Order & Despatch details
    setFont(doc, "normal", 8.5);
    const orderDetails = [
        ["Payment Terms", String(row?.credit_days || "").trim()],
        ["Other Reference", String(row?.reference || "").trim()]
    ];
    drawLabelValues(doc, orderDetails, ORDER_LEFT + 1.5, y + LINE_HEIGHT, LINE_HEIGHT);

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
    setFont(doc, "normal", 8.5);

    let taxableTotal = 0;
    let gstTotal = 0;

    const lines = items.map((item, index) => {
        const value = Number(item?.value || 0);
        taxableTotal += value;
        gstTotal += getItemGst(item);

        const descriptionLines = doc.splitTextToSize(getItemName(item), descriptionWidth);
        return {
            type: "item",
            height: Math.max(1, descriptionLines.length) * ROW_HEIGHT,
            cells: [
                String(index + 1),
                descriptionLines,
                String(item?.hsn || ""),
                formatPercent(item?.gst_rate),
                String(item?.godown || ""),
                formatQty(item?.quantity, String(item?.unit || "").trim()),
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
