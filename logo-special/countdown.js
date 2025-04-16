const releaseDate = new Date('2025-04-25');
const today = new Date();
const timeDiff = releaseDate - today;
const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
document.getElementById("daysLeft").textContent = daysLeft;
