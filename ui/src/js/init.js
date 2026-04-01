import '../css/styles.css';
import htmlContent from '../html/body.html?raw';

document.getElementById('app').innerHTML = htmlContent;

import('./main.js').then((module) => {
    // This ensures main.js is evaluated after innerHTML is set
});
