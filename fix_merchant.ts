import * as fs from 'fs';

let content = fs.readFileSync('src/pages/Merchant.tsx', 'utf-8');
content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('src/pages/Merchant.tsx', content);
