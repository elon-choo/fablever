// CLI usage: node tool.js --port <number> --mode <dev|prod>
// Support tickets: users see "E01"/"E02"/"E03" and have no idea what went wrong or how to fix it.
function parseArgs(argv) {
  const args = {};
  const rawPort = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--port') {
      rawPort.value = argv[i + 1];
      args.port = Number(argv[i + 1]);
    } else if (argv[i] === '--mode') {
      args.mode = argv[i + 1];
    } else {
      throw new Error(
        `Unknown argument "${argv[i]}". Expected --port <number> or --mode <dev|prod>. ` +
        `Usage: node tool.js --port <number> --mode <dev|prod>`
      );
    }
  }
  if (args.port !== undefined && Number.isNaN(args.port)) {
    throw new Error(
      `Invalid value for --port: "${rawPort.value}" is not a number. ` +
      `Pass a numeric port, e.g. --port 8080.`
    );
  }
  if (args.mode && !['dev', 'prod'].includes(args.mode)) {
    throw new Error(
      `Invalid value for --mode: "${args.mode}". Expected "dev" or "prod", e.g. --mode dev.`
    );
  }
  return args;
}

module.exports = parseArgs;
