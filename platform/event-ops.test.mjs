import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker, { SCHEMA } from "./worker.js";
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
  date: "2099-09-12",
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

test("public sessions list only published open activity data with claimable availability", async () => {
  const { env, api } = setup();
  const visible = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: {
      ...issuePayload,
      requestId: "test-public-sessions-visible",
      quantity: 4,
      note: "Public attendee instructions"
    }
  });
  const [claimedTicket, availableTicket, revokedTicket, expiredTicket] = visible.payload.data.tickets;
  await api("/api/public/claim", {
    method: "POST",
    body: { code: claimedTicket.drawCode, attendeeName: "PRIVATE ATTENDEE NAME" }
  });
  await api(`/api/admin/tickets/${encodeURIComponent(revokedTicket.id)}`, {
    method: "PATCH",
    admin: true,
    body: { status: "REVOKED" }
  });
  env.DB.database.prepare("UPDATE tickets SET draw_expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(expiredTicket.id);

  const closed = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: {
      ...issuePayload,
      requestId: "test-public-sessions-closed",
      eventName: "PRIVATE CLOSED EVENT",
      eventCode: "CLOSED1",
      sessionCode: "SECRET",
      note: "PRIVATE CLOSED NOTE",
      quantity: 1
    }
  });
  const stateBeforeClose = await api("/api/admin/state", { admin: true });
  const closedSession = stateBeforeClose.payload.data.sessions.find((session) => session.id === closed.payload.data.session.id);
  await api(`/api/admin/sessions/${encodeURIComponent(closed.payload.data.session.id)}`, {
    method: "PATCH",
    admin: true,
    body: { status: "CLOSED", expectedUpdatedAt: closedSession.updatedAt }
  });

  await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: {
      ...issuePayload,
      requestId: "test-public-sessions-draft",
      eventName: "PRIVATE DRAFT EVENT",
      eventCode: "DRAFT1",
      sessionCode: "HIDDEN",
      note: "PRIVATE DRAFT NOTE",
      quantity: 1
    }
  });
  env.DB.database.prepare("UPDATE events SET status = 'DRAFT' WHERE code = 'DRAFT1'").run();

  const eventId = visible.payload.data.session.eventId;
  const insertedAt = new Date().toISOString();
  for (let index = 0; index < 25; index += 1) {
    env.DB.database.prepare(`
      INSERT INTO sessions (id, event_id, code, event_date, start_time, venue, note, status, created_at, updated_at)
      VALUES (?, ?, ?, '2020-01-01', '09:00', 'PAST VENUE', 'PAST NOTE', 'OPEN', ?, ?)
    `).run(`ses_past_${index}`, eventId, `PAST${index}`, insertedAt, insertedAt);
  }

  const listing = await api("/api/public/sessions");
  assert.equal(listing.response.status, 200);
  assert.equal(listing.response.headers.get("access-control-allow-origin"), "https://xieyaozhong.github.io");
  assert.equal(listing.payload.ok, true);
  assert.match(listing.payload.data.syncedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(listing.payload.data.sessions.length, 1);

  const [session] = listing.payload.data.sessions;
  assert.deepEqual(Object.keys(session).sort(), [
    "date", "eventCode", "eventId", "eventName", "eventStatus", "id", "note",
    "sessionCode", "status", "time", "totals", "venue"
  ].sort());
  assert.deepEqual(session, {
    id: visible.payload.data.session.id,
    eventId: visible.payload.data.session.eventId,
    eventName: issuePayload.eventName,
    eventCode: issuePayload.eventCode,
    eventStatus: "PUBLISHED",
    sessionCode: issuePayload.sessionCode,
    date: issuePayload.date,
    time: issuePayload.time,
    venue: issuePayload.venue,
    note: "Public attendee instructions",
    status: "OPEN",
    totals: { issued: 4, available: 1, claimed: 1 }
  });
  assert.equal(session.totals.available, Number(Boolean(availableTicket)));

  const serialized = JSON.stringify(listing.payload);
  for (const privateValue of [
    claimedTicket.drawCode,
    claimedTicket.verifyToken,
    claimedTicket.serial,
    "PRIVATE ATTENDEE NAME",
    "PRIVATE CLOSED EVENT",
    "PRIVATE CLOSED NOTE",
    "PRIVATE DRAFT EVENT",
    "PRIVATE DRAFT NOTE"
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  for (const privateKey of ["drawCode", "draw_code", "verifyToken", "verify_token", "attendeeName", "attendee_name", "tickets"]) {
    assert.equal(privateKey in session, false);
    assert.equal(serialized.includes(`\"${privateKey}\"`), false);
  }
});

test("ticket status, verification, session close, and code regeneration are enforced", async () => {
  const { api } = setup();
  const issued = await api("/api/admin/issue", { method: "POST", admin: true, body: issuePayload });
  const [claimedTicket, pendingTicket, closedTicket] = issued.payload.data.tickets;
  const sessionId = issued.payload.data.session.id;
  const issuedState = await api("/api/admin/state", { admin: true });
  const sessionUpdatedAt = issuedState.payload.data.sessions.find((session) => session.id === sessionId).updatedAt;

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

  const closed = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", admin: true, body: { status: "CLOSED", expectedUpdatedAt: sessionUpdatedAt } });
  assert.equal(closed.payload.data.status, "CLOSED");
  const closedLookup = await api("/api/public/lookup", { method: "POST", body: { code: closedTicket.drawCode } });
  assert.equal(closedLookup.response.status, 404);

  const regenerateClaimed = await api(`/api/admin/tickets/${encodeURIComponent(claimedTicket.id)}/regenerate`, { method: "POST", admin: true });
  assert.equal(regenerateClaimed.response.status, 409);
  assert.equal(regenerateClaimed.payload.error.code, "ALREADY_CLAIMED");
});

test("session metadata editing is optimistic, audited, and visible across public views", async () => {
  const { env, api } = setup();
  const payload = { ...issuePayload, requestId: "test-session-edit-0001", quantity: 1 };
  const issued = await api("/api/admin/issue", { method: "POST", admin: true, body: payload });
  const ticket = issued.payload.data.tickets[0];
  const sessionId = issued.payload.data.session.id;
  const initialState = await api("/api/admin/state", { admin: true });
  const initial = initialState.payload.data.sessions.find((session) => session.id === sessionId);

  const unauthorized = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: { time: "20:30", expectedUpdatedAt: initial.updatedAt }
  });
  assert.equal(unauthorized.response.status, 401);

  const immutable = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    admin: true,
    body: { date: "2099-09-13", expectedUpdatedAt: initial.updatedAt }
  });
  assert.equal(immutable.response.status, 400);
  assert.equal(immutable.payload.error.code, "IMMUTABLE_FIELD");

  const missingVersion = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    admin: true,
    body: { time: "20:30" }
  });
  assert.equal(missingVersion.response.status, 400);
  assert.equal(missingVersion.payload.error.code, "EXPECTED_VERSION_REQUIRED");

  const edited = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    admin: true,
    body: {
      time: "20:30",
      venue: "TAIPEI / UPDATED VENUE",
      note: "Updated attendee instructions",
      expectedUpdatedAt: initial.updatedAt
    }
  });
  assert.equal(edited.response.status, 200);
  assert.notEqual(edited.payload.data.updatedAt, initial.updatedAt);

  const stale = await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    admin: true,
    body: { time: "21:00", expectedUpdatedAt: initial.updatedAt }
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.payload.error.code, "SESSION_CHANGED");

  const state = await api("/api/admin/state", { admin: true });
  const stored = state.payload.data.sessions.find((session) => session.id === sessionId);
  assert.equal(stored.time, "20:30");
  assert.equal(stored.venue, "TAIPEI / UPDATED VENUE");
  assert.equal(stored.note, "Updated attendee instructions");
  assert.equal(stored.eventName, payload.eventName);
  assert.equal(stored.date, payload.date);
  assert.equal(stored.tickets[0].serial, ticket.serial);
  assert.equal(stored.tickets[0].drawCode, ticket.drawCode);

  const listing = await api("/api/public/sessions");
  const publicSession = listing.payload.data.sessions.find((session) => session.id === sessionId);
  assert.equal(publicSession.time, "20:30");
  assert.equal(publicSession.venue, "TAIPEI / UPDATED VENUE");
  assert.equal(publicSession.note, "Updated attendee instructions");

  const lookup = await api("/api/public/lookup", { method: "POST", body: { code: ticket.drawCode } });
  assert.equal(lookup.payload.data.session.time, "20:30");
  assert.equal(lookup.payload.data.session.venue, "TAIPEI / UPDATED VENUE");
  const verify = await api("/api/public/verify", { method: "POST", body: { serial: ticket.serial, token: ticket.verifyToken } });
  assert.equal(verify.payload.data.session.time, "20:30");
  assert.equal(verify.payload.data.session.venue, "TAIPEI / UPDATED VENUE");

  const oldMetadataIssue = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: { ...payload, requestId: "test-session-edit-old-data" }
  });
  assert.equal(oldMetadataIssue.response.status, 409);
  assert.equal(oldMetadataIssue.payload.error.code, "SESSION_METADATA_CONFLICT");
  const matchingIssue = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: {
      ...payload,
      requestId: "test-session-edit-new-data",
      time: "20:30",
      venue: "TAIPEI / UPDATED VENUE",
      note: "Updated attendee instructions"
    }
  });
  assert.equal(matchingIssue.response.status, 201);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'SESSION_UPDATED'").get().count, 1);
});

test("session deletion revokes unclaimed codes, preserves siblings, and blocks claimed records", async () => {
  const { env, api } = setup();
  const deletablePayload = {
    ...issuePayload,
    requestId: "test-session-delete-0001",
    eventCode: "DEL001",
    sessionCode: "A",
    quantity: 2
  };
  const deletable = await api("/api/admin/issue", { method: "POST", admin: true, body: deletablePayload });
  const sibling = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: { ...deletablePayload, requestId: "test-session-delete-sibling", sessionCode: "B" }
  });
  const state = await api("/api/admin/state", { admin: true });
  const session = state.payload.data.sessions.find((item) => item.id === deletable.payload.data.session.id);
  const [firstTicket] = deletable.payload.data.tickets;

  const preflight = await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, { method: "OPTIONS" });
  assert.equal(preflight.response.status, 204);
  assert.match(preflight.response.headers.get("access-control-allow-methods"), /DELETE/);

  const unauthorized = await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, {
    method: "DELETE",
    body: { expectedUpdatedAt: session.updatedAt }
  });
  assert.equal(unauthorized.response.status, 401);

  const deleted = await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, {
    method: "DELETE",
    admin: true,
    body: { expectedUpdatedAt: session.updatedAt }
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.payload.data.affectedTickets, 2);
  const deletedRow = env.DB.database.prepare("SELECT status, deleted_at FROM sessions WHERE id = ?").get(session.id);
  assert.equal(deletedRow.status, "CLOSED");
  assert.ok(deletedRow.deleted_at);
  assert.deepEqual(
    env.DB.database.prepare("SELECT DISTINCT status FROM tickets WHERE session_id = ?").all(session.id).map((row) => row.status),
    ["REVOKED"]
  );

  const after = await api("/api/admin/state", { admin: true });
  assert.equal(after.payload.data.sessions.some((item) => item.id === session.id), false);
  assert.equal(after.payload.data.sessions.some((item) => item.id === sibling.payload.data.session.id), true);
  const listing = await api("/api/public/sessions");
  assert.equal(listing.payload.data.sessions.some((item) => item.id === session.id), false);
  const lookup = await api("/api/public/lookup", { method: "POST", body: { code: firstTicket.drawCode } });
  assert.equal(lookup.response.status, 404);
  const claim = await api("/api/public/claim", { method: "POST", body: { code: firstTicket.drawCode } });
  assert.equal(claim.response.status, 404);
  const verify = await api("/api/public/verify", { method: "POST", body: { serial: firstTicket.serial, token: firstTicket.verifyToken } });
  assert.equal(verify.response.status, 404);
  const regenerate = await api(`/api/admin/tickets/${encodeURIComponent(firstTicket.id)}/regenerate`, { method: "POST", admin: true });
  assert.equal(regenerate.response.status, 404);
  const ticketPatch = await api(`/api/admin/tickets/${encodeURIComponent(firstTicket.id)}`, { method: "PATCH", admin: true, body: { status: "ACTIVE" } });
  assert.equal(ticketPatch.response.status, 404);

  const oldRetry = await api("/api/admin/issue", { method: "POST", admin: true, body: deletablePayload });
  assert.equal(oldRetry.response.status, 409);
  assert.equal(oldRetry.payload.error.code, "SESSION_DELETED");
  const newRetry = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: { ...deletablePayload, requestId: "test-session-delete-new-request" }
  });
  assert.equal(newRetry.response.status, 409);
  assert.equal(newRetry.payload.error.code, "SESSION_DELETED");
  const patchDeleted = await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    admin: true,
    body: { status: "OPEN", expectedUpdatedAt: session.updatedAt }
  });
  assert.equal(patchDeleted.response.status, 404);
  const deleteAgain = await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, {
    method: "DELETE",
    admin: true,
    body: { expectedUpdatedAt: session.updatedAt }
  });
  assert.equal(deleteAgain.response.status, 404);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'SESSION_DELETED'").get().count, 1);

  const protectedIssue = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: { ...issuePayload, requestId: "test-session-delete-claimed", eventCode: "KEEP01", quantity: 1 }
  });
  const protectedTicket = protectedIssue.payload.data.tickets[0];
  await api("/api/public/claim", { method: "POST", body: { code: protectedTicket.drawCode } });
  await api(`/api/admin/tickets/${encodeURIComponent(protectedTicket.id)}`, { method: "PATCH", admin: true, body: { status: "REVOKED" } });
  const protectedState = await api("/api/admin/state", { admin: true });
  const protectedSession = protectedState.payload.data.sessions.find((item) => item.id === protectedIssue.payload.data.session.id);
  const blocked = await api(`/api/admin/sessions/${encodeURIComponent(protectedSession.id)}`, {
    method: "DELETE",
    admin: true,
    body: { expectedUpdatedAt: protectedSession.updatedAt }
  });
  assert.equal(blocked.response.status, 409);
  assert.equal(blocked.payload.error.code, "SESSION_HAS_CLAIMS");
  assert.equal(env.DB.database.prepare("SELECT deleted_at FROM sessions WHERE id = ?").get(protectedSession.id).deleted_at, null);
  assert.equal(env.DB.database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'SESSION_DELETED'").get().count, 1);
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

test("competing claim and session deletion cannot produce a claimed deleted ticket", async () => {
  const { env, api } = setup();
  const issued = await api("/api/admin/issue", {
    method: "POST",
    admin: true,
    body: { ...issuePayload, requestId: "test-delete-claim-race", eventCode: "RACE01", quantity: 1 }
  });
  const ticket = issued.payload.data.tickets[0];
  const state = await api("/api/admin/state", { admin: true });
  const session = state.payload.data.sessions.find((item) => item.id === issued.payload.data.session.id);
  const [deletion, claim] = await Promise.all([
    api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, {
      method: "DELETE",
      admin: true,
      body: { expectedUpdatedAt: session.updatedAt }
    }),
    api("/api/public/claim", { method: "POST", body: { code: ticket.drawCode } })
  ]);
  const storedSession = env.DB.database.prepare("SELECT deleted_at FROM sessions WHERE id = ?").get(session.id);
  const storedTicket = env.DB.database.prepare("SELECT claimed_at FROM tickets WHERE id = ?").get(ticket.id);
  assert.equal(Boolean(storedSession.deleted_at && storedTicket.claimed_at), false);
  if (deletion.response.status === 200) {
    assert.equal(claim.response.status, 404);
    assert.ok(storedSession.deleted_at);
    assert.equal(storedTicket.claimed_at, null);
  } else {
    assert.equal(deletion.response.status, 409);
    assert.equal(deletion.payload.error.code, "SESSION_HAS_CLAIMS");
    assert.equal(claim.response.status, 200);
    assert.equal(storedSession.deleted_at, null);
    assert.ok(storedTicket.claimed_at);
  }
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

test("packaged migrations upgrade existing sessions and guard deleted ticket inserts", () => {
  const database = new DatabaseSync(":memory:");
  const statements = (file) => readFileSync(new URL(file, import.meta.url), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  database.exec("PRAGMA foreign_keys = ON");
  for (const statement of statements("../drizzle/0000_theard_event_ops.sql")) database.exec(statement);
  assert.throws(() => database.prepare("INSERT INTO events (id, code, name, status, created_at, updated_at) VALUES ('bad','BAD','Bad','BROKEN','x','x')").run());
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='issue_requests'").get().count, 1);
  database.prepare("INSERT INTO events (id, code, name, status, created_at, updated_at) VALUES ('evt_old','OLD','Existing','PUBLISHED','x','x')").run();
  database.prepare("INSERT INTO sessions (id, event_id, code, event_date, start_time, status, created_at, updated_at) VALUES ('ses_old','evt_old','A','2099-01-01','19:00','OPEN','x','x')").run();

  for (const statement of statements("../drizzle/0001_session_soft_delete.sql")) database.exec(statement);
  const columns = database.prepare("PRAGMA table_info(sessions)").all().map((column) => column.name);
  assert.ok(columns.includes("deleted_at"));
  assert.equal(database.prepare("SELECT deleted_at FROM sessions WHERE id = 'ses_old'").get().deleted_at, null);
  let schemaObjects = database.prepare("SELECT name FROM sqlite_schema WHERE type IN ('index','trigger')").all().map((row) => row.name);
  assert.ok(schemaObjects.includes("idx_sessions_visible_date"));
  for (const statement of SCHEMA) database.exec(statement);
  schemaObjects = database.prepare("SELECT name FROM sqlite_schema WHERE type IN ('index','trigger')").all().map((row) => row.name);
  assert.ok(schemaObjects.includes("block_ticket_insert_deleted_session"));

  database.prepare("UPDATE sessions SET deleted_at = '2099-01-02T00:00:00.000Z' WHERE id = 'ses_old'").run();
  assert.throws(() => database.prepare(`
    INSERT INTO tickets (
      id, session_id, serial, pass_type, rarity, zone, status, draw_code, draw_code_key,
      verify_token, batch_id, issued_at, updated_at
    ) VALUES ('tkt_late','ses_old','OLD-1','GENERAL PASS','COMMON','G','ACTIVE','OLD-CODE','OLDCODE','TOKEN','BATCH','x','x')
  `).run(), /SESSION_DELETED/);
});
