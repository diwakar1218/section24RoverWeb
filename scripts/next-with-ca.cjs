// Complete the hosted API's public CA chain without disabling TLS verification.
// This is the official Root YR cross-certificate signed by ISRG Root X1.
const { spawn } = require("node:child_process");
const path = require("node:path");
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || path.resolve(__dirname, "../certificates/root-yr-by-x1.pem"),
  },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
