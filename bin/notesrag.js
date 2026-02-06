#!/usr/bin/env node

const { main } = require('../src/cli');

const io = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
};

main(process.argv.slice(2), io).then((exitCode) => {
  process.exitCode = exitCode;
});
