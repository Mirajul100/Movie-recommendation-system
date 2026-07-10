const themeBtn = qs("#theme-toggle");
const themeIcon = themeBtn.querySelector("i");

// Toggle theme
themeBtn.onclick = () => {
    document.body.classList.toggle("light");

    if (document.body.classList.contains("light")) {
        themeIcon.className = "fa-regular fa-sun";
    } else {
        themeIcon.className = "fa-regular fa-moon";
    }

    localStorage.setItem(
        "mf_theme",
        document.body.classList.contains("light") ? "light" : "dark"
    );
};

// Load saved theme
if (localStorage.getItem("mf_theme") === "light") {
    document.body.classList.add("light");
    themeIcon.className = "fa-regular fa-sun";
} else {
    themeIcon.className = "fa-regular fa-moon";
}