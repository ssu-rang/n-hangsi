"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const wordInput = document.querySelector("[data-poem-word]");
  const lineArea = document.querySelector("[data-poem-lines]");
  const preview = document.querySelector("[data-poem-preview]");
  if (wordInput && lineArea && preview) {
    const render = () => {
      const letters = [...wordInput.value.replace(/\s/g, "").slice(0, 6)];
      wordInput.value = letters.join("");
      lineArea.innerHTML = letters.map((letter, index) => `<div class="input-group mb-3"><span class="input-group-text preview-letter">${letter}</span><input class="form-control" name="lines[${index}]" maxlength="80" placeholder="${letter}(으)로 시작하는 문장" required></div>`).join("");
      preview.textContent = letters.length ? `${letters.length}행시를 작성해 보세요.` : "제시어를 입력하세요.";
    };
    wordInput.addEventListener("input", render);
    render();
  }

  document.querySelectorAll("[data-confirm]").forEach((button) => button.addEventListener("click", (event) => {
    if (!window.confirm(button.dataset.confirm)) event.preventDefault();
  }));
});
