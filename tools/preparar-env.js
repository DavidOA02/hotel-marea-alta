#!/usr/bin/env node
/* Crea apps/api/.env y apps/web/.env.local a partir de los ejemplos (solo si no existen). */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
for (const [ejemplo, destino] of [['apps/api/.env.ejemplo', 'apps/api/.env'], ['apps/web/.env.ejemplo', 'apps/web/.env.local']]) {
  const d = path.join(raiz, destino);
  if (!fs.existsSync(d)) { fs.copyFileSync(path.join(raiz, ejemplo), d); console.log(`  ✓ creado ${destino}`); }
}
