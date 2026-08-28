"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const wordInput = document.querySelector("[data-poem-word]");
    const preview = document.querySelector("[data-poem-preview]");
    const linesContainer = document.querySelector("[data-poem-lines]");
    if (!wordInput || !linesContainer) return;

    const validateLineInput = (input, character) => {
        const group = input.closest(".mb-3");
        if (!group) return;
        let error = group.querySelector("[data-line-error]");
        const hasWrongStart = input.value.length > 0 && !input.value.startsWith(character);
        input.setCustomValidity(hasWrongStart ? `'${character}'(으)로 시작해야 합니다.` : "");
        input.setAttribute("aria-invalid", String(hasWrongStart));
        if (hasWrongStart) {
            if (!error) {
                error = document.createElement("div");
                error.className = "text-danger small";
                error.dataset.lineError = "";
                group.append(error);
            }
            error.textContent = `'${character}'(으)로 시작해야 합니다.`;
        } else if (error) {
            error.remove();
        }
    };

    const connectLineInput = (input, character) => {
        input.dataset.poemLine = "";
        input.addEventListener("input", () => validateLineInput(input, character));
    };

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
            connectLineInput(input, character);
            group.append(label, input);
            validateLineInput(input, character);
            return group;
        }));
        if (preview) preview.textContent = characters.length ? `${characters.length}개의 문장을 입력해 주세요.` : "제시어를 입력해 주세요.";
    };
    wordInput.addEventListener("input", renderLineInputs);
    const initialCharacters = Array.from(wordInput.value.trim()).slice(0, 5);
    const initialInputs = Array.from(linesContainer.querySelectorAll("input"));
    if (initialInputs.length === initialCharacters.length && initialInputs.length > 0) {
        initialInputs.forEach((input, index) => {
            connectLineInput(input, initialCharacters[index]);
            validateLineInput(input, initialCharacters[index]);
        });
        if (preview) preview.textContent = `${initialCharacters.length}개의 문장을 입력해 주세요.`;
    } else {
        renderLineInputs();
    }
});
