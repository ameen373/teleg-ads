const ar = require('./ar');
const en = require('./en');

const translations = { ar, en };

function t(lang, key) {
    const keys = key.split('.');
    let val = translations[lang] || translations['ar'];
    for (let k of keys) {
        if (val[k]) val = val[k];
        else return key;
    }
    return val;
}

module.exports = { t };
