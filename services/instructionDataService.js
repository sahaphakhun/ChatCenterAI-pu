const XLSX = require("xlsx");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const crypto = require("crypto");

function generateDataItemId() {
    return `item_${crypto.randomBytes(8).toString('hex')}`;
}

function generateInstructionId() {
    return `inst_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Convert array of objects (from Excel import) to { columns, rows } format
 * that edit-data-item-v3.ejs expects
 * @param {Array} data - Array of objects like [{ "ชื่อ": "A", "ราคา": 100 }, ...]
 * @returns {Object} - { columns: ["ชื่อ", "ราคา"], rows: [["A", 100], ...] }
 */
function convertToColumnsRowsFormat(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return { columns: ["คอลัมน์ 1"], rows: [[""]] };
    }

    // Get all unique column names from all objects
    const columnSet = new Set();
    data.forEach(row => {
        if (typeof row === 'object' && row !== null) {
            Object.keys(row).forEach(key => columnSet.add(key));
        }
    });
    const columns = Array.from(columnSet);

    // Convert each object row to array row
    const rows = data.map(row => {
        if (typeof row !== 'object' || row === null) {
            return columns.map(() => '');
        }
        return columns.map(col => {
            const val = row[col];
            return val !== undefined && val !== null ? val : '';
        });
    });

    return { columns, rows };
}


class InstructionDataService {
    constructor(db) {
        this.db = db;
        this.collection = db.collection("instructions_v2");
    }

    normalizeTableRows(item) {
        if (!item) return [];
        const tryParse = (val) => {
            if (typeof val === "string") {
                try {
                    const parsed = JSON.parse(val);
                    return parsed;
                } catch {
                    return null;
                }
            }
            return val;
        };

        const candidate = tryParse(item.data ?? item.content);

        // Case 1: Already an array of objects (from import)
        // e.g., [{ "ชื่อ": "A", "ราคา": 100 }, ...]
        if (Array.isArray(candidate)) {
            // If first element is an object (not array), it's already in the right format
            if (candidate.length > 0 && typeof candidate[0] === 'object' && !Array.isArray(candidate[0])) {
                return candidate;
            }
            // Otherwise it's an array of arrays (raw data without headers)
            return candidate;
        }

        // Case 2: { columns: [...], rows: [[...], [...]] } format from edit page
        if (candidate && typeof candidate === "object") {
            // Handle { columns, rows } format - convert to array of objects
            if (Array.isArray(candidate.columns) && Array.isArray(candidate.rows)) {
                const columns = candidate.columns;
                const rows = candidate.rows;

                // Convert each row array to an object with column names as keys
                return rows.map(row => {
                    const obj = {};
                    columns.forEach((colName, index) => {
                        const key = colName || `Column ${index + 1}`;
                        obj[key] = row[index] !== undefined && row[index] !== null ? row[index] : '';
                    });
                    return obj;
                });
            }

            // Handle common shapes like { rows: [...] }
            if (Array.isArray(candidate.rows)) {
                return candidate.rows;
            }

            return [candidate];
        }

        return [];
    }

    /**
     * Parse Excel file and return list of sheets with preview data
     * @param {string} filePath - Path to the uploaded file
     */
    previewImportSheets(filePath) {
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const previews = [];

        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (!rows || rows.length === 0) {
                previews.push({
                    sheetName: sheetName,
                    totalRows: 0,
                    headers: [],
                    previewData: []
                });
                continue;
            }

            // Extract headers (row 1)
            const headers = rows[0];

            // Extract preview data (rows 2-6)
            const dataRows = rows.slice(1, 6);
            const previewData = dataRows.map(row => {
                const rowObj = {};
                headers.forEach((header, index) => {
                    // Only map if header exists and row has value
                    if (header) rowObj[header] = row[index] !== undefined ? row[index] : "";
                });
                return rowObj;
            });

            previews.push({
                sheetName: sheetName,
                totalRows: rows.length - 1, // Exclude header
                headers: headers,
                previewData: previewData
            });
        }

        return previews;
    }

    /**
     * Execute import based on user mapping
     * @param {Array} mappings - Array of { sheetName, action, targetId, targetName, mode }
     * @param {string} filePath - Path to the uploaded file
     */
    async executeImport(mappings, filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error("File not found or expired.");
        }

        const workbook = XLSX.readFile(filePath);
        const results = [];

        for (const map of mappings) {
            try {
                const { sheetName, action, targetId, targetName, mode } = map;

                if (action === 'ignore') continue;

                const sheet = workbook.Sheets[sheetName];
                if (!sheet) {
                    results.push({ sheetName, success: false, error: "Sheet not found" });
                    continue;
                }

                // Convert to JSON using headers
                const rawData = XLSX.utils.sheet_to_json(sheet);

                // Convert to { columns, rows } format for edit-data-item-v3 compatibility
                const formattedData = convertToColumnsRowsFormat(rawData);

                if (action === 'create') {
                    const now = new Date();
                    const dataItem = {
                        itemId: generateDataItemId(),
                        title: "Main Data",
                        type: "table",
                        order: 0,
                        content: "",
                        data: formattedData, // { columns, rows } format
                        createdAt: now,
                        updatedAt: now
                    };

                    const newInstruction = {
                        instructionId: generateInstructionId(),
                        name: targetName || sheetName,
                        description: `Imported from ${sheetName}`,
                        dataItems: [dataItem],
                        usageCount: 0,
                        isActive: true,
                        updatedAt: now,
                        createdAt: now
                    };

                    await this.collection.insertOne(newInstruction);
                    results.push({ sheetName, success: true, action: 'created', targetName: newInstruction.name });

                } else if (action === 'update') {
                    if (!ObjectId.isValid(targetId)) {
                        results.push({ sheetName, success: false, error: "Invalid Target ID" });
                        continue;
                    }

                    const instruction = await this.collection.findOne({ _id: new ObjectId(targetId) });
                    if (!instruction) {
                        results.push({ sheetName, success: false, error: "Target instruction not found" });
                        continue;
                    }

                    let newItems = instruction.dataItems ? [...instruction.dataItems] : [];
                    let targetItem = newItems.find(item => item.type === 'table');

                    if (!targetItem) {
                        // Create new table item if none exists
                        targetItem = {
                            itemId: generateDataItemId(),
                            title: sheetName,
                            type: "table",
                            order: newItems.length,
                            content: "",
                            data: formattedData, // { columns, rows } format
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        newItems.push(targetItem);
                    } else {
                        // Update existing table item
                        if (mode === 'replace') {
                            targetItem.data = formattedData;
                        } else { // append
                            // Append rows to existing { columns, rows } format
                            const existingData = targetItem.data || { columns: [], rows: [] };

                            // If existing data is { columns, rows } format
                            if (existingData.columns && existingData.rows) {
                                // Merge columns if new data has new columns
                                const newColumns = formattedData.columns.filter(c => !existingData.columns.includes(c));
                                existingData.columns = [...existingData.columns, ...newColumns];

                                // Map new rows to match expanded column order
                                const mappedNewRows = formattedData.rows.map(row => {
                                    return existingData.columns.map((col, idx) => {
                                        const origIdx = formattedData.columns.indexOf(col);
                                        return origIdx !== -1 ? row[origIdx] : '';
                                    });
                                });

                                // Append new rows
                                existingData.rows = [...existingData.rows, ...mappedNewRows];
                                targetItem.data = existingData;
                            } else {
                                // If existing data is not in { columns, rows } format, replace
                                targetItem.data = formattedData;
                            }
                        }
                        targetItem.updatedAt = new Date();
                        // Replace in array
                        const index = newItems.findIndex(i => i.itemId === targetItem.itemId);
                        if (index !== -1) newItems[index] = targetItem;
                    }

                    await this.collection.updateOne(
                        { _id: new ObjectId(targetId) },
                        { $set: { dataItems: newItems, updatedAt: new Date() } }
                    );
                    results.push({ sheetName, success: true, action: 'updated', targetName: instruction.name });
                }
            } catch (err) {
                console.error(`Error importing sheet ${map.sheetName}:`, err);
                results.push({ sheetName: map.sheetName, success: false, error: err.message });
            }
        }

        return results;
    }

    /**
     * Export selected instructions to a multi-sheet Excel file
     * @param {Array} instructionIds - Array of instruction IDs (strings)
     * @returns {Buffer} Excel file buffer
     */
    async exportInstructions(instructionIds) {
        const workbook = XLSX.utils.book_new();

        const ids = instructionIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));

        if (ids.length === 0) {
            throw new Error("No valid instruction IDs provided.");
        }

        const instructions = await this.collection.find({ _id: { $in: ids } }).toArray();

        if (instructions.length === 0) {
            throw new Error("No instructions found to export.");
        }

        for (const inst of instructions) {
            // Sanitize sheet name
            let sheetName = (inst.name || "Untitled").replace(/[\\/?*[\]]/g, "_").substring(0, 31);

            // Ensure unique sheet name
            let counter = 1;
            let originalSheetName = sheetName;
            while (workbook.SheetNames.includes(sheetName)) {
                sheetName = `${originalSheetName.substring(0, 28)}_${counter}`;
                counter++;
            }

            const dataItems = Array.isArray(inst.dataItems) ? inst.dataItems : [];
            const tableItem = dataItems.find(i => i.type === 'table');
            const normalizedRows = this.normalizeTableRows(tableItem);
            const hasTableData = normalizedRows.length > 0;

            let worksheet;
            if (hasTableData) {
                worksheet = XLSX.utils.json_to_sheet(normalizedRows);
            } else {
                // Fallback: export all data items as rows soไฟล์ไม่เปล่า
                const rows = dataItems.map(item => ({
                    type: item.type || '',
                    title: item.title || '',
                    content: item.content || '',
                    order: item.order ?? ''
                }));

                if (!rows.length) {
                    rows.push({ note: 'ไม่มีข้อมูลใน instruction นี้' });
                }

                worksheet = XLSX.utils.json_to_sheet(rows);
            }

            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }

        return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    }
}

module.exports = InstructionDataService;
