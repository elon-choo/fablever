// CLI usage: node tool.js --port <number> --mode <dev|prod>
// Support tickets: users see "E01"/"E02"/"E03" and have no idea what went wrong or how to fix it.
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--port') args.port = Number(argv[i + 1]);
    else if (argv[i] === '--mode') args.mode = argv[i + 1];
    else throw new Error('E01');
  }
  if (args.port !== undefined && Number.isNaN(args.port)) throw new Error('E02');
  if (args.mode && !['dev', 'prod'].includes(args.mode)) throw new Error('E03');
  return args;
}

module.exports = parseArgs;
