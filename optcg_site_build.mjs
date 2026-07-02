#!/usr/bin/env node
// Prepara cartella statica per Render (o qualsiasi hosting statico).
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('public', { recursive: true });
const files = [
  ['chase-tracker (2).html', 'public/index.html'],
  ['catalog.js', 'public/catalog.js'],
  ['logo.png', 'public/logo.png'],
  ['manifest.json', 'public/manifest.json'],
  ['sw.js', 'public/sw.js'],
  ['opc-config.js', 'public/opc-config.js'],
];
for (const [src, dst] of files) copyFileSync(src, dst);
console.log('[site] public/ pronto per deploy');
