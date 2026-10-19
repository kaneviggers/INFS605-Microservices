export default async function () {
  await (globalThis as any).__PG__?.stop();
}
