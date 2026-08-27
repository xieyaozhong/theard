(function bootstrapPromptLab() {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'theard.promptlab.device-draft.v1';
  const PROMPT_FIELDS = ['goal', 'context', 'audience', 'tone', 'constraints', 'outputFormat'];
  const STAGES = [
    { code: '00', name: 'ORIENT', minutes: 5 },
    { code: '01', name: 'BUILD', minutes: 10 },
    { code: '02', name: 'RUN', minutes: 8 },
    { code: '03', name: 'COMPARE', minutes: 12 },
    { code: '04', name: 'DEBRIEF', minutes: 10 }
  ];
  const RUBRIC = [
    { key: 'fit', label: 'FIT' },
    { key: 'structure', label: 'STRUCTURE' },
    { key: 'specificity', label: 'SPECIFICITY' },
    { key: 'usability', label: 'USABILITY' }
  ];
  const INTERACTIONS = [
    { title: 'PAIR SWAP / 90 SEC', text: '與隔壁隊交換 prompt，只看文字說出你理解的任務；原隊不能補充。' },
    { title: 'EVIDENCE HUNT', text: '每隊在輸出中圈出一句最能支持評分的證據，不能只報感覺。' },
    { title: 'DEVIL’S ADVOCATE', text: '替目前票數最低的作品提出一個最強優點，再決定是否改票。' },
    { title: '30-SECOND DEFENSE', text: '每隊用 30 秒辯護自己的選擇：一個維度、一段證據、一個風險。' },
    { title: 'RANK FIRST / TALK LATER', text: '所有人先靜默排序 A／B／C，再討論分歧最大的評分維度。' },
    { title: 'MISSING PIECE', text: '每隊只找一個輸出共同遺漏的資訊，回推 prompt 哪裡仍不夠清楚。' },
    { title: 'ONE-WORD VERDICT', text: '每人先用一個詞描述各輸出的結構，再用原文證明那個詞。' },
    { title: 'ROLE REVERSAL', text: '換成目標受眾的角度，指出哪份輸出最容易理解、哪裡最容易誤解。' }
  ];
  const CONSTRAINTS = [
    { title: '80-WORD CEILING', text: '總長度不得超過 80 個中文字或英文單字。' },
    { title: 'NO JARGON', text: '不得使用未解釋的專業術語；必要術語要用一句白話補充。' },
    { title: 'THREE-BLOCK OUTPUT', text: '輸出只能有三個區塊，每個區塊都要有清楚標題。' },
    { title: 'ASSUMPTIONS FIRST', text: '若資訊不足，先列出最多 3 個合理假設，再開始回答。' },
    { title: 'SHOW UNCERTAINTY', text: '明確標出無法由現有資訊確認的內容，不得自行補成事實。' },
    { title: 'ACTION IN 10 MINUTES', text: '最後必須提出一個能在 10 分鐘內開始執行的下一步。' },
    { title: 'TABLE + TAKEAWAY', text: '主要內容用表格呈現，表格後只留一句決策建議。' },
    { title: 'TWO AUDIENCE LAYERS', text: '先給非專業者版本，再給熟悉主題者的補充版本。' },
    { title: 'NO INVENTED NUMBERS', text: '不得生成未提供來源的數字、比例、研究或引言。' }
  ];
  const BINGO_LINES = [
    ['goal', 'context', 'audience'],
    ['constraint', 'format', 'compare'],
    ['evidence', 'uncertainty', 'reuse'],
    ['goal', 'constraint', 'evidence'],
    ['context', 'format', 'uncertainty'],
    ['audience', 'compare', 'reuse'],
    ['goal', 'format', 'reuse'],
    ['audience', 'format', 'evidence']
  ];

  const state = {
    currentStage: 0,
    completed: new Set(),
    interaction: null,
    constraint: null,
    blindItems: [],
    scores: {},
    votes: new Map(),
    sourcesRevealed: false,
    bingo: new Set(),
    bingoHadLine: false,
    timer: { total: 300, remaining: 300, running: false, endAt: 0, interval: null },
    suspendPersistence: false,
    savedDraftProtected: false
  };

  let toastTimer = null;
  let saveTimer = null;
  const rouletteIntervals = new Set();

  function showToast(message) {
    const toast = $('#labToast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function randomIndex(length) {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0] % length;
    }
    return Math.floor(Math.random() * length);
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  async function copyText(text, successMessage = '已複製。') {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        fallback.remove();
        if (!copied) throw new Error('Clipboard unavailable');
      }
      showToast(successMessage);
      return true;
    } catch {
      showToast('無法自動複製，請選取文字後手動複製。');
      return false;
    }
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function renderTimer() {
    const value = formatTime(state.timer.remaining);
    $('#timerDisplay').textContent = value;
    $('#hudTimer').textContent = value;
    $('#timerToggle').textContent = state.timer.running ? 'PAUSE' : (state.timer.remaining === 0 ? 'RESTART' : 'START');
    $('#timerPanel').classList.toggle('is-running', state.timer.running);
    $('#timerPanel').classList.toggle('is-finished', state.timer.remaining === 0);
  }

  function stopTimer() {
    if (state.timer.interval) clearInterval(state.timer.interval);
    state.timer.interval = null;
    state.timer.running = false;
  }

  function tickTimer() {
    state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    if (state.timer.remaining === 0) {
      stopTimer();
      $('#timerAnnouncement').textContent = '時間到。請完成目前句子並進入下一階段。';
      showToast('TIME / 時間到，請完成目前句子。');
    }
    renderTimer();
  }

  function startTimer() {
    if (state.timer.remaining === 0) state.timer.remaining = state.timer.total;
    state.timer.endAt = Date.now() + (state.timer.remaining * 1000);
    state.timer.running = true;
    state.timer.interval = setInterval(tickTimer, 250);
    $('#timerAnnouncement').textContent = `計時開始，剩餘 ${formatTime(state.timer.remaining)}。`;
    renderTimer();
  }

  function pauseTimer() {
    tickTimer();
    stopTimer();
    $('#timerAnnouncement').textContent = `計時暫停，剩餘 ${formatTime(state.timer.remaining)}。`;
    renderTimer();
  }

  function setTimer(seconds, announce = true) {
    stopTimer();
    state.timer.total = Number(seconds);
    state.timer.remaining = Number(seconds);
    $('#timerPreset').value = String(seconds);
    if (announce) $('#timerAnnouncement').textContent = `計時器設定為 ${formatTime(seconds)}。`;
    renderTimer();
    scheduleDraftSave();
  }

  function updateStageUI() {
    const definition = STAGES[state.currentStage];
    $('#hudStage').textContent = `STAGE ${definition.code} / ${definition.name}`;
    $('#loadStageTime').textContent = `LOAD STAGE ${definition.code} / ${String(definition.minutes).padStart(2, '0')}:00`;
    $$('[data-stage-target]').forEach((button) => {
      const index = Number(button.dataset.stageTarget);
      if (button.closest('.stage-nav')) {
        if (index === state.currentStage) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
        button.classList.toggle('is-complete', state.completed.has(index));
      }
    });
    $$('[data-stage-panel]').forEach((panel) => panel.classList.toggle('is-active', Number(panel.dataset.stagePanel) === state.currentStage));
    $$('[data-complete-stage]').forEach((button) => {
      const complete = state.completed.has(Number(button.dataset.completeStage));
      button.classList.toggle('is-complete', complete);
      button.setAttribute('aria-pressed', String(complete));
    });
    const completed = state.completed.size;
    $('#progressCount').textContent = `${completed} / ${STAGES.length}`;
    $('#progressText').textContent = completed === STAGES.length ? 'LAB COMPLETE' : `STAGE ${definition.code} ACTIVE`;
    $('#progressBar').style.width = `${(completed / STAGES.length) * 100}%`;
    const progress = $('.progress-track');
    progress.setAttribute('aria-valuenow', String(completed));
  }

  function setStage(index, { scroll = true, focus = true } = {}) {
    const safeIndex = Math.min(STAGES.length - 1, Math.max(0, Number(index)));
    state.currentStage = safeIndex;
    updateStageUI();
    const panel = $(`[data-stage-panel="${safeIndex}"]`);
    if (scroll) panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (focus) setTimeout(() => panel.focus({ preventScroll: true }), 350);
  }

  function markComplete(index, complete = true) {
    if (complete) state.completed.add(Number(index));
    else state.completed.delete(Number(index));
    updateStageUI();
    showToast(complete ? `STAGE ${STAGES[index].code} COMPLETE` : `STAGE ${STAGES[index].code} REOPENED`);
  }

  function promptParts() {
    return Object.fromEntries(PROMPT_FIELDS.map((id) => [id, $(`#${id}`).value.trim()]));
  }

  function composedPrompt(parts = promptParts()) {
    const value = (text) => text || '（請補充）';
    return [
      '請依照以下規格完成任務。先理解全部條件，再開始回答。',
      '',
      `【任務目標】\n${value(parts.goal)}`,
      '',
      `【背景與脈絡】\n${value(parts.context)}`,
      '',
      `【目標受眾】\n${value(parts.audience)}`,
      '',
      `【語氣與風格】\n${value(parts.tone)}`,
      '',
      `【限制條件】\n${value(parts.constraints)}`,
      '',
      `【輸出格式】\n${value(parts.outputFormat)}`,
      '',
      '【品質守則】',
      '若現有資訊不足，請明確列出合理假設與不確定處；不要把未提供的資訊寫成已知事實。完成後自行檢查是否符合目標、受眾、限制與輸出格式。'
    ].join('\n');
  }

  function compactPrompt(parts = promptParts()) {
    return [
      `目標：${parts.goal || '（請補充）'}`,
      `背景：${parts.context || '（請補充）'}`,
      `受眾：${parts.audience || '（請補充）'}`,
      `語氣：${parts.tone || '（請補充）'}`,
      `限制：${parts.constraints || '（請補充）'}`,
      `格式：${parts.outputFormat || '（請補充）'}`,
      '資訊不足時請標示假設與不確定性，不得虛構未提供的事實。'
    ].join('\n');
  }

  function updatePrompt() {
    const parts = promptParts();
    const readyCount = PROMPT_FIELDS.filter((id) => parts[id]).length;
    const prompt = composedPrompt(parts);
    $('#composedPrompt').textContent = prompt;
    $('#promptCharacters').textContent = `${Array.from(prompt).length} CHARS`;
    $('#promptCompleteness').textContent = `${readyCount} / 6 READY`;
    $('#promptMeter').value = readyCount;
    $$('[data-check-field]').forEach((badge) => badge.classList.toggle('is-ready', Boolean(parts[badge.dataset.checkField])));
    scheduleDraftSave();
  }

  function storageGet() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function storageRemove() {
    try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
  }

  function saveDraft() {
    if (state.suspendPersistence || state.savedDraftProtected || !$('#rememberDraft').checked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        fields: promptParts(),
        timerSeconds: state.timer.total
      }));
      $('#storageState').textContent = 'LOCAL DRAFT SAVED';
    } catch {
      $('#storageState').textContent = 'LOCAL STORAGE UNAVAILABLE';
    }
  }

  function scheduleDraftSave() {
    if (state.suspendPersistence || state.savedDraftProtected || !$('#rememberDraft')?.checked) return;
    clearTimeout(saveTimer);
    $('#storageState').textContent = 'SAVING DEVICE DRAFT…';
    saveTimer = setTimeout(saveDraft, 450);
  }

  function loadDraft() {
    const raw = storageGet();
    if (!raw) {
      $('#storageState').textContent = 'NO SAVED DEVICE DRAFT';
      return false;
    }
    try {
      const draft = JSON.parse(raw);
      if (draft?.version !== 1 || typeof draft.fields !== 'object') {
        $('#storageState').textContent = 'LOCAL DRAFT COULD NOT LOAD';
        return false;
      }
      state.suspendPersistence = true;
      PROMPT_FIELDS.forEach((id) => {
        if (typeof draft.fields[id] === 'string') $(`#${id}`).value = draft.fields[id];
      });
      const timer = Number(draft.timerSeconds);
      if ([180, 300, 480, 600, 720, 900].includes(timer)) setTimer(timer, false);
      state.savedDraftProtected = false;
      $('#storageState').textContent = 'LOCAL DRAFT LOADED';
      return true;
    } catch {
      $('#storageState').textContent = 'LOCAL DRAFT COULD NOT LOAD';
      return false;
    } finally {
      state.suspendPersistence = false;
    }
  }

  function spinRoulette(items, output, button, onFinish) {
    button.disabled = true;
    output.classList.add('is-spinning');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const result = items[randomIndex(items.length)];
      $('span', output).textContent = 'RESULT LOCKED';
      $('b', output).textContent = result.title;
      $('p', output).textContent = result.text;
      output.classList.remove('is-spinning');
      button.disabled = false;
      onFinish(result);
      return;
    }
    let frame = 0;
    const cycle = setInterval(() => {
      const candidate = items[randomIndex(items.length)];
      $('b', output).textContent = candidate.title;
      $('p', output).textContent = candidate.text;
      frame += 1;
      if (frame >= 11) {
        clearInterval(cycle);
        rouletteIntervals.delete(cycle);
        const result = items[randomIndex(items.length)];
        $('span', output).textContent = 'RESULT LOCKED';
        $('b', output).textContent = result.title;
        $('p', output).textContent = result.text;
        output.classList.remove('is-spinning');
        button.disabled = false;
        onFinish(result);
      }
    }, 70);
    rouletteIntervals.add(cycle);
  }

  function cancelRoulettes() {
    rouletteIntervals.forEach((cycle) => clearInterval(cycle));
    rouletteIntervals.clear();
    ['interactionResult', 'constraintResult'].forEach((id) => $(`#${id}`).classList.remove('is-spinning'));
    $('#spinInteraction').disabled = false;
    $('#spinConstraint').disabled = false;
  }

  function updateCollectionStatus() {
    let ready = 0;
    [1, 2, 3].forEach((index) => {
      const text = $(`#output${index}`).value.trim();
      $(`#outputCount${index}`).textContent = `${Array.from(text).length} 字元`;
      $(`#output${index}`).closest('.output-entry').classList.toggle('has-output', Boolean(text));
      if (text) ready += 1;
    });
    $('#collectionStatus').textContent = `${ready} / 3 OUTPUTS READY`;
  }

  function resetBlindReview() {
    state.blindItems = [];
    state.scores = {};
    state.votes = new Map();
    state.sourcesRevealed = false;
    $('#comparisonGrid').replaceChildren();
    $('#voteButtons').replaceChildren();
    $('#voteTally').replaceChildren();
    $('#blindWorkspace').hidden = true;
    $('#blindEmpty').hidden = false;
    $('#voteTotal').textContent = '0 VOTES';
    $('#revealSources').textContent = 'REVEAL SOURCES';
  }

  function collectOutputs() {
    return [1, 2, 3].map((index) => ({
      origin: index,
      source: $(`#source${index}`).value.trim() || `未標記來源 ${index}`,
      text: $(`#output${index}`).value.trim()
    })).filter((item) => item.text);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderScoreTotal(label) {
    const values = Object.values(state.scores[label] || {}).map(Number).filter((value) => value > 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const output = $(`[data-score-total="${label}"]`);
    if (output) output.textContent = values.length === RUBRIC.length ? `${total} / 20` : `${total} / 20 · ${values.length}/4`;
  }

  function buildComparisonCard(item) {
    const card = element('article', 'comparison-card');
    card.dataset.candidate = item.label;

    const head = element('header', 'comparison-card__head');
    head.append(element('strong', 'candidate-letter', item.label));
    const meta = element('div');
    meta.append(element('span', '', 'BLIND OUTPUT'));
    meta.append(element('b', '', `${Array.from(item.text).length} CHARACTERS`));
    head.append(meta);
    card.append(head);

    const source = element('p', 'source-reveal', `SOURCE / ${item.source}`);
    source.dataset.sourceFor = item.label;
    source.hidden = !state.sourcesRevealed;
    card.append(source);

    const content = element('div', 'comparison-output', item.text);
    content.tabIndex = 0;
    content.setAttribute('role', 'region');
    content.setAttribute('aria-label', `輸出 ${item.label} 內容`);
    card.append(content);

    const fieldset = element('fieldset', 'candidate-rubric');
    fieldset.append(element('legend', '', `SCORE OUTPUT ${item.label}`));
    RUBRIC.forEach((criterion) => {
      const row = element('div', 'rubric-row');
      const id = `score-${item.label}-${criterion.key}`;
      const label = element('label', '', criterion.label);
      label.htmlFor = id;
      const select = element('select');
      select.id = id;
      select.dataset.scoreCandidate = item.label;
      select.dataset.scoreCriterion = criterion.key;
      const empty = element('option', '', '—');
      empty.value = '0';
      select.append(empty);
      for (let score = 1; score <= 5; score += 1) {
        const option = element('option', '', String(score));
        option.value = String(score);
        select.append(option);
      }
      select.value = String(state.scores[item.label]?.[criterion.key] || 0);
      select.addEventListener('change', () => {
        state.scores[item.label][criterion.key] = Number(select.value);
        renderScoreTotal(item.label);
      });
      row.append(label, select);
      fieldset.append(row);
    });
    const total = element('div', 'rubric-total');
    total.append(element('span', '', 'TOTAL'));
    const totalValue = element('b', '', '0 / 20 · 0/4');
    totalValue.dataset.scoreTotal = item.label;
    total.append(totalValue);
    fieldset.append(total);
    card.append(fieldset);
    return card;
  }

  function renderTally() {
    const tally = Object.fromEntries(state.blindItems.map((item) => [item.label, 0]));
    state.votes.forEach((vote) => { if (vote.candidate in tally) tally[vote.candidate] += 1; });
    const total = state.votes.size;
    $('#voteTotal').textContent = `${total} ${total === 1 ? 'VOTE' : 'VOTES'}`;
    const container = $('#voteTally');
    container.replaceChildren();
    state.blindItems.forEach((item) => {
      const row = element('div', 'tally-row');
      const label = element('b', '', item.label);
      const track = element('div', 'tally-track');
      const bar = element('i');
      bar.style.width = `${total ? (tally[item.label] / total) * 100 : 0}%`;
      track.append(bar);
      row.append(label, track, element('span', '', String(tally[item.label])));
      container.append(row);
    });
  }

  function renderBlindWorkspace() {
    $('#blindEmpty').hidden = true;
    $('#blindWorkspace').hidden = false;
    const grid = $('#comparisonGrid');
    const voteButtons = $('#voteButtons');
    grid.replaceChildren();
    voteButtons.replaceChildren();
    state.blindItems.forEach((item) => {
      if (!state.scores[item.label]) state.scores[item.label] = Object.fromEntries(RUBRIC.map((criterion) => [criterion.key, 0]));
      grid.append(buildComparisonCard(item));
      const voteButton = element('button', '', `VOTE ${item.label}`);
      voteButton.type = 'button';
      voteButton.dataset.voteCandidate = item.label;
      voteButton.addEventListener('click', () => castVote(item.label));
      voteButtons.append(voteButton);
    });
    state.blindItems.forEach((item) => renderScoreTotal(item.label));
    renderTally();
  }

  function lockAndShuffle() {
    const outputs = collectOutputs();
    if (outputs.length < 2) {
      showToast('請先貼入至少兩份完整輸出。');
      $('#output1').focus();
      return;
    }
    state.blindItems = shuffled(outputs).map((item, index) => ({ ...item, label: 'ABC'[index] }));
    state.scores = {};
    state.votes = new Map();
    state.sourcesRevealed = false;
    $('#revealSources').textContent = 'REVEAL SOURCES';
    renderBlindWorkspace();
    markComplete(2);
    setStage(3);
    showToast(`${outputs.length} 份輸出已鎖定並匿名洗牌。`);
  }

  function castVote(candidate) {
    const input = $('#voterName');
    const name = input.value.trim();
    if (!name) {
      showToast('請先輸入隊名或投票者名稱。');
      input.focus();
      return;
    }
    const key = name.toLocaleLowerCase('zh-Hant');
    const replaced = state.votes.has(key);
    state.votes.set(key, { name, candidate });
    renderTally();
    showToast(replaced ? `${name} 的票已改投 ${candidate}。` : `${name} 已投給 ${candidate}。`);
    input.select();
  }

  function reviewSnapshot() {
    if (!state.blindItems.length) return '尚未建立盲測。';
    const tallies = Object.fromEntries(state.blindItems.map((item) => [item.label, 0]));
    state.votes.forEach((vote) => { tallies[vote.candidate] += 1; });
    const lines = ['THEARD PROMPT LAB / BLIND REVIEW', ''];
    state.blindItems.forEach((item) => {
      const scores = state.scores[item.label] || {};
      const values = RUBRIC.map((criterion) => Number(scores[criterion.key] || 0));
      const total = values.reduce((sum, value) => sum + value, 0);
      lines.push(`${item.label} / ${state.sourcesRevealed ? item.source : 'SOURCE HIDDEN'}`);
      lines.push(`SCORE ${total}/20 — ${RUBRIC.map((criterion, index) => `${criterion.label} ${values[index] || '—'}`).join(' · ')}`);
      lines.push(`VOTES ${tallies[item.label]}`);
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function renderBingo() {
    let winningLine = null;
    for (const line of BINGO_LINES) {
      if (line.every((key) => state.bingo.has(key))) {
        winningLine = line;
        break;
      }
    }
    $$('[data-bingo]').forEach((button) => {
      const active = state.bingo.has(button.dataset.bingo);
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-line', Boolean(winningLine?.includes(button.dataset.bingo)));
    });
    $('#bingoStatus').textContent = `${state.bingo.size} / 9 MARKED · ${winningLine ? 'BINGO LINE COMPLETE' : 'NO LINE YET'}`;
    if (winningLine && !state.bingoHadLine) showToast('BINGO / 請全隊說出一個要保留的 prompt 習慣。');
    state.bingoHadLine = Boolean(winningLine);
  }

  function exportPayload() {
    return {
      format: 'THEARD_PROMPT_LAB_SESSION',
      version: 1,
      exportedAt: new Date().toISOString(),
      privacy: 'Created locally in the participant browser; no server upload was used.',
      progress: { currentStage: state.currentStage, completedStages: [...state.completed].sort() },
      prompt: { parts: promptParts(), composed: composedPrompt() },
      facilitator: { interaction: state.interaction, constraint: state.constraint, timerSeconds: state.timer.total },
      outputs: collectOutputs(),
      blindReview: {
        order: state.blindItems.map((item) => ({ candidate: item.label, origin: item.origin, source: item.source })),
        scores: state.scores,
        votes: [...state.votes.values()]
      },
      bingo: [...state.bingo]
    };
  }

  function downloadSession() {
    const payload = exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `theard-prompt-lab-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#exportStatus').textContent = 'LOCAL JSON EXPORTED';
    showToast('工作階段已在這台裝置下載。');
  }

  function debriefText() {
    const parts = promptParts();
    const complete = [...state.completed].sort().map((index) => STAGES[index].name).join(', ') || 'NONE';
    return [
      'THEARD PROMPT LAB / DEBRIEF',
      `COMPLETED: ${complete}`,
      '',
      'PROMPT',
      composedPrompt(parts),
      '',
      'INTERACTION',
      state.interaction ? `${state.interaction.title} — ${state.interaction.text}` : '未抽取',
      '',
      'CONSTRAINT',
      state.constraint ? `${state.constraint.title} — ${state.constraint.text}` : '未抽取',
      '',
      reviewSnapshot(),
      '',
      `BINGO: ${state.bingo.size}/9`,
      '',
      'DEBRIEF QUESTIONS',
      '1. 哪一個 prompt 欄位最明顯地改善了輸出結構？',
      '2. 哪一項差異可能來自工具或上下文，而不是 prompt？',
      '3. 下一次你會先固定哪個變因，再開始比較？'
    ].join('\n');
  }

  function resetCurrentSession(clearSavedDraft) {
    state.suspendPersistence = true;
    clearTimeout(saveTimer);
    stopTimer();
    cancelRoulettes();
    PROMPT_FIELDS.forEach((id) => { $(`#${id}`).value = ''; });
    [1, 2, 3].forEach((index) => {
      $(`#source${index}`).value = '';
      $(`#output${index}`).value = '';
    });
    $('#voterName').value = '';
    state.currentStage = 0;
    state.completed = new Set();
    state.interaction = null;
    state.constraint = null;
    state.bingo = new Set();
    state.bingoHadLine = false;
    resetBlindReview();
    $('span', $('#interactionResult')).textContent = 'WAITING FOR SPIN';
    $('b', $('#interactionResult')).textContent = '抽一張互動任務';
    $('p', $('#interactionResult')).textContent = '結果會留在本次頁面工作階段，不會上傳。';
    $('span', $('#constraintResult')).textContent = 'NO CONSTRAINT DRAWN';
    $('b', $('#constraintResult')).textContent = '讓限制測出結構能力';
    $('p', $('#constraintResult')).textContent = '限制越明確，差異越容易被觀察。';
    $('#copyInteraction').disabled = true;
    $('#applyConstraint').disabled = true;
    setTimer(300, false);
    updateCollectionStatus();
    renderBingo();
    updateStageUI();
    updatePrompt();
    if (clearSavedDraft) {
      storageRemove();
      state.savedDraftProtected = false;
      $('#rememberDraft').checked = false;
      $('#storageState').textContent = 'LOCAL DRAFT CLEARED';
    } else {
      state.savedDraftProtected = Boolean(storageGet());
      $('#storageState').textContent = storageGet() ? 'SAVED DRAFT KEPT ON DEVICE' : 'NO SAVED DEVICE DRAFT';
    }
    state.suspendPersistence = false;
    setStage(0);
    showToast(clearSavedDraft ? '工作階段與裝置草稿已重置。' : '目前工作階段已重置；裝置草稿保留。');
  }

  function bindEvents() {
    $('#promptForm').addEventListener('submit', (event) => event.preventDefault());
    $$('[data-stage-target]').forEach((button) => button.addEventListener('click', () => setStage(Number(button.dataset.stageTarget))));
    $$('[data-next-stage]').forEach((button) => button.addEventListener('click', () => {
      const current = Number(button.closest('[data-stage-panel]').dataset.stagePanel);
      markComplete(current);
      setStage(Number(button.dataset.nextStage));
    }));
    $$('[data-prev-stage]').forEach((button) => button.addEventListener('click', () => setStage(Number(button.dataset.prevStage))));
    $$('[data-complete-stage]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.completeStage);
      markComplete(index, !state.completed.has(index));
    }));

    $('#hudTimer').addEventListener('click', () => {
      $('#timerPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#timerToggle').focus({ preventScroll: true });
    });
    $('#timerToggle').addEventListener('click', () => state.timer.running ? pauseTimer() : startTimer());
    $('#timerReset').addEventListener('click', () => setTimer(state.timer.total));
    $('#timerAdd').addEventListener('click', () => {
      const wasRunning = state.timer.running;
      if (wasRunning) pauseTimer();
      state.timer.remaining += 60;
      state.timer.total = Math.max(state.timer.total, state.timer.remaining);
      if (wasRunning) startTimer();
      renderTimer();
      $('#timerAnnouncement').textContent = '已增加一分鐘。';
    });
    $('#timerPreset').addEventListener('change', (event) => setTimer(Number(event.target.value)));
    $('#loadStageTime').addEventListener('click', () => setTimer(STAGES[state.currentStage].minutes * 60));

    PROMPT_FIELDS.forEach((id) => $(`#${id}`).addEventListener('input', () => {
      if ($('#rememberDraft').checked) state.savedDraftProtected = false;
      updatePrompt();
    }));
    $('#rememberDraft').addEventListener('change', (event) => {
      if (event.target.checked) {
        if (storageGet() && !PROMPT_FIELDS.some((id) => $(`#${id}`).value.trim())) {
          state.savedDraftProtected = true;
          $('#storageState').textContent = 'SAVED DRAFT EXISTS — LOAD OR TYPE TO REPLACE';
          showToast('裝置上已有草稿；可選擇載入，或輸入新內容取代。');
        } else {
          state.savedDraftProtected = false;
          saveDraft();
          showToast('裝置草稿保存已開啟。');
        }
      } else {
        storageRemove();
        state.savedDraftProtected = false;
        $('#storageState').textContent = 'LOCAL DRAFT DISABLED + CLEARED';
        showToast('裝置草稿已關閉並清除。');
      }
    });
    $('#loadSavedDraft').addEventListener('click', () => {
      if (!loadDraft()) {
        showToast('這台裝置沒有可載入的草稿。');
        return;
      }
      $('#rememberDraft').checked = true;
      updatePrompt();
      showToast('裝置草稿已載入；後續變更會繼續保存在這台裝置。');
    });
    $('#clearSavedDraft').addEventListener('click', () => {
      storageRemove();
      state.savedDraftProtected = false;
      $('#rememberDraft').checked = false;
      $('#storageState').textContent = 'LOCAL DRAFT CLEARED';
      showToast('已清除這台裝置的 prompt 草稿。');
    });
    $('#copyPrompt').addEventListener('click', () => {
      if (!$('#goal').value.trim()) {
        showToast('請至少先填寫任務目標。');
        $('#goal').focus();
        return;
      }
      copyText(composedPrompt(), '完整 prompt 已複製，請貼到你自己的 AI。');
    });
    $('#copyPromptPlain').addEventListener('click', () => copyText(compactPrompt(), '精簡 prompt 已複製。'));

    $('#spinInteraction').addEventListener('click', () => spinRoulette(INTERACTIONS, $('#interactionResult'), $('#spinInteraction'), (result) => {
      state.interaction = result;
      $('#copyInteraction').disabled = false;
      showToast(`互動任務：${result.title}`);
    }));
    $('#copyInteraction').addEventListener('click', () => {
      if (state.interaction) copyText(`${state.interaction.title}\n${state.interaction.text}`, '互動任務已複製。');
    });
    $('#spinConstraint').addEventListener('click', () => spinRoulette(CONSTRAINTS, $('#constraintResult'), $('#spinConstraint'), (result) => {
      state.constraint = result;
      $('#applyConstraint').disabled = false;
      showToast(`限制條件：${result.title}`);
    }));
    $('#applyConstraint').addEventListener('click', () => {
      if (!state.constraint) return;
      const field = $('#constraints');
      if (!field.value.includes(state.constraint.text)) {
        field.value = [field.value.trim(), state.constraint.text].filter(Boolean).join('\n');
        updatePrompt();
      }
      field.focus();
      showToast('限制已加入 prompt。');
    });

    [1, 2, 3].forEach((index) => $(`#output${index}`).addEventListener('input', updateCollectionStatus));
    $('#lockAndShuffle').addEventListener('click', lockAndShuffle);
    $('#clearOutputs').addEventListener('click', () => {
      if (collectOutputs().length && !window.confirm('清除目前分頁中的三份輸出與盲測結果？')) return;
      [1, 2, 3].forEach((index) => {
        $(`#source${index}`).value = '';
        $(`#output${index}`).value = '';
      });
      resetBlindReview();
      updateCollectionStatus();
      showToast('輸出與盲測結果已清除。');
    });
    $('#revealSources').addEventListener('click', () => {
      state.sourcesRevealed = !state.sourcesRevealed;
      $$('[data-source-for]').forEach((node) => { node.hidden = !state.sourcesRevealed; });
      $('#revealSources').textContent = state.sourcesRevealed ? 'HIDE SOURCES' : 'REVEAL SOURCES';
      showToast(state.sourcesRevealed ? '來源已揭曉，現在可討論工具差異。' : '來源已再次隱藏。');
    });
    $('#resetReview').addEventListener('click', () => {
      if (!state.blindItems.length) return;
      state.scores = {};
      state.votes = new Map();
      state.sourcesRevealed = false;
      $('#revealSources').textContent = 'REVEAL SOURCES';
      renderBlindWorkspace();
      showToast('評分、投票與來源揭曉已重置。');
    });
    $('#copyComparison').addEventListener('click', () => copyText(reviewSnapshot(), '盲測快照已複製。'));

    $$('[data-bingo]').forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.bingo;
      if (state.bingo.has(key)) state.bingo.delete(key);
      else state.bingo.add(key);
      renderBingo();
    }));

    $('#exportSession').addEventListener('click', downloadSession);
    $('#copyDebrief').addEventListener('click', () => copyText(debriefText(), '課程覆盤已複製。'));
    $('#openReset').addEventListener('click', () => {
      const dialog = $('#resetDialog');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else if (window.confirm('重置目前 Prompt Lab 工作階段？')) resetCurrentSession(false);
    });
    $('#confirmReset').addEventListener('click', (event) => {
      event.preventDefault();
      const clearSaved = $('#resetSavedDraft').checked;
      $('#resetDialog').close();
      resetCurrentSession(clearSaved);
      $('#resetSavedDraft').checked = false;
    });
  }

  function init() {
    updatePrompt();
    state.savedDraftProtected = Boolean(storageGet());
    $('#storageState').textContent = state.savedDraftProtected ? 'SAVED DRAFT AVAILABLE — NOT LOADED' : 'LOCAL DRAFT OFF';
    updateCollectionStatus();
    renderBingo();
    renderTimer();
    updateStageUI();
    bindEvents();
  }

  init();
})();
