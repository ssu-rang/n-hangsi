"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const wordInput = document.querySelector("[data-poem-word]");
    const preview = document.querySelector("[data-poem-preview]");
    const linesContainer = document.querySelector("[data-poem-lines]");
    if (!wordInput || !linesContainer) return;

    const renderLineInputs = () => {
        const characters = Array.from(wordInput.value.trim()).slice(0, 5);
        wordInput.value = characters.join("");
        const previousValues = Array.from(linesContainer.querySelectorAll("input")).map(input => input.value);
        linesContainer.replaceChildren(...characters.map((character, index) => {
            const group = document.createElement("div");
            group.className = "mb-3";
            const label = document.createElement("label");
            label.className = "form-label fw-semibold";
            label.htmlFor = `line-${index}`;
            label.textContent = `${character}로 시작하는 문장`;
            const input = document.createElement("input");
            input.className = "form-control";
            input.id = `line-${index}`;
            input.name = `lines[${index}]`;
            input.maxLength = 80;
            input.required = true;
            input.value = previousValues[index] ?? "";
            input.placeholder = `${character}...`;
            group.append(label, input);
            return group;
        }));
        if (preview) preview.textContent = characters.length ? `${characters.length}개의 문장을 입력해 주세요.` : "제시어를 입력해 주세요.";
    };
    wordInput.addEventListener("input", renderLineInputs);
    renderLineInputs();
});
