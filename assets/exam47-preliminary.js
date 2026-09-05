(() => {
  const DATA_URL = '/Date/Ques/47_preliminary_answers.json';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  function answerCell(answer, index) {
    const published = answer !== null && answer !== undefined && String(answer).trim() !== '';
    return `
      <div class="exam47-answer-cell ${published ? 'is-published' : 'is-pending'}">
        <b>問${index + 1}</b>
        <span>${published ? escapeHtml(answer) : '—'}</span>
      </div>`;
  }

  function publishedCount(part) {
    return (part?.answers || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
  }

  function renderPart(key, part) {
    const answers = Array.isArray(part?.answers) ? part.answers : [];
    const count = publishedCount(part);
    const label = part?.label || (key === 'am' ? '午前' : '午後');
    const status = count > 0 ? `${count}/${answers.length}問 掲載` : '未掲載';
    return `
      <details class="exam47-part" data-part="${escapeHtml(key)}">
        <summary>
          <span>${escapeHtml(label)} 回答速報</span>
          <span class="exam47-part-status">${escapeHtml(status)}</span>
        </summary>
        <div class="exam47-answer-grid">
          ${answers.map(answerCell).join('')}
        </div>
      </details>`;
  }

  function createCard(data) {
    const card = document.createElement('section');
    card.className = 'exam47-preliminary-card';
    card.id = 'exam47PreliminaryCard';
    card.setAttribute('aria-labelledby', 'exam47PreliminaryTitle');

    const statusLabel = data?.statusLabel || '回答速報 準備中';
    const updated = data?.updatedAt ? `速報更新：${escapeHtml(data.updatedAt)}` : '速報更新：未掲載';
    const notice = data?.notice || '第47回の回答速報を掲載するための準備枠です。';

    card.innerHTML = `
      <div class="exam47-preliminary-head">
        <div>
          <h2 id="exam47PreliminaryTitle">第47回 ME2種 回答速報</h2>
          <p class="small">2026年9月6日実施予定の第47回 第2種ME技術実力検定試験向けの回答速報枠です。</p>
        </div>
        <span class="exam47-status-badge">⏳ ${escapeHtml(statusLabel)}</span>
      </div>

      <div class="exam47-meta">
        <span>試験日：2026/09/06</span>
        <span>速報：非公式・暫定</span>
        <span>${updated}</span>
      </div>

      <div class="exam47-lock">
        <strong>🔒 正式公開までは問題・解説をロックします</strong>
        ${escapeHtml(notice)}<br>
        この速報枠では、正式公開前は問題文・選択肢・解説・演習機能を表示しません。
      </div>

      <div class="exam47-parts">
        ${renderPart('am', data?.parts?.am || { label: '午前', answers: Array(60).fill(null) })}
        ${renderPart('pm', data?.parts?.pm || { label: '午後', answers: Array(60).fill(null) })}
      </div>

      <p class="exam47-footnote">
        ※ 回答速報は試験終了後に問題用紙を確認して作成する非公式の暫定情報を想定しています。正式な問題・正答が公開された後に、通常の問題演習・解説機能へ反映する予定です。
      </p>`;

    return card;
  }

  function fallbackData() {
    return {
      statusLabel: '回答速報 準備中',
      updatedAt: null,
      notice: '試験終了後、AIによる暫定的な回答速報を掲載するための枠です。正式な問題・解答が公開されるまでは、問題演習・問題文・解説は公開しません。',
      parts: {
        am: { label: '午前', answers: Array(60).fill(null) },
        pm: { label: '午後', answers: Array(60).fill(null) }
      }
    };
  }

  async function init() {
    if (document.getElementById('exam47PreliminaryCard')) return;
    const examGrid = document.getElementById('examGrid');
    if (!examGrid) return;

    let data = fallbackData();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (response.ok) data = await response.json();
    } catch (_) {
      // The frame still renders with locked fallback data.
    }

    examGrid.parentNode.insertBefore(createCard(data), examGrid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
