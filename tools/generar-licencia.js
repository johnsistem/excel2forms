// Usage:
//   node tools/generar-licencia.js                  → 1 año
//   node tools/generar-licencia.js 2026-12-31       → fecha específica
//   node tools/generar-licencia.js 1y               → 1 año
//   node tools/generar-licencia.js 6m               → 6 meses
//
// El token generado es universal (no está atado a un ID de máquina).
// Cualquier usuario puede ingresarlo en Configuración → Activar Licencia.

const SECRET = 'Digitar2024!MachineLock';
const crypto = require('crypto');

const rawExpiry = process.argv[2];
let expiry;

if (!rawExpiry) {
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
const hash = crypto.createHash('sha256').update(expiryStr + ':' + SECRET).digest('hex');
const token = expiryStr + ':' + hash;

console.log('Vencimiento:    ' + expiryStr);
console.log('Token:          ' + token);
console.log('');
console.log('Copiá el token completo (incluyendo la fecha) y enviáselo al usuario.');
