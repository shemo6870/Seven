import fs from 'fs';
let content = fs.readFileSync('src/pages/Merchant.tsx', 'utf8');
content = content.replace(/amber/g, 'blue');
fs.writeFileSync('src/pages/Merchant.tsx', content);
console.log("Done");
