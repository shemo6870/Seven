import * as fs from 'fs';

const adminCode = fs.readFileSync('src/pages/Admin.tsx', 'utf-8');
const merchantCode = fs.readFileSync('src/pages/Merchant.tsx', 'utf-8');

// Note: I will just use sed or manually write the new Merchant.tsx instead of a complex script if I can just write it directly.
