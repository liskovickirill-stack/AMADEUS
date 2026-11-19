(() => {
  const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1IMoO0p0F0ofnoofchjTbh2s6Oq_qEfliDnTAG7Nuxrc';
  const DATA_SOURCES = [
    { city: 'НН', gid: '0' },
    { city: 'ПНЗ', gid: '1635761934' }
  ];
  const CITY_NAMES = { 'НН': 'Нижний Новгород', 'ПНЗ': 'Пенза' };
  // Снимок листа нужен для мгновенного показа и на случай недоступности Google Sheets.
  const fallbackCsv = `Ссылка на чат,Вопрос,Решение,Тема,Подтема,Месяц
тест,,,Возврат,Ошибка ГДС,Ноябрь
тест,,,обмен,Частичный,Ноябрь
тест,,,выписка,Частичный,Ноябрь
тест,,,Возврат,Ошибка ГДС,Ноябрь
тест,,,обмен,обменного билета,Ноябрь
тест,,,Возврат,обменного билета,Ноябрь
тест,,,Возврат,обменного билета,Ноябрь
тест,,,Возврат,Частичный,Ноябрь
тест,,,Возврат,Частичный,Ноябрь
тест,,,выписка,Ошибка ГДС,Ноябрь`;
  const $ = (selector) => document.querySelector(selector);
  const selectors = { city: $('#filter-city'), topic: $('#filter-topic'), subtopic: $('#filter-subtopic'), month: $('#filter-month') };
  let records = [];
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

  function readRecords(csv, city) {
    const rows = parseCsv(csv).filter(row => row.some(cell => cell.trim()));
    if (rows.length < 2) return [];
    const headers = rows[0].map(value => value.trim().toLocaleLowerCase('ru'));
    const index = (name) => headers.findIndex(value => value === name);
    const topicIndex = index('тема'), subtopicIndex = index('подтема'), monthIndex = index('месяц');
    if ([topicIndex, subtopicIndex, monthIndex].some(i => i < 0)) throw new Error('В таблице не найдены колонки «Тема», «Подтема», «Месяц».');
    return rows.slice(1).map(row => ({
      topic: (row[topicIndex] || '').trim(),
      subtopic: (row[subtopicIndex] || '').trim(),
      month: (row[monthIndex] || '').trim(),
      city
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
    const city = selectors.city.value, topic = selectors.topic.value, subtopic = selectors.subtopic.value, month = selectors.month.value;
    const cityRows = records.filter(row => (!topic || normalized(row.topic) === normalized(topic)) && (!subtopic || normalized(row.subtopic) === normalized(subtopic)) && (!month || normalized(row.month) === normalized(month)));
    const topicRows = records.filter(row => (!city || row.city === city) && (!subtopic || normalized(row.subtopic) === normalized(subtopic)) && (!month || normalized(row.month) === normalized(month)));
    const subtopicRows = records.filter(row => (!city || row.city === city) && (!topic || normalized(row.topic) === normalized(topic)) && (!month || normalized(row.month) === normalized(month)));
    const monthRows = records.filter(row => (!city || row.city === city) && (!topic || normalized(row.topic) === normalized(topic)) && (!subtopic || normalized(row.subtopic) === normalized(subtopic)));
    fillSelect(selectors.city, 'Все города', distinctValues('city', cityRows), true, city => CITY_NAMES[city] || city);
    fillSelect(selectors.topic, 'Все темы', distinctValues('topic', topicRows));
    fillSelect(selectors.subtopic, 'Все подтемы', distinctValues('subtopic', subtopicRows));
    fillSelect(selectors.month, 'Все месяцы', distinctValues('month', monthRows));
  }
  function selectedRecords() {
    const city = selectors.city.value, topic = normalized(selectors.topic.value), subtopic = normalized(selectors.subtopic.value), month = normalized(selectors.month.value);
    return records.filter(row => (!city || row.city === city) && (!topic || normalized(row.topic) === topic) && (!subtopic || normalized(row.subtopic) === subtopic) && (!month || normalized(row.month) === month));
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
  function setData(datasets, live) {
    records = datasets.flatMap(({ city, csv }) => readRecords(csv, city));
    updateFilterOptions(); render();
    $('#sync-status').textContent = live ? 'Синхронизированы 2 листа' : 'Снимок данных: Пенза и Нижний Новгород';
    $('#updated-at').textContent = live ? `Обновлено ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date())}` : 'Сводка по двум городам';
  }
  async function refresh() {
    const button = $('#refresh-button'); button.disabled = true; button.classList.add('loading');
    try {
      const datasets = await Promise.all(DATA_SOURCES.map(async ({ city, gid }) => {
        const response = await fetch(`${SHEETS_URL}/export?format=csv&gid=${gid}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Не удалось загрузить лист ${city}: HTTP ${response.status}`);
        const csv = await response.text();
        if (!readRecords(csv, city).length) throw new Error(`Лист ${city} не содержит записей`);
        return { city, csv };
      }));
      setData(datasets, true); notify('Данные по Пензе и Нижнему Новгороду обновлены');
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
  setData(DATA_SOURCES.map(({ city }) => ({ city, csv: fallbackCsv })), false);
})();
