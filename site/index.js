const sortListAlpha = list => [...list].sort((a, b) => {
    const A = a.textContent.trim(), B = b.textContent.trim();
    return (A < B) ? -1 : (A > B) ? 1 : 0;
});

const sortListTopicCount = list => [...list].sort((a, b) => {
    const A = parseInt(a.querySelector(".til-tag-count").textContent, 10);
    const B = parseInt(b.querySelector(".til-tag-count").textContent, 10);
    return B - A;
});

(() => {
    const storedTheme = localStorage.getItem("theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme || (systemDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;

    window.toggleTheme = () => {
        const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = nextTheme;
        localStorage.setItem("theme", nextTheme);
        const button = document.querySelector(".theme-toggle");
        if (button) button.setAttribute("aria-label", `Switch to ${nextTheme === "dark" ? "light" : "dark"} mode`);
    };

    document.addEventListener("DOMContentLoaded", () => {
        const button = document.querySelector(".theme-toggle");
        if (button) button.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
    });
})();

function sortAlpha() {
    const ul = document.querySelector(".topic-list");
    const list = ul.querySelectorAll("li");
    ul.append(...sortListAlpha(list));
}

function sortCount() {
    const ul = document.querySelector(".topic-list");
    const list = ul.querySelectorAll("li");
    ul.append(...sortListTopicCount(list));
}
