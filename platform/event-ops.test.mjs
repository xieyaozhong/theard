import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker.js";
import { makeSerial, normalizeAccessCode, passMeta, sanitizeCode } from "./lib.js";

class PreparedStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new PreparedStatement(this.database, this.sql, params);
  }

  first() {
    return this.database.prepare(this.sql).get(...this.params);
  }

  all() {
    return { results: this.database.prepare(this.sql).all(...this.params) };
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
}

class TestD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new PreparedStatement(this.database, sql);
  }

  batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.run());
      this.database.exec("COMMIT");
      return Promise.resolve(results);
    } catch (error) {
      this.database.exec("ROLLBACK");
      return Promise.reject(error);
    }
  }
}

function setup() {
  const env = {
    DB: new TestD1(),
    THEARD_ADMIN_KEY: "TEST-ADMIN-KEY-2026",
    THEARD_RATE_KEY: "TEST-RATE-KEY-2026",
    ALLOWED_ORIGINS: "https://xieyaozhong.github.io"
  };

  async function api(path, { method = "GET", body, admin = false, origin = "https://xieyaozhong.github.io" } = {}) {
    const headers = { Origin: origin };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (admin) headers.Authorization = `Bearer ${env.THEARD_ADMIN_KEY}`;
    const request = new Request(`https://theard.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const response = await worker.fetch(request, env);
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  }

  return { env, api };
}

const issuePayload = {
  requestId: "test-issue-request-0001",
  eventName: "THEARD LIVE / 001",
  eventCode: "THD001",
  sessionCode: "A",
  date: "2026-09-12",
  time: "19:00",
  venue: "TAIPEI / TEST VENUE",
  passType: "CREATOR PASS",
  quantity: 3,
  startNumber: 1,
  note: "Integration test"
};

test("identifier helpers normalize safe human codes", () => {
  assert.equal(sanitizeCode(" thd-001 "), "THD001");
  assert.equal(normalizeAccessCode("THD001-A-ABCDE-23456"), "THD001AABCDE23456");
  assert.equal(makeSerial("thd001", "2026-09-12", "a", 7), "THD001-260912-A-0007");
  assert.deepEqual(passMeta("creator pass"), { passType: "CREATOR PASS", rarity: "RARE", zone: "C" });
});

test("admin issue, public lookup, single claim, recovery, and state sync", async () => {
  const { env, api } = setup();
  const unauthorized = await api("/api/admin/state");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.payload.error.code, "UNAUTHORIZED");

  const issued = await api("/api/admin/issue", { method: "POST", admin: true, body: issuePayload });
  assert.equal(issued.response.status, 201);
  assert.equal(issued.payload.data.tickets.length, 3);
  const [first] = issued.payload.data.tickets;
  assert.match(first.drawCode, /^THD001-A-[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  const lookup = await api("/api/public/lookup", { method: "POST", body: { code: first.drawCode.toLowerCase().replaceAll("-", " ") } });
  assert.equal(lookup.response.status, 200);
  assert.equal(lookup.payload.data.session.eventName, issuePayload.eventName);
  assert.equal(lookup.payload.data.session.availableCount, 3);
  assert.equal(lookup.payload.data.code.claimed, false);
  assert.equal("ticket" in lookup.payload.data, false);

  const claim = await api("/api/public/claim", { method: "POST", body: { code: first.drawCode, attendeeName: "測試來賓" } });
  assert.equal(claim.response.status, 200);
  assert.equal(claim.payload.data.ticket.serial, first.serial);
  assert.equal(claim.payload.data.ticket.passType, "CREATOR PASS");
  assert.equal(claim.payload.data.ticket.rarity, "RARE");
  assert.equal(claim.payload.data.claim.recovered, false);

  const recovered = await api("/api/public/claim", { method: "POST", body: { code: first.drawCode } });
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.payload.data.ticket.serial, first.serial);
  assert.equal(recovered.payload.data.claim.recovered, true);

  const state = await api("/api/admin/state", { admin: true });
  assert.equal(state.payload.data.sessions[0].totals.issued, 3);
  assert.equal(state.payload.data.sessions[0].totals.claimed, 1);
  assert.equal(state.payload.data.sessions[0].totals.available, 2);
  const stored = state.payload.data.sessions[0].tickets.find((ticket) => ticket.id === first.id);
  assert.equal(stored.attendeeName, "測試來賓");
  const claimRows = env.DB.database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'DRAW_CLAIMED'").get();
  assert.equal(claimRows.count, 1);
});

test("ticket status, verification, session close, and code regeneration are enforced", async () => {
  const { api } = setup();
  const issued = await api("/api/admin/issue", { method: "POST", admin: true, body: issuePayload });
  const [claimedTicket, pendingTicket, closedTicket] = issued.payload.data.tickets;
  const sessionId = issued.payload.data.session.id;

  const claim = await api("/api/public/claim", { method: "POST", body: { code: claimedTicket.drawCode } });
  const verifyToken = claim.payload.data.ticket.verifyToken;
  const verify = await api(`/api/public/verify`, { method: "POST", body: { serial: claimedTicket.serial, token: verifyToken } });
  assert.equal(verify.payload.data.valid, true);

  const used = await api(`/api/admin/tickets/${encodeURIComponent(claimedTicket.id)}`, { method: "PATCH", admin: true, body: { status: "USED" } });
  assert.equal(used.payload.data.status, "USED");
  const usedVerify = await api(`/api/public/verify`, { method: "POST", body: { serial: claimedTicket.serial, token: verifyToken } });
  assert.equal(usedVerify.payload.data.valid, false);
  assert.equal(usedVerify.payload.data.status, "USED");

  const regenerated = await api(`/api/admin/tickets/${encodeURIComponent(pendingTicket.id)}/regenerate`, { method: "POST", admin: true });
  assert.notEqual(regenerated.payload.data.drawCode, pendingTicket.drawCode);
  const oldLookup = await api("/api/public/lookup", { method: "POST", body: { code: pendingTicket.drawCode } });
  assert.equal(oldLookup.response.status, 404);
  const newLookup = await api("/api/public/lookup", { method: "POST", body: { code: regenerated.payload.data.drawCode } });
  assert.equal(newLookup.response.status, 200);

  const closed = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", admin: true, body: { status: "CLOSED" } });
  assert.equal(closed.payload.data.status, "CLOSED");
  const closedLookup = await api("/api/public/lookup", { method: "POST", body: { code: closedTicket.drawCode } });
  assert.equal(closedLookup.response.status, 404);

  const regenerateClaimed = await api(`/api/admin/tickets/${encodeURIComponent(claimedTicket.id)}/regenerate`, { method: "POST", admin: true });
  assert.equal(regenerateClaimed.response.status, 409);
  assert.equal(regenerateClaimed.payload.error.code, "ALREADY_CLAIMED");
});

test("competing requests return one claim and one recovery for the same code", async () => {
  const { env, api } = setup();
  const issued = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, quantity: 1 } });
  const code = issued.payload.data.tickets[0].drawCode;
  const [left, right] = await Promise.all([
    api("/api/public/claim", { method: "POST", body: { code } }),
    api("/api/public/claim", { method: "POST", body: { code } })
  ]);
  assert.equal(left.response.status, 200);
  assert.equal(right.response.status, 200);
  assert.equal(left.payload.data.ticket.serial, right.payload.data.ticket.serial);
  assert.deepEqual([left.payload.data.claim.recovered, right.payload.data.claim.recovered].sort(), [false, true]);
  const ticket = env.DB.database.prepare("SELECT claimed_at, claim_id FROM tickets").get();
  assert.ok(ticket.claimed_at);
  assert.ok(ticket.claim_id);
});

test("issuing the same request twice is idempotent", async () => {
  const { env, api } = setup();
  const first = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, quantity: 2 } });
  const retry = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, quantity: 2 } });
  assert.equal(first.response.status, 201);
  assert.equal(retry.response.status, 201);
  assert.deepEqual(retry.payload.data, first.payload.data);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) AS count FROM tickets").get().count, 2);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) AS count FROM issue_requests").get().count, 1);

  const futureExpiry = new Date(Date.now() + 60_000).toISOString();
  const expiredRetryPayload = { ...issuePayload, requestId: "test-issue-expiring-retry", quantity: 1, drawExpiresAt: futureExpiry };
  const expiring = await api("/api/admin/issue", { method: "POST", admin: true, body: expiredRetryPayload });
  assert.equal(expiring.response.status, 201);
  const actualNow = Date.now;
  Date.now = () => new Date(futureExpiry).valueOf() + 60_000;
  try {
    const retryAfterExpiry = await api("/api/admin/issue", { method: "POST", admin: true, body: expiredRetryPayload });
    assert.equal(retryAfterExpiry.response.status, 201);
    assert.deepEqual(retryAfterExpiry.payload.data, expiring.payload.data);
  } finally {
    Date.now = actualNow;
  }

  const conflict = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, quantity: 3 } });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.payload.error.code, "REQUEST_ID_CONFLICT");
});

test("invalid bodies, unsafe quantities, expiry, and unclaimed check-in are rejected", async () => {
  const { env, api } = setup();
  const invalidBody = await api("/api/public/lookup", { method: "POST", body: null });
  assert.equal(invalidBody.response.status, 400);
  assert.equal(invalidBody.payload.error.code, "INVALID_JSON");
  const oversized = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, requestId: "test-issue-request-0026", quantity: 26 } });
  assert.equal(oversized.response.status, 400);
  assert.equal(oversized.payload.error.code, "INVALID_QUANTITY");
  const expiredIssue = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, requestId: "test-issue-request-old-1", drawExpiresAt: "2020-01-01T00:00:00.000Z" } });
  assert.equal(expiredIssue.response.status, 400);
  assert.equal(expiredIssue.payload.error.code, "EXPIRY_IN_PAST");

  const issued = await api("/api/admin/issue", { method: "POST", admin: true, body: { ...issuePayload, requestId: "test-issue-request-state", quantity: 1 } });
  const ticket = issued.payload.data.tickets[0];
  const used = await api(`/api/admin/tickets/${ticket.id}`, { method: "PATCH", admin: true, body: { status: "USED" } });
  assert.equal(used.response.status, 409);
  assert.equal(used.payload.error.code, "NOT_CLAIMED");
  env.DB.database.prepare("UPDATE tickets SET draw_expires_at = '2020-01-01T00:00:00.000Z'").run();
  const state = await api("/api/admin/state", { admin: true });
  assert.equal(state.payload.data.sessions[0].totals.available, 0);
  const regenerated = await api(`/api/admin/tickets/${ticket.id}/regenerate`, { method: "POST", admin: true });
  assert.equal(regenerated.response.status, 409);
  assert.equal(regenerated.payload.error.code, "CODE_EXPIRED");
});

test("CORS accepts the public site and rejects unrelated origins", async () => {
  const { api } = setup();
  const allowed = await api("/api/health");
  assert.equal(allowed.response.headers.get("access-control-allow-origin"), "https://xieyaozhong.github.io");
  const rejected = await api("/api/health", { origin: "https://attacker.example" });
  assert.equal(rejected.response.headers.get("access-control-allow-origin"), null);
});

test("common ticket lookups use SQLite indexes", async () => {
  const { env, api } = setup();
  await api("/api/health");
  const indexes = env.DB.database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index'").all().map((row) => row.name);
  assert.ok(indexes.includes("idx_tickets_session_claim"));
  const codePlan = env.DB.database.prepare("EXPLAIN QUERY PLAN SELECT * FROM tickets WHERE draw_code_key = ?").all("TEST");
  assert.match(codePlan.map((row) => row.detail).join(" "), /INDEX/i);
  const sessionPlan = env.DB.database.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM tickets WHERE session_id = ? AND status = 'ACTIVE' AND claimed_at IS NULL").all("session");
  assert.match(sessionPlan.map((row) => row.detail).join(" "), /idx_tickets_session_claim/i);
});

test("packaged migration enforces the runtime status constraints", () => {
  const database = new DatabaseSync(":memory:");
  const migration = readFileSync(new URL("../drizzle/0000_theard_event_ops.sql", import.meta.url), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  database.exec("PRAGMA foreign_keys = ON");
  for (const statement of migration) database.exec(statement);
  assert.throws(() => database.prepare("INSERT INTO events (id, code, name, status, created_at, updated_at) VALUES ('bad','BAD','Bad','BROKEN','x','x')").run());
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='issue_requests'").get().count, 1);
});
