(() => {
  const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1IMoO0p0F0ofnoofchjTbh2s6Oq_qEfliDnTAG7Nuxrc';
  const QUESTIONS_GID = '0';
  const CHATS_GID = '47982645';
  const FALLBACK_NOVEMBER_CHAT_COUNT = 105;
  // Снимок листа нужен для мгновенного показа и на случай недоступности Google Sheets.
  const fallbackCsv = `Тема,Подтема,Месяц
выписка,подбор тарифа,Октябрь
обмен,Ошибка ГДС,Сентябрь
обмен,подбор тарифа,Октябрь
паспорт,,Октябрь
обмен,,Октябрь
Возврат,Частичный,Ноябрь
обмен,Ошибка ГДС,Ноябрь
Возврат,,Ноябрь
обмен,Ошибка ГДС,Ноябрь
обмен,Ошибка ГДС,Ноябрь
Возврат,,Ноябрь
паспорт,,Ноябрь
обмен,подбор тарифа,Ноябрь
Возврат,,Октябрь
обмен,IT тариф,Октябрь
обмен,Ошибка ГДС,Октябрь
обмен,Ошибка ГДС,Октябрь
Общие вопросы,история брони,Октябрь
доп услуги,Ошибка ГДС,Октябрь
обмен,Ошибка ГДС,Октябрь`;
  const $ = (selector) => document.querySelector(selector);
  const selectors = { topic: $('#filter-topic'), subtopic: $('#filter-subtopic'), month: $('#filter-month') };
  let records = [];
  let novemberChatCount = FALLBACK_NOVEMBER_CHAT_COUNT;
  let toastTimer;

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (char !== '\r') field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function readRecords(csv) {
    const rows = parseCsv(csv).filter(row => row.some(cell => cell.trim()));
    if (rows.length < 2) return [];
    const headers = rows[0].map(value => value.trim().toLocaleLowerCase('ru'));
    const index = (name) => headers.findIndex(value => value === name);
    const topicIndex = index('тема'), subtopicIndex = index('подтема'), monthIndex = index('месяц');
    if ([topicIndex, subtopicIndex, monthIndex].some(i => i < 0)) throw new Error('В таблице не найдены колонки «Тема», «Подтема», «Месяц».');
    return rows.slice(1).map(row => ({
      topic: (row[topicIndex] || '').trim(),
      subtopic: (row[subtopicIndex] || '').trim(),
      month: (row[monthIndex] || '').trim()
    })).filter(record => record.topic || record.subtopic || record.month);
  }

  function normalized(value) { return value.trim().toLocaleLowerCase('ru'); }
  function distinctValues(key, list = records) {
    const found = new Map();
    list.forEach(record => { if (record[key]) found.set(normalized(record[key]), record[key]); });
    return [...found.values()].sort((a, b) => a.localeCompare(b, 'ru'));
  }
  function fillSelect(select, label, values, preserve = true, formatLabel = value => value) {
    const previous = preserve ? select.value : '';
    select.replaceChildren(new Option(label, ''));
    values.forEach(value => select.add(new Option(formatLabel(value), value)));
    select.value = values.find(value => normalized(value) === normalized(previous)) || '';
  }
  function updateFilterOptions() {
    const topic = selectors.topic.value, subtopic = selectors.subtopic.value, month = selectors.month.value;
    const topicRows = records.filter(row => (!subtopic || normalized(row.subtopic) === normalized(subtopic)) && (!month || normalized(row.month) === normalized(month)));
    const subtopicRows = records.filter(row => (!topic || normalized(row.topic) === normalized(topic)) && (!month || normalized(row.month) === normalized(month)));
    const monthRows = records.filter(row => (!topic || normalized(row.topic) === normalized(topic)) && (!subtopic || normalized(row.subtopic) === normalized(subtopic)));
    fillSelect(selectors.topic, 'Все темы', distinctValues('topic', topicRows));
    fillSelect(selectors.subtopic, 'Все подтемы', distinctValues('subtopic', subtopicRows));
    fillSelect(selectors.month, 'Все месяцы', distinctValues('month', monthRows));
  }
  function selectedRecords() {
    const topic = normalized(selectors.topic.value), subtopic = normalized(selectors.subtopic.value), month = normalized(selectors.month.value);
    return records.filter(row => (!topic || normalized(row.topic) === topic) && (!subtopic || normalized(row.subtopic) === subtopic) && (!month || normalized(row.month) === month));
  }
  function renderChart(key, containerId, className) {
    const container = $(containerId), list = selectedRecords(), counts = new Map();
    list.forEach(row => { if (row[key]) counts.set(row[key], (counts.get(row[key]) || 0) + 1); });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
    if (!sorted.length || !list.length) {
      container.innerHTML = '<div class="empty-state">Нет данных для выбранных фильтров</div>';
      return;
    }
    const max = sorted[0][1], total = list.length;
    container.innerHTML = sorted.map(([label, count]) => {
      const percent = count / total * 100;
      const rounded = Math.round(percent);
      return `<div class="bar-row" title="${escapeHtml(label)}: ${count} из ${total} (${percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%)">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track" aria-hidden="true"><span class="bar-fill ${className}" style="display:block;width:${Math.max(2, count / max * 100)}%"></span></span>
        <span class="bar-value">${rounded}<small>%</small></span>
      </div>`;
    }).join('');
  }
  function render() {
    const list = selectedRecords();
    const topics = new Set(list.map(row => normalized(row.topic)).filter(Boolean));
    const subtopics = new Set(list.map(row => normalized(row.subtopic)).filter(Boolean));
    const months = new Set(list.map(row => normalized(row.month)).filter(Boolean));
    $('#total-count').textContent = list.length;
    $('#topic-count').textContent = topics.size;
    $('#subtopic-count').textContent = subtopics.size;
    $('#month-count').textContent = months.size;
    const novemberQuestions = records.filter(row => normalized(row.month) === normalized('Ноябрь')).length;
    $('#escalation-rate').textContent = novemberChatCount > 0
      ? `${(novemberQuestions / novemberChatCount * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : '—';
    $('#escalation-details').textContent = `${novemberQuestions} ${plural(novemberQuestions, ['вопрос', 'вопроса', 'вопросов'])} по Amadeus из ${novemberChatCount} ${plural(novemberChatCount, ['чат', 'чата', 'чатов'])} НН`;
    $('#denominator').textContent = `База расчёта: ${list.length} ${plural(list.length, ['запись', 'записи', 'записей'])}`;
    renderChart('topic', '#chart-topic', 'topic-fill');
    renderChart('subtopic', '#chart-subtopic', 'subtopic-fill');
    renderChart('month', '#chart-month', 'month-fill');
  }
  function plural(number, words) {
    const n = Math.abs(number) % 100, n1 = n % 10;
    if (n > 10 && n < 20) return words[2];
    if (n1 > 1 && n1 < 5) return words[1];
    if (n1 === 1) return words[0];
    return words[2];
  }
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function notify(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
  function countNovemberChats(csv) {
    const rows = parseCsv(csv).filter(row => row.some(cell => cell.trim()));
    if (rows.length < 2) return 0;
    const headers = rows[0].map(value => value.trim().toLocaleLowerCase('ru'));
    const createdAtIndex = headers.findIndex(value => value === 'дата создания обращения');
    if (createdAtIndex < 0) return rows.length - 1;
    return rows.slice(1).filter(row => /^\d{4}-11-\d{2}$/.test((row[createdAtIndex] || '').trim())).length;
  }
  function setData(questionsCsv, chatCount, live) {
    records = readRecords(questionsCsv);
    novemberChatCount = chatCount;
    updateFilterOptions(); render();
    $('#sync-status').textContent = live ? 'Синхронизированы 2 листа' : 'Снимок данных: Нижний Новгород';
    $('#updated-at').textContent = live ? `Обновлено ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date())}` : 'Сводка по Нижнему Новгороду';
  }
  async function refresh() {
    const button = $('#refresh-button'); button.disabled = true; button.classList.add('loading');
    try {
      const [questionsResponse, chatsResponse] = await Promise.all([
        fetch(`${SHEETS_URL}/export?format=csv&gid=${QUESTIONS_GID}`, { cache: 'no-store' }),
        fetch(`${SHEETS_URL}/export?format=csv&gid=${CHATS_GID}`, { cache: 'no-store' })
      ]);
      if (!questionsResponse.ok) throw new Error(`Не удалось загрузить лист вопросов: HTTP ${questionsResponse.status}`);
      if (!chatsResponse.ok) throw new Error(`Не удалось загрузить лист чатов: HTTP ${chatsResponse.status}`);
      const [questionsCsv, chatsCsv] = await Promise.all([questionsResponse.text(), chatsResponse.text()]);
      if (!readRecords(questionsCsv).length) throw new Error('Лист вопросов не содержит записей');
      const chatCount = countNovemberChats(chatsCsv);
      if (!chatCount) throw new Error('Лист чатов не содержит ноябрьских записей');
      setData(questionsCsv, chatCount, true); notify('Данные по Нижнему Новгороду обновлены');
    } catch (error) {
      $('#sync-status').textContent = 'Снимок данных';
      notify('Не удалось обновить Google Таблицу. Показан последний доступный снимок данных.');
    } finally {
      button.disabled = false; button.classList.remove('loading');
    }
  }
  Object.values(selectors).forEach(select => select.addEventListener('change', () => { updateFilterOptions(); render(); }));
  $('#clear-filters').addEventListener('click', () => {
    Object.values(selectors).forEach(select => { select.value = ''; }); updateFilterOptions(); render();
  });
  $('#refresh-button').addEventListener('click', refresh);
  setData(fallbackCsv, FALLBACK_NOVEMBER_CHAT_COUNT, false);
})();
