import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";

test("GET /healthz returns truthful readiness for a valid local app", async () => {
  const app = await buildApp();
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/healthz" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, ready: true, boardTimeZone: "UTC" });
});

test("GET /healthz reports an invalid BOARD_TZ as not ready", async () => {
  const previous = process.env.BOARD_TZ;
  process.env.BOARD_TZ = "Not/A_Timezone";
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      ok: false,
      ready: false,
      error: "BLOCKED-CONFIG: BOARD_TZ must be a valid IANA timezone",
    });
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.BOARD_TZ;
    else process.env.BOARD_TZ = previous;
  }
});
