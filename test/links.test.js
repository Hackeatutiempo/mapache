const test = require('node:test');
const assert = require('node:assert');
const { linkify, asUrl } = require('../src/links.js');
const B = require('../lib/board.js');

const a = (href, text = href) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

test('las direcciones sueltas pasan a ser enlaces', () => {
  assert.strictEqual(linkify('https://mapache.app'), a('https://mapache.app'));
  assert.strictEqual(linkify('mira www.youtube.com/watch?v=1 ya'), `mira ${a('https://www.youtube.com/watch?v=1', 'www.youtube.com/watch?v=1')} ya`);
  assert.strictEqual(linkify('http://localhost:4321/#m=x'), a('http://localhost:4321/#m=x'));
  assert.strictEqual(linkify('<b>https://a.com/x</b>'), `<b>${a('https://a.com/x')}</b>`);
});

test('la puntuación de detrás no es parte del enlace', () => {
  assert.strictEqual(linkify('ver https://a.com/x.'), `ver ${a('https://a.com/x')}.`);
  assert.strictEqual(linkify('(ver https://a.com/x)'), `(ver ${a('https://a.com/x')})`);
  assert.strictEqual(linkify('https://es.wikipedia.org/wiki/Mapache_(animal)'), a('https://es.wikipedia.org/wiki/Mapache_(animal)'));
  assert.strictEqual(linkify('&quot;https://a.com&quot;'), `&quot;${a('https://a.com')}&quot;`);
  assert.strictEqual(linkify('https://a.com/?q=1&amp;b=2'), a('https://a.com/?q=1&amp;b=2'));
});

test('no toca los enlaces que ya hay, el código ni lo que no es una dirección', () => {
  const done = a('https://a.com', 'mi web');
  assert.strictEqual(linkify(done), done);
  assert.strictEqual(linkify('<code>https://a.com</code>'), '<code>https://a.com</code>');
  for (const s of ['www.', 'https://', 'https://nada', 'www.algo', 'texto normal']) assert.strictEqual(linkify(s), s);
});

test('pegar una dirección: solo si es una sola', () => {
  assert.strictEqual(asUrl(' https://a.com/x '), 'https://a.com/x');
  assert.strictEqual(asUrl('www.a.com'), 'https://www.a.com');
  assert.strictEqual(asUrl('https://a.com y más'), null);
  assert.strictEqual(asUrl('hola'), null);
});

test('los agentes también crean enlaces y los leen como la dirección', () => {
  const t = B.textToLines('Docs: https://github.com/Hackeatutiempo/mapache');
  assert.strictEqual(t.lines[0], `Docs: ${a('https://github.com/Hackeatutiempo/mapache')}`);
  assert.strictEqual(B.htmlToText(t.lines[0]), 'Docs: https://github.com/Hackeatutiempo/mapache');
  assert.strictEqual(B.htmlToText(a('https://www.a.com', 'www.a.com')), 'www.a.com');
  assert.strictEqual(B.htmlToText(a('https://a.com', 'mi web')), '[mi web](https://a.com)');
});
