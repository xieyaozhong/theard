import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,'..');
const read=(path)=>readFile(resolve(root,path),'utf8');

test("draw uses a verified code and server-decided ticket",async()=>{
  const [html,app]=await Promise.all([read('site/draw/index.html'),read('site/draw/app.js')]);
  for(const id of ['inviteForm','inviteCode','sessionPreview','drawBtn','ticketCode'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/\.\.\/api\.js/);assert.match(app,/lookupDrawCode/);assert.match(app,/claimDrawCode/);
  assert.doesNotMatch(app,/state\.remaining/);assert.doesNotMatch(html,/EDIT POOL/);
  assert.match(app,/claimDrawCode\([^;]+;if\(!result\?\.ticket[\s\S]+await animateResult\(result(?:,[^)]+)?\)/,'server claim must precede reveal animation');
  assert.match(app,/normalizeHistoryEntry/);assert.match(app,/RARITIES\.includes\(entry\.rarity\)/);
  assert.match(app,/theard\.passdraw\.latest/);assert.match(app,/PASS_DRAWN/);
});

test("admin uses the shared ledger and memory-only runtime key",async()=>{
  const [html,app,api]=await Promise.all([read('site/admin/index.html'),read('site/admin/app.js'),read('site/api.js')]);
  assert.match(html,/\.\.\/api\.js/);assert.match(html,/id="authForm"/);assert.match(html,/id="drawExpiresAt"/);
  for(const method of ['connectAdmin','getAdminState','issueSession','updateTicketStatus','regenerateDrawCode','updateSessionStatus'])assert.match(app,new RegExp(method));
  assert.doesNotMatch(app,/localStorage/);assert.doesNotMatch(api,/sessionStorage|localStorage/);assert.match(app,/authEpoch/);assert.match(app,/requestId/);assert.match(app,/setInterval\([^,]+,5000\)/s);assert.match(app,/DRAW CODE/);
});

test("ticket viewer and verification are read-only",async()=>{
  const [ticket,ticketApp,verify]=await Promise.all([read('site/ticket.html'),read('site/ticket.js'),read('site/verify.html')]);
  assert.doesNotMatch(ticket,/ticketForm|GENERATE PASS|cdn\.jsdelivr/);assert.doesNotMatch(ticketApp,/makeId|Math\.random/);
  assert.match(ticketApp,/theard\.passdraw\.latest/);assert.match(ticketApp,/verify\.html/);assert.match(ticketApp,/verifyToken/);
  assert.match(verify,/TheardAPI\.verifyTicket/);for(const state of ['VALID','USED','REVOKED','NOT FOUND'])assert.match(verify,new RegExp(state));
  assert.doesNotMatch(verify,/updateTicketStatus|check.?in/i);
});

test("public and branch-root Pages both recover the admin route",async()=>{
  const [root404,site404,main]=await Promise.all([read('404.html'),read('site/404.html'),read('site/index.html')]);
  assert.match(root404,/\/theard\/site\/admin\//);assert.match(site404,/\/theard\/admin\//);assert.match(main,/href="draw\/"[^>]*><span>\/\/05<\/span><b>TICKET<\/b>/);
});
