// Runs the pipeline server and the Vite dev server together.
const procs = [
  Bun.spawn(["bun", "run", "server/index.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" }),
];
const stopAll = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
await Promise.race(procs.map((p) => p.exited));
stopAll();
export {};
