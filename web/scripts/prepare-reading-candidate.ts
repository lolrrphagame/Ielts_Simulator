import { prepareReadingCandidate } from "../src/lib/server/reading-candidate";
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--unit")
  throw Error(
    "Usage: npm run content:reading-candidate -- --unit 19-2-reading",
  );
prepareReadingCandidate(args[1])
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
