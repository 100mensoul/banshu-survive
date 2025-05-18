document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("awardGrid");

  michinoekiAwards.forEach(item => {
    const card = document.createElement("div");
    card.className = "award-card";

    card.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div class="award-title">${item.name} <span>｜${item.award}</span></div>
      <div class="award-description">${item.description}</div>
      <div class="award-links">
        ${item.album ? `<a href="${item.album}" target="_blank">写真アルバム</a>` : ''}
        ${item.link ? `<a href="${item.link}" target="_blank">公式サイト</a>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });
});