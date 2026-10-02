export const CompareTables = (
    table1,
    table2,
    table1MatchColumn,
    table2MatchColumn
) => {

    const report = {
        changedCells: [],
        missingRows: [],
        newRows: []
    };

    const normalizeValue = (value) =>
        String(value ?? "")
            .trim()
            .replace(/\r?\n/g, " ")
            .replace(/\s+/g, " ")
            .replace(/"/g, "")
            .toLowerCase();


    const normalizeHeader = (header) =>
        String(header)
            .replace(/`/g, "")
            .replace(/"/g, "")
            .trim();

    const newTable1 = table1.map(row => {
        const obj = {};
        Object.keys(row).forEach(key => {
            obj[normalizeHeader(key)] = row[key];
        });
        return obj;
    });


    const newTable2 = table2.map(row => {
        const obj = {};
        Object.keys(row).forEach(key => {
            obj[normalizeHeader(key)] = row[key];
        });
        return obj;
    });

    const match1 = normalizeHeader(table1MatchColumn);
    const match2 = normalizeHeader(table2MatchColumn);
    console.log("Table1 Columns:", Object.keys(newTable1[0]));
    console.log("Table2 Columns:", Object.keys(newTable2[0]));


    console.log("Table1 First Row:", newTable1[0]);
    console.log("Table2 First Row:", newTable2[0]);

    console.log("Table1 Match Value:", newTable1[0][match1]);
    console.log("Table2 Match Value:", newTable2[0][match2]);

    const columnMap = {
        StockItemName: "StockItem.$Name",
        Parent: "StockItem.$Parent",
        Category: "StockItem.$Category",
        OpeningBalance: "StockItem.$OpeningBalance",
        OpeningRate: "StockItem.$OpeningRate",
        OpeningValue: "StockItem.$OpeningValue",
        EveCostPrice: "StockItem.$_EveCostPrice",
        EveSellPrice: "StockItem.$_EveSellPrice",
        _EveProdBrand: "StockItem.$_EveProdBrand",
        _EveSIMstID: "StockItem.$_EveSIMstID"
    };
    const compareColumns = [
        {
            table1: "Parent",
            table2: "StockItem.$Parent"
        },
        {
            table1: "Category",
            table2: "StockItem.$Category"
        },
        {
            table1: "EveCostPrice",
            table2: "StockItem.$_EveCostPrice"
        },
        {
            table1: "EveSellPrice",
            table2: "StockItem.$_EveSellPrice"
        },
        {
            table1: "OpeningBalance",
            table2: "StockItem.$OpeningBalance"
        },
        {
            table1: "OpeningRate",
            table2: "StockItem.$OpeningRate"
        },
        {
            table1: "OpeningValue",
            table2: "StockItem.$OpeningValue"
        },
        {
            table1: "_EveProdBrand",
            table2: "StockItem.$_EveProdBrand"
        },
        {
            table1: "_EveSIMstID",
            table2: "StockItem.$_EveSIMstID"
        }
    ];
    const map = new Map();
    console.log("Missing Rows:", report.missingRows.length);
    console.log("New Rows:", report.newRows.length);
    console.log("Changed Cells:", report.changedCells.length);
    newTable2.forEach(row => {
        map.set(
            normalizeValue(row[match2]),
            row
        );
    });
    newTable1.forEach(row1 => {

        const key = normalizeValue(row1[match1]);

        const row2 = map.get(key);

        if (!row2) {
            report.missingRows.push(row1);
            return;
        }

       compareColumns.forEach(({ table1, table2 }) => {

    const value1 = normalizeValue(row1[table1]);
    const value2 = normalizeValue(row2[table2]);

    if (value1 !== value2) {

        report.changedCells.push({
            ledgerName: row1[match1],
            field: table1,
            table1: row1[table1],
            table2: row2[table2]
        });

    }

});
    });


    const map1 = new Set(
        newTable1.map(r => normalizeValue(r[match1]))
    );

    newTable2.forEach(row => {

        const key = normalizeValue(row[match2]);

        if (!map1.has(key)) {
            report.newRows.push(row);
        }

    });

    return report;
};