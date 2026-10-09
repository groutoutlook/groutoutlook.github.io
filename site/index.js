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
    let storedTheme;
    try {
        storedTheme = localStorage.getItem("theme");
    } catch {
        // Theme switching still works when browser storage is unavailable.
    }
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = ["dark", "light"].includes(storedTheme) ? storedTheme : (systemDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;

    const syncSwitch = () => {
        const control = document.querySelector('.theme-toggle input');
        if (control) control.checked = document.documentElement.dataset.theme === "dark";
    };

    window.setTheme = nextTheme => {
        document.documentElement.dataset.theme = nextTheme;
        syncSwitch();
        try {
            localStorage.setItem("theme", nextTheme);
        } catch {
            // A blocked storage preference must not prevent changing the theme.
        }
    };

    document.addEventListener("DOMContentLoaded", syncSwitch);
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

function sortChronological() {
    const ul = document.querySelector(".topic-list");
    const list = [...ul.querySelectorAll("li")];
    list.sort((a, b) => Date.parse(b.dataset.sortDate) - Date.parse(a.dataset.sortDate));
    ul.append(...list);
}

function shuffleTags() {
    const ul = document.querySelector(".topic-list");
    const list = [...ul.querySelectorAll("li")];
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    ul.append(...list);
}

function showRandomEntries() {
    const source = [...document.querySelectorAll("#random-source a")];
    const results = document.querySelector("#random-results");
    if (!results || !source.length) return;
    for (let i = source.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [source[i], source[j]] = [source[j], source[i]];
    }
    results.replaceChildren(...source.slice(0, 5).map(link => {
        const item = document.createElement("a");
        item.href = link.href;
        item.className = "random-entry";
        item.textContent = link.textContent;
        return item;
    }));
}
