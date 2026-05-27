#!/usr/bin/env node
"use strict";
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
import(pathToFileURL(join(__dirname, '..', 'dist', 'cli.js')).href).catch((e) => { console.error(e); process.exit(1); });
