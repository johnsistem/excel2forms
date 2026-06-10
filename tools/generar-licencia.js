// Usage:
//   node generar-licencia.js <MACHINE_ID>                  → 1 año
//   node generar-licencia.js <MACHINE_ID> 2025-12-31       → fecha específica
//   node generar-licencia.js <MACHINE_ID> 6m               → 6 meses
//   node generar-licencia.js <MACHINE_ID> 3m               → 3 meses
//
// El token generado se pega en la extensión -> Configuración -> Clave de Licencia

const SECRET = 'Digitar2024!MachineLock';
const crypto = require('crypto');

const machineID = process.argv[2];
if (!machineID) {
  console.error('Uso: node generar-licencia.js <MACHINE_ID> [vencimiento]');
  console.error('Ej: node generar-licencia.js a1b2c3d4e5f6 2026-12-31');
  process.exit(1);
}

let expiry;
const rawExpiry = process.argv[3];

if (!rawExpiry) {
  // Default: 1 año
  expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
} else if (rawExpiry.endsWith('y')) {
  const years = parseInt(rawExpiry, 10);
  if (isNaN(years)) { console.error('Formato inválido. Usá: 1y, 2y'); process.exit(1); }
  expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + years);
} else if (rawExpiry.endsWith('m')) {
  const months = parseInt(rawExpiry, 10);
  if (isNaN(months)) { console.error('Formato inválido. Usá: 6m, 3m, 12m'); process.exit(1); }
  expiry = new Date();
  expiry.setMonth(expiry.getMonth() + months);
} else {
  expiry = new Date(rawExpiry);
  if (isNaN(expiry.getTime())) { console.error('Fecha inválida. Usá formato YYYY-MM-DD'); process.exit(1); }
}

const expiryStr = expiry.toISOString().slice(0, 10);
const hash = crypto.createHash('sha256').update(machineID + ':' + expiryStr + ':' + SECRET).digest('hex');
const token = expiryStr + ':' + hash;

console.log('\nID de Máquina:  ' + machineID);
console.log('Vencimiento:    ' + expiryStr);
console.log('Licencia:       ' + token);
console.log('');
console.log('Copiá todo el token y pegálo en la extensión.');
