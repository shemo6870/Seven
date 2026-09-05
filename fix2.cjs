const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/Login.tsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// the lines to remove are 337 to 362 (inclusive). Wait, let's look for the exact string to delete.
const startIdx = lines.findIndex(line => line.includes("} else if (mode === 'signup' && (role === 'buyer' || role === 'seller')) {"));

console.log("StartIdx", startIdx);

// Delete from startIdx up to but not including the second "} else if (mode === 'signup' && (role === 'buyer' || role === 'seller')) {"
if (startIdx !== -1) {
    let secondIdx = -1;
    for (let i = startIdx + 1; i < lines.length; i++) {
        if (lines[i].includes("} else if (mode === 'signup' && (role === 'buyer' || role === 'seller')) {")) {
            secondIdx = i;
            break;
        }
    }
    
    console.log("SecondIdx", secondIdx);
    if (secondIdx !== -1) {
        lines.splice(startIdx, secondIdx - startIdx);
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log("Deleted the corrupted lines!");
    }
}
