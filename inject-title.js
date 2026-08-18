const fs = require('fs');

const title = process.env.Title || 'Dietary Interventions &amp; Health Outcomes';
const indexPath = 'index.html';

let html = fs.readFileSync(indexPath, 'utf-8');
// Replace the exact h1 tag
html = html.replace(
  /<h1 id="app-title">.*?<\/h1>/,
  `<h1 id="app-title">${title}</h1>`
);

fs.writeFileSync(indexPath, html);
console.log('Injected title:', title);
