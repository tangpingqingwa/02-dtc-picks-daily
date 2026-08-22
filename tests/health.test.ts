import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { parseListenPort } from "../src/server.js";

test("GET /healthz returns 200 { ok: true }", async () => {
  const app = await buildApp();
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/healthz" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});

test("parseListenPort defaults to 3000 and rejects junk", () => {
  assert.equal(parseListenPort(""), 3000);
  assert.equal(parseListenPort("8080"), 8080);
  assert.throws(() => parseListenPort("nope"), /PORT must be an integer/);
  assert.throws(() => parseListenPort("0"), /PORT must be an integer/);
});
