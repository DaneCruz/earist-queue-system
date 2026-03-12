(function () {
  const MOBILE_PHONE_REGEX = /Android.*Mobile|iPhone|Windows Phone|BlackBerry|IEMobile|Opera Mini/i;
  const isMobilePhone = MOBILE_PHONE_REGEX.test(navigator.userAgent) || window.matchMedia("(max-width: 768px)").matches;
  if (isMobilePhone) {
    return;
  }

  let targetInput = null;
  let capsLock = false;

  const keyboard = createKeyboard();
  document.body.appendChild(keyboard);

  const selector = 'input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="password"], textarea';

  document.addEventListener("focusin", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLElement) || !el.matches(selector)) {
      return;
    }
    if (el.hasAttribute("readonly") || el.hasAttribute("disabled")) {
      return;
    }
    targetInput = el;
    keyboard.classList.remove("vk-hidden");
    document.body.classList.add("vk-open");
  });

  document.addEventListener("mousedown", (event) => {
    const inKeyboard = keyboard.contains(event.target);
    const inTarget = targetInput && targetInput === event.target;
    if (!inKeyboard && !inTarget) {
      keyboard.classList.add("vk-hidden");
      targetInput = null;
      document.body.classList.remove("vk-open");
    }
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      keyboard.classList.add("vk-hidden");
      targetInput = null;
      document.body.classList.remove("vk-open");
    }
  });

  function createKeyboard() {
    const wrapper = document.createElement("div");
    wrapper.className = "virtual-keyboard vk-hidden";
    wrapper.setAttribute("aria-label", "On-screen keyboard");

    const row1 = document.createElement("div");
    row1.className = "vk-row";
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].forEach((key) =>
      row1.appendChild(createKey(key, "char"))
    );
    wrapper.appendChild(row1);

    const row2 = document.createElement("div");
    row2.className = "vk-row";
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"].forEach((key) =>
      row2.appendChild(createKey(key, "char"))
    );
    wrapper.appendChild(row2);

    const row3 = document.createElement("div");
    row3.className = "vk-row";
    row3.appendChild(createKey("Caps", "caps", "wide"));
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"].forEach((key) =>
      row3.appendChild(createKey(key, "char"))
    );
    row3.appendChild(createKey("Bksp", "backspace", "wide"));
    wrapper.appendChild(row3);

    const row4 = document.createElement("div");
    row4.className = "vk-row";
    ["@", ".", "-", "_", "z", "x", "c", "v", "b", "n", "m"].forEach((key) =>
      row4.appendChild(createKey(key, "char"))
    );
    wrapper.appendChild(row4);

    const row5 = document.createElement("div");
    row5.className = "vk-row";
    row5.appendChild(createKey("Space", "space", "extra-wide"));
    row5.appendChild(createKey("Clear", "clear", "wide"));
    row5.appendChild(createKey("Done", "done", "wide"));
    wrapper.appendChild(row5);

    return wrapper;
  }

  function createKey(label, type, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `vk-key ${extraClass}`.trim();
    button.textContent = label;
    button.dataset.type = type;
    button.dataset.value = label;

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    button.addEventListener("click", () => {
      if (!targetInput) {
        return;
      }

      if (type === "caps") {
        capsLock = !capsLock;
        button.classList.toggle("active", capsLock);
        return;
      }

      if (type === "backspace") {
        backspaceAtCursor(targetInput);
        return;
      }

      if (type === "space") {
        insertAtCursor(targetInput, " ");
        return;
      }

      if (type === "clear") {
        targetInput.value = "";
        dispatchInput(targetInput);
        return;
      }

      if (type === "done") {
        targetInput.blur();
        targetInput = null;
        document.querySelector(".virtual-keyboard")?.classList.add("vk-hidden");
        document.body.classList.remove("vk-open");
        return;
      }

      const value = capsLock ? label.toUpperCase() : label;
      insertAtCursor(targetInput, value);
    });

    return button;
  }

  function insertAtCursor(el, text) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = `${before}${text}${after}`;
    const next = start + text.length;
    el.setSelectionRange(next, next);
    el.focus();
    dispatchInput(el);
  }

  function backspaceAtCursor(el) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start !== end) {
      insertRange(el, start, end, "");
      return;
    }
    if (start === 0) {
      return;
    }
    insertRange(el, start - 1, start, "");
  }

  function insertRange(el, from, to, replacement) {
    el.value = `${el.value.slice(0, from)}${replacement}${el.value.slice(to)}`;
    const next = from + replacement.length;
    el.setSelectionRange(next, next);
    el.focus();
    dispatchInput(el);
  }

  function dispatchInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
})();
