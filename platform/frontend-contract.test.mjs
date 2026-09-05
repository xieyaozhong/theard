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
  for(const method of ['connectAdmin','getAdminState','issueSession','updateTicketStatus','regenerateDrawCode','updateSession','updateSessionStatus','deleteSession'])assert.match(app,new RegExp(method));
  for(const id of ['sessionEditDialog','sessionEditForm','sessionDeleteDialog','sessionDeleteConfirm','confirmSessionDelete'])assert.match(html,new RegExp(`id="${id}"`));
  for(const action of ['edit-session','toggle-session','delete-session'])assert.match(app,new RegExp(action));
  assert.match(api,/method:'DELETE'/);assert.match(app,/expectedUpdatedAt/);assert.match(app,/SESSION DELETED/);
  assert.doesNotMatch(app,/localStorage/);assert.doesNotMatch(api,/sessionStorage|localStorage/);assert.match(app,/authEpoch/);assert.match(app,/requestId/);assert.match(app,/setInterval\([^,]+,5000\)/s);assert.match(app,/DRAW CODE/);
});

test("ticket viewer and verification are read-only",async()=>{
  const [ticket,ticketApp,verify]=await Promise.all([read('site/ticket.html'),read('site/ticket.js'),read('site/verify.html')]);
  assert.doesNotMatch(ticket,/ticketForm|GENERATE PASS|cdn\.jsdelivr/);assert.doesNotMatch(ticketApp,/makeId|Math\.random/);
  assert.match(ticketApp,/theard\.passdraw\.latest/);assert.match(ticketApp,/verify\.html/);assert.match(ticketApp,/verifyToken/);
  assert.match(verify,/TheardAPI\.verifyTicket/);for(const state of ['VALID','USED','REVOKED','NOT FOUND'])assert.match(verify,new RegExp(state));
  assert.doesNotMatch(verify,/updateTicketStatus|check.?in/i);
});

test("public and branch-root Pages recover app routes",async()=>{
  const [root404,site404,main]=await Promise.all([read('404.html'),read('site/404.html'),read('site/index.html')]);
  assert.match(root404,/\/theard\/site\/admin\//);assert.match(site404,/\/theard\/admin\//);assert.match(main,/href="draw\/"[^>]*><span>\/\/06<\/span><b>TICKET<\/b>/);
  assert.match(root404,/\/theard\/site\/workshop\//);assert.match(site404,/\/theard\/workshop\//);
});

test("homepage activity zone syncs safe public sessions",async()=>{
  const [html,mainApp,activity,api]=await Promise.all([
    read('site/index.html'),read('site/app.js'),read('site/activity.js'),read('site/api.js')
  ]);
  assert.match(html,/id="activities"/);assert.match(html,/href="workshop\/"/);
  assert.match(html,/data-public-sessions-list/);assert.match(html,/data-public-session-template/);
  assert.match(mainApp,/\.\/activity\.js/);assert.match(api,/listPublicSessions/);assert.match(activity,/listPublicSessions/);
  assert.doesNotMatch(activity,/innerHTML/);assert.match(activity,/textContent/);
});

test("Prompt Lab supports a BYO-AI classroom flow without uploading outputs",async()=>{
  const [html,app]=await Promise.all([read('site/workshop/index.html'),read('site/workshop/app.js')]);
  for(const id of ['promptForm','timerPanel','lockAndShuffle','comparisonGrid','bingoGrid'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/DEVICE-LOCAL ONLY/);assert.match(html,/NO API \/ NO UPLOAD/);
  assert.match(html,/提示詞抽取器/);
  assert.match(html,/模型家族與架構/);assert.match(html,/系統指令/);assert.match(html,/取樣與解碼/);
  assert.match(app,/localStorage/);assert.match(app,/clipboard/);assert.doesNotMatch(app,/fetch\s*\(/);
});
