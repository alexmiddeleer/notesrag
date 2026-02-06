#!/usr/bin/env node

const { main } = require('../src/cli');

main(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
}).then((exitCode) => {
  process.exitCode = exitCode;
});
