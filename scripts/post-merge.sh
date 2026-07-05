#!/bin/bash
set -e
npm install
node --import tsx --test server/__tests__/*.test.ts
