(() => {
  const DATA_URL = '/Date/Ques/47_preliminary_answers.json';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const normalizeChoiceText = (choice) => {
    if (choice && typeof choice === 'object') return choice.text ?? choice.label ?? choice.value ?? '';
    return choice ?? '';
  };

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

  function questionImages(question) {
    const raw = [];
    if (question?.figurePath) raw.push(question.figurePath);
    if (question?.image) raw.push(question.image);
    if (Array.isArray(question?.images)) raw.push(...question.images);
    return [...new Set(raw.filter(Boolean))];
  }

  function renderQuestion(question, index, answers) {
    const number = Number(question?.number || question?.questionNumber || index + 1);
    const choices = Array.isArray(question?.choices) ? question.choices : [];
    const images = questionImages(question);
    const preliminaryAnswer = question?.preliminaryAnswer ?? answers?.[number - 1];
    const hasAnswer = preliminaryAnswer !== null && preliminaryAnswer !== undefined && String(preliminaryAnswer).trim() !== '';

    return `
      <article class="exam47-question-card">
        <div class="exam47-question-head">
          <strong>問${escapeHtml(number)}</strong>
          <span class="exam47-question-answer ${hasAnswer ? 'is-published' : ''}">
            暫定回答：${hasAnswer ? escapeHtml(preliminaryAnswer) : '準備中'}
          </span>
        </div>
        <div class="exam47-question-stem">${escapeHtml(question?.stem ?? question?.question ?? '問題文 準備中')}</div>
        ${choices.length ? `
          <ol class="exam47-choice-list">
            ${choices.map(choice => `<li>${escapeHtml(normalizeChoiceText(choice))}</li>`).join('')}
          </ol>` : '<p class="exam47-preparing-line">選択肢：準備中</p>'}
        ${images.length ? `
          <div class="exam47-figure-list">
            ${images.map((src, imageIndex) => `<figure><img src="${escapeHtml(src)}" alt="第47回 問${escapeHtml(number)} 図表${images.length > 1 ? ` ${imageIndex + 1}` : ''}" loading="lazy"><figcaption>問題内の図表</figcaption></figure>`).join('')}
          </div>` : ''}
      </article>`;
  }

  function renderQuestionViewer(part) {
    const questions = Array.isArray(part?.questions) ? part.questions : [];
    if (!questions.length) {
      return `
        <div class="exam47-question-viewer exam47-question-viewer-empty">
          <strong>問題閲覧：準備中</strong>
          <p>試験終了後、問題用紙の確認が完了したものから問題文・選択肢・図表を掲載します。</p>
        </div>`;
    }

    return `
      <details class="exam47-question-viewer">
        <summary>問題・選択肢・図表を見る <span>${questions.length}問掲載</span></summary>
        <div class="exam47-question-list">
          ${questions.map((question, index) => renderQuestion(question, index, part?.answers || [])).join('')}
        </div>
      </details>`;
  }

  function renderPart(key, part) {
    const answers = Array.isArray(part?.answers) ? part.answers : [];
    const count = publishedCount(part);
    const questions = Array.isArray(part?.questions) ? part.questions : [];
    const label = part?.label || (key === 'am' ? '午前' : '午後');
    const isPreparing = String(part?.status || '').toLowerCase() === 'preparing' && count === 0 && questions.length === 0;
    const status = isPreparing ? '準備中' : `回答 ${count}/${answers.length}問・問題 ${questions.length}問`;

    return `
      <details class="exam47-part" data-part="${escapeHtml(key)}">
        <summary>
          <span>${escapeHtml(label)} 回答速報</span>
          <span class="exam47-part-status">${escapeHtml(status)}</span>
        </summary>
        <div class="exam47-answer-section">
          <h3>暫定回答一覧</h3>
          <div class="exam47-answer-grid">
            ${answers.map(answerCell).join('')}
          </div>
        </div>
        ${renderQuestionViewer(part)}
      </details>`;
  }

  function createCard(data) {
    const card = document.createElement('div');
    card.className = 'exam47-preliminary-card';
    card.id = 'exam47PreliminaryCard';
    card.setAttribute('aria-labelledby', 'exam47PreliminaryTitle');

    const isPreparing = String(data?.status || '').toLowerCase() === 'preparing';
    const statusLabel = isPreparing ? '準備中' : (data?.statusLabel || '回答速報 掲載中');
    const updated = data?.updatedAt ? `速報更新：${escapeHtml(data.updatedAt)}` : '速報更新：未掲載';
    const notice = data?.notice || '第47回の回答速報を掲載するための準備枠です。';

    card.innerHTML = `
      <div class="exam47-preliminary-head">
        <div>
          <h2 id="exam47PreliminaryTitle">第47回 ME2種 回答速報</h2>
          <p class="small">2026年9月6日実施の第47回 第2種ME技術実力検定試験向けの回答速報枠です。</p>
        </div>
        <span class="exam47-status-badge">${isPreparing ? '⏳' : '📝'} ${escapeHtml(statusLabel)}</span>
      </div>

      <div class="exam47-meta">
        <span>試験日：2026/09/06</span>
        <span>非公式・暫定回答</span>
        <span>${updated}</span>
      </div>

      <div class="exam47-warning">
        <strong>⚠️ この回答速報は正式な正答ではありません</strong>
        ${escapeHtml(notice)}
      </div>

      <div class="exam47-lock">
        <strong>🔒 正式公開まで演習・正誤判定・解説は利用できません</strong>
        速報掲載後は、問題文・選択肢・問題内の図表/画像・暫定回答のみ閲覧できます。通常の演習機能と解説は、正式な問題・正答が公開された後に開放する想定です。
      </div>

      <div class="exam47-parts">
        ${renderPart('am', data?.parts?.am || { label: '午前', status: 'preparing', answers: Array(60).fill(null), questions: [] })}
        ${renderPart('pm', data?.parts?.pm || { label: '午後', status: 'preparing', answers: Array(60).fill(null), questions: [] })}
      </div>

      <p class="exam47-footnote">
        ※ 掲載する回答はAI等による非公式の暫定回答です。採点・合否判断の根拠にはせず、正式な正答および合格結果は必ず試験実施団体が公表する公式情報・合格発表をご確認ください。正式な問題・正答が発表され次第、当サイトも順次対応予定です。
      </p>`;

    return card;
  }

  function createStandaloneSection(data) {
    const section = document.createElement('section');
    section.className = 'exam47-standalone-section';
    section.id = 'exam47StandaloneSection';
    section.innerHTML = `
      <div class="exam47-section-label">第47回専用</div>
      <div class="exam47-section-title-row">
        <div>
          <h2>最新試験・回答速報</h2>
          <p class="small">第47回は、正式公開前の回答速報として過去問一覧とは別枠で掲載します。</p>
        </div>
      </div>`;
    section.appendChild(createCard(data));
    return section;
  }

  function createPastExamHeading() {
    const heading = document.createElement('div');
    heading.className = 'exam47-past-exam-heading';
    heading.id = 'pastExamHeading';
    heading.innerHTML = `
      <div>
        <span class="exam47-past-label">通常の過去問</span>
        <h2>過去問演習（第46回以前）</h2>
        <p class="small">第46回以前は、従来どおり演習・問題閲覧・解説を利用できます。</p>
      </div>`;
    return heading;
  }

  function fallbackData() {
    return {
      status: 'preparing',
      statusLabel: '準備中',
      updatedAt: null,
      notice: '試験終了後、問題用紙をもとに問題文・選択肢・図表とAIによる暫定回答を掲載する予定です。掲載内容は非公式であり、正式な正答ではありません。最終的な正答および合否は、必ず試験実施団体が公表する公式情報・合格発表を確認してください。正式な問題・正答が発表され次第、当サイトも順次対応予定です。',
      parts: {
        am: { label: '午前', status: 'preparing', answers: Array(60).fill(null), questions: [] },
        pm: { label: '午後', status: 'preparing', answers: Array(60).fill(null), questions: [] }
      }
    };
  }

  async function init() {
    if (document.getElementById('exam47StandaloneSection')) return;
    const examGrid = document.getElementById('examGrid');
    if (!examGrid) return;

    let data = fallbackData();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (response.ok) data = await response.json();
    } catch (_) {
      // The frame still renders in preparing state if data loading fails.
    }

    const parent = examGrid.parentNode;
    parent.insertBefore(createStandaloneSection(data), examGrid);
    parent.insertBefore(createPastExamHeading(), examGrid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
