'use strict';
(() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keyword = /^(?:async|await|new|return|function|const|let|var|if|else|for|while|throw|class|public|private|static|final|void|val|fun|data|suspend|import|export|true|false|null|undefined)$/;
  const highlight = line => {
    const tokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
    let cursor = 0;
    let result = '';
    for (const token of line.matchAll(tokens)) {
      const value = token[0];
      result += escape(line.slice(cursor, token.index));
      const type = /^['"`]/.test(value) ? 'string' : value.startsWith('//') ? 'comment' : /^\d/.test(value) ? 'number' : keyword.test(value) ? 'keyword' : /^\s*\(/.test(line.slice(token.index + value.length)) ? 'function' : '';
      result += type ? `<span class="tok-${type}">${escape(value)}</span>` : escape(value);
      cursor = token.index + value.length;
    }
    return result + escape(line.slice(cursor));
  };
  const codeRows = lines => lines.map((line, i) => `<div class="code-line" data-line="${i + 1}"><span class="line-number" aria-hidden="true">${i + 1}</span><code>${highlight(line) || ' '}</code></div>`).join('');
  document.querySelectorAll('.reader-article pre > code').forEach(code => {
    const lines = code.textContent.replace(/\n$/, '').split('\n');
    const language = code.className.match(/language-([\w-]+)/)?.[1] || 'code';
    const languageName = ({js:'JavaScript',javascript:'JavaScript',ts:'TypeScript',typescript:'TypeScript',java:'Java',kotlin:'Kotlin',python:'Python',html:'HTML',css:'CSS',bash:'Bash',json:'JSON',code:'Код'})[language] || language;
    const panel = code.parentElement;
    panel.innerHTML = `<div class="panel-heading"><span><span class="dot"></span>${escape(languageName)}</span></div><div class="code-lines">${codeRows(lines)}</div>`;
  });
  const examples = window.READER_EXAMPLES;
  const config = window.READER_CONFIG || {};
  const explorer = document.getElementById('explorer');
  if (!explorer || !Array.isArray(examples) || !examples.length) return;
  const tabs = document.getElementById('example-tabs');
  const code = document.getElementById('example-code');
  const board = document.getElementById('state-board');
  const next = document.getElementById('step-next');
  const prev = document.getElementById('step-prev');
  const reset = document.getElementById('step-reset');
  const play = document.getElementById('step-play');
  const range = document.getElementById('step-range');
  const counter = document.getElementById('step-counter');
  const title = document.getElementById('example-title');
  const intro = document.getElementById('example-intro');
  const stepTitle = document.getElementById('step-title');
  const why = document.getElementById('step-why');
  const phase = document.getElementById('step-phase');
  const takeaway = document.getElementById('example-takeaway');
  const phaseNames = config.phaseNames || {sync:'Синхронный код',micro:'Микрозадачи',task:'Задача таймера',idle:'Пауза между действиями'};
  let exampleIndex = 0;
  let stepIndex = 0;
  let timer = null;
  try {
    const saved = JSON.parse(localStorage.getItem(config.storageKey));
    const found = examples.findIndex(e => e.id === saved?.id);
    if (found >= 0) {
      exampleIndex = found;
      stepIndex = Math.max(0, Math.min(examples[found].steps.length - 1, Number.isInteger(saved.step) ? saved.step : 0));
    }
  } catch {}
  const save = () => {
    if (!config.storageKey) return;
    try { localStorage.setItem(config.storageKey, JSON.stringify({id:examples[exampleIndex].id,step:stepIndex})); } catch {}
  };
  tabs.innerHTML = examples.map((e, i) => `<button type="button" role="tab" id="tab-${escape(e.id)}" aria-controls="example-panel" aria-selected="${i === exampleIndex}" tabindex="${i === exampleIndex ? 0 : -1}" data-example="${escape(e.id)}">${escape(e.label)}</button>`).join('');
  board.innerHTML = (config.panels || []).map(panel => `<section class="state-panel" data-key="${escape(panel.key)}" data-tone="${escape(panel.tone)}" aria-labelledby="state-${escape(panel.key)}"><h4 id="state-${escape(panel.key)}">${escape(panel.label)}<small>${escape(panel.note || '')}</small></h4><div class="state-items"></div></section>`).join('');
  const pause = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    play.textContent = '▶ Автопроход';
    play.setAttribute('aria-pressed','false');
  };
  const render = () => {
    const example = examples[exampleIndex];
    const step = example.steps[stepIndex];
    code.querySelectorAll('.code-line').forEach(row => {
      const current = Number(row.dataset.line) === step.line;
      row.classList.toggle('is-current',current);
      if (current) row.setAttribute('aria-current','step');
      else row.removeAttribute('aria-current');
    });
    for (const panel of config.panels || []) {
      const items = Array.isArray(step[panel.key]) ? [...step[panel.key]] : [];
      if (panel.reverse) items.reverse();
      const target = board.querySelector(`[data-key="${panel.key}"] .state-items`);
      target.innerHTML = items.length ? items.map(item => `<span class="state-token">${escape(item)}</span>`).join('') : `<p class="state-empty">${escape(panel.empty || 'Пусто')}</p>`;
    }
    stepTitle.textContent = step.title;
    why.textContent = step.why;
    phase.textContent = phaseNames[step.phase] || step.phase;
    counter.textContent = `Шаг ${stepIndex + 1} из ${example.steps.length}`;
    range.max = example.steps.length - 1;
    range.value = stepIndex;
    range.setAttribute('aria-valuetext',counter.textContent + ': ' + step.title);
    next.disabled = stepIndex === example.steps.length - 1;
    prev.disabled = stepIndex === 0;
    reset.disabled = stepIndex === 0;
    const finished = stepIndex === example.steps.length - 1;
    takeaway.classList.toggle('is-visible',finished);
    takeaway.querySelector('strong').textContent = `Получилось: ${example.result.join(' → ')}`;
    takeaway.querySelector('p').textContent = example.takeaway;
    if (finished) pause();
    save();
  };
  const select = (index, restore = false) => {
    pause();
    exampleIndex = index;
    if (!restore) stepIndex = 0;
    const example = examples[index];
    title.textContent = example.title;
    intro.textContent = example.intro;
    code.innerHTML = codeRows(example.code);
    document.getElementById('example-panel').setAttribute('aria-labelledby','tab-' + example.id);
    tabs.querySelectorAll('button').forEach((tab, i) => {
      tab.setAttribute('aria-selected',String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    render();
  };
  const move = amount => {
    stepIndex = Math.max(0, Math.min(examples[exampleIndex].steps.length - 1,stepIndex + amount));
    render();
  };
  tabs.addEventListener('click',event => {
    const tab = event.target.closest('button[data-example]');
    if (tab) select(examples.findIndex(e => e.id === tab.dataset.example));
  });
  tabs.addEventListener('keydown',event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? examples.length - 1 : (exampleIndex + (event.key === 'ArrowRight' ? 1 : -1) + examples.length) % examples.length;
    select(index);
    tabs.querySelectorAll('button')[index].focus();
  });
  next.addEventListener('click',() => { pause(); move(1); });
  prev.addEventListener('click',() => { pause(); move(-1); });
  reset.addEventListener('click',() => { pause(); stepIndex = 0; render(); });
  range.addEventListener('input',() => { pause(); stepIndex = Number(range.value); render(); });
  play.addEventListener('click',() => {
    if (timer !== null) { pause(); return; }
    if (stepIndex === examples[exampleIndex].steps.length - 1) stepIndex = 0;
    render();
    play.textContent = 'Ⅱ Пауза';
    play.setAttribute('aria-pressed','true');
    timer = setInterval(() => move(1),config.interval || 2200);
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden) pause(); });
  select(exampleIndex,true);
  window.PapermorphReader = Object.freeze({getState:() => ({id:examples[exampleIndex].id,index:stepIndex,playing:timer !== null,step:structuredClone(examples[exampleIndex].steps[stepIndex])})});
})();
