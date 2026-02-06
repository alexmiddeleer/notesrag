class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

function isCliError(error) {
  return error instanceof CliError;
}

module.exports = {
  CliError,
  isCliError,
};
