const state = {
  slots: [],
  selectedSlotId: null,
  idempotencyKey: null,
  payloadFingerprint: null,
};

const elements = {
  form: document.querySelector("#booking-form"),
  slotList: document.querySelector("#slot-list"),
  formError: document.querySelector("#form-error"),
  submit: document.querySelector("#submit-booking"),
  submitLabel: document.querySelector("#submit-label"),
  bookingFlow: document.querySelector("#booking-flow"),
  successState: document.querySelector("#success-state"),
  successTime: document.querySelector("#success-time"),
  bookingReference: document.querySelector("#booking-reference"),
  runtimePanel: document.querySelector("#runtime-panel"),
};

const displayTimezone = "Asia/Tokyo";
const submissionTimezone = displayTimezone;
document.querySelector("#visitor-timezone").textContent = "日本時間（JST）";

const nocEvidenceDetails = document.querySelector("#noc-evidence-details");
if (nocEvidenceDetails instanceof HTMLDetailsElement && matchMedia("(max-width: 520px)").matches) {
  nocEvidenceDetails.open = false;
}

function dateParts(slot) {
  const start = new Date(slot.startAt);
  return {
    day: new Intl.DateTimeFormat("ja-JP", { weekday: "short", month: "short", day: "numeric", timeZone: displayTimezone }).format(start),
    time: new Intl.DateTimeFormat("ja-JP", { hour: "numeric", minute: "2-digit", timeZone: displayTimezone }).format(start),
    full: new Intl.DateTimeFormat("ja-JP", { dateStyle: "full", timeStyle: "short", timeZone: displayTimezone }).format(start),
  };
}

function clearErrors() {
  for (const node of document.querySelectorAll(".field-error")) node.textContent = "";
  for (const node of document.querySelectorAll("[aria-invalid='true']")) node.removeAttribute("aria-invalid");
  elements.formError.hidden = true;
  elements.formError.textContent = "";
}

function renderSlots() {
  elements.slotList.replaceChildren();
  elements.slotList.setAttribute("aria-busy", "false");
  if (state.slots.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "現在、選択できる技術対話の時間枠はありません。準備状態を確認し、時間をおいて再度お試しください。";
    elements.slotList.append(message);
    return;
  }

  for (const slot of state.slots) {
    const parts = dateParts(slot);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.dataset.slotId = slot.id;
    button.disabled = !slot.available;
    button.setAttribute("aria-pressed", String(state.selectedSlotId === slot.id));
    button.setAttribute("aria-label", `${parts.day} ${parts.time}${slot.available ? "" : "、選択不可"}`);
    const day = document.createElement("strong");
    day.textContent = parts.day;
    const time = document.createElement("span");
    time.textContent = slot.available ? parts.time : `${parts.time} · 仮確保済み`;
    button.append(day, time);
    button.addEventListener("click", () => {
      state.selectedSlotId = slot.id;
      state.idempotencyKey = null;
      state.payloadFingerprint = null;
      clearErrors();
      renderSlots();
    });
    elements.slotList.append(button);
  }
}

async function loadSlots() {
  elements.slotList.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("/api/slots", { headers: { accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error("技術対話の時間枠を読み込めませんでした。");
    state.slots = data.slots;
    if (state.selectedSlotId && !state.slots.some((slot) => slot.id === state.selectedSlotId && slot.available)) {
      state.selectedSlotId = null;
    }
    renderSlots();
  } catch (error) {
    elements.slotList.setAttribute("aria-busy", "false");
    elements.slotList.innerHTML = '<p class="empty-message">技術対話の時間枠を利用できません。準備状態を確認するか、しばらくして再試行してください。</p>';
  }
}

const fieldErrorMessages = Object.freeze({
  name: "名前は制御文字を含まない2〜80文字で入力してください。",
  email: "254文字以内の有効なメールアドレスを入力してください。",
  slotId: "有効なOffice Hoursの時間枠を選んでください。",
  privacyConsent: "入力内容を保存するには同意が必要です。",
});

function showFields(fields = {}) {
  for (const [field, message] of Object.entries(fields)) {
    const target = document.querySelector(`#field-${CSS.escape(field)}`);
    if (target) target.textContent = fieldErrorMessages[field] ?? message;
    const inputId = field === "privacyConsent" ? "privacy-consent" : field;
    const input = document.getElementById(inputId);
    if (input) input.setAttribute("aria-invalid", "true");
    if (field === "slotId") elements.slotList.setAttribute("aria-invalid", "true");
  }
}

function requestErrorMessage(status) {
  if (status === 400) return "入力内容を確認してから、リクエストをもう一度送信してください。";
  if (status === 409) return "その時間枠は別のリクエストで確保されました。別の時間を選んでください。";
  if (status === 429) return "短時間に多くのリクエストを受け付けました。少し待ってから再試行してください。";
  if (status === 503) return "リクエスト受付を一時的に利用できません。時間をおいて再試行してください。";
  return "予期しない問題により、リクエストを送信できませんでした。";
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const payload = {
    name: document.querySelector("#name").value,
    email: document.querySelector("#email").value,
    slotId: state.selectedSlotId ?? "",
    timezone: submissionTimezone,
    privacyConsent: document.querySelector("#privacy-consent").checked,
  };
  const fingerprint = JSON.stringify(payload);
  if (state.payloadFingerprint !== fingerprint) {
    state.idempotencyKey = crypto.randomUUID();
    state.payloadFingerprint = fingerprint;
  }

  elements.submit.disabled = true;
  elements.submitLabel.textContent = "送信しています…";
  let responseStatus = 500;
  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": state.idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    responseStatus = response.status;
    const data = await response.json();
    if (!response.ok) {
      showFields(data.error?.fields);
      throw new Error(requestErrorMessage(response.status));
    }

    const slot = state.slots.find((candidate) => candidate.id === data.booking.slotId);
    elements.successTime.textContent = slot ? dateParts(slot).full : new Date(data.booking.startAt).toLocaleString("ja-JP", { timeZone: displayTimezone });
    elements.bookingReference.textContent = data.booking.id;
    elements.bookingFlow.hidden = true;
    elements.successState.hidden = false;
    elements.successState.focus({ preventScroll: true });
    elements.successState.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    elements.formError.textContent = requestErrorMessage(responseStatus);
    elements.formError.hidden = false;
    if (responseStatus === 409) await loadSlots();
    elements.formError.focus?.();
  } finally {
    elements.submit.disabled = false;
    elements.submitLabel.textContent = "面談リクエストを送信する";
  }
});

document.querySelector("#book-another").addEventListener("click", async () => {
  state.selectedSlotId = null;
  state.idempotencyKey = null;
  state.payloadFingerprint = null;
  elements.form.reset();
  elements.successState.hidden = true;
  elements.bookingFlow.hidden = false;
  await loadSlots();
  document.querySelector("#booking-title").scrollIntoView({ behavior: "smooth" });
});

async function loadEngineeringView() {
  try {
    const response = await fetch("/api/engineering", { headers: { accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error("engineering endpoint unavailable");
    document.querySelector("#runtime-readiness").textContent = data.readiness === "ready" ? "リクエストを受け付けられます" : "リクエスト受付機能に問題があります";
    document.querySelector("#runtime-identity").textContent = `${data.runtime} Runtime · ${data.persistence} persistence`;
    document.querySelector("#metric-requests").textContent = data.counters.requests.toLocaleString();
    document.querySelector("#metric-bookings").textContent = data.counters.bookingsCreated.toLocaleString();
    document.querySelector("#metric-conflicts").textContent = data.counters.conflicts.toLocaleString();
    document.querySelector("#metric-uptime").textContent = `${data.counters.uptimeSeconds}s`;
  } catch {
    document.querySelector("#runtime-readiness").textContent = "Runtime Evidenceを取得できませんでした";
  } finally {
    elements.runtimePanel.setAttribute("aria-busy", "false");
  }
}

await Promise.all([loadSlots(), loadEngineeringView()]);
