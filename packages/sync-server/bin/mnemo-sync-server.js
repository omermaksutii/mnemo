#!/usr/bin/env node
import { main } from '../dist/index.js';
main().catch(err => {
  console.error('mnemo-sync-server:', err);
  process.exit(1);
});
