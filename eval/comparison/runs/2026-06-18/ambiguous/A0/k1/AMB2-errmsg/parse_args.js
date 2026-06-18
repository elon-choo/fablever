// CLI usage: node tool.js --port <number> --mode <dev|prod>
// Support tickets: users see "E01"/"E02"/"E03" and have no idea what went wrong or how to fix it.
const USAGE = 'Usage: node tool.js --port <number> --mode <dev|prod>';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--port') args.port = Number(argv[i + 1]);
    else if (argv[i] === '--mode') args.mode = argv[i + 1];
    else throw new Error(`Unknown option "${argv[i]}". Valid options are --port and --mode.\n${USAGE}`);
  }
  if (args.port !== undefined && Number.isNaN(args.port)) {
    throw new Error(`Invalid --port value "${argv[argv.indexOf('--port') + 1]}": port must be a number, e.g. --port 8080.`);
  }
  if (args.mode && !['dev', 'prod'].includes(args.mode)) {
    throw new Error(`Invalid --mode value "${args.mode}": mode must be either "dev" or "prod".`);
  }
  return args;
}

module.exports = parseArgs;
