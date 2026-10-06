// Applies the saved theme before first paint so light-mode users never see a dark flash.
try { if (JSON.parse(localStorage.getItem('mapped:theme')) === 'light') document.documentElement.dataset.theme = 'light'; } catch (e) {}
