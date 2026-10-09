/* Azivo — compara o firestore.rules novo com o atual (publicado) e com as colecoes que o app usa.
   Uso: node compararRegras.js [regras-atuais] [regras-novas] [roteiro.html]
   Para conferir contra o console: cole o texto de Firestore > Regras em firestore.rules.atual */
const fs = require('fs');
const path = require('path');
const atualTxt = fs.readFileSync(process.argv[2] || path.join(__dirname, 'firestore.rules.atual'), 'utf8');
const novoTxt = fs.readFileSync(process.argv[3] || path.join(__dirname, 'firestore.rules'), 'utf8');
const fonte = process.argv[4] || path.join(__dirname, '..', 'roteiro.html');
let ok = true;
const checar = (n, c, d) => { if (!c) ok = false; console.log((c ? 'PASSOU  ' : 'FALHOU  ') + n + (d ? '   ' + d : '')); };
const semComentario = t => t.replace(/\/\/[^\n]*/g, '');
// blocos "match /x/{y} { ... }" de primeiro nivel dentro de /databases/{database}/documents
function blocos(txt) {
  txt = semComentario(txt);
  const base = txt.indexOf('match /databases/{database}/documents');
  let i = txt.indexOf('{', base + 'match /databases/{database}/documents'.length) + 1, nivel = 1;
  const out = {};
  while (i < txt.length && nivel > 0) {
    const m = txt.slice(i).match(/^\s*match\s+(\S+)\s*\{/);
    if (m && nivel === 1) {
      const ini = i + m[0].length;
      let n = 1, k = ini;
      while (k < txt.length && n > 0) { if (txt[k] === '{') n++; else if (txt[k] === '}') n--; k++; }
      out[m[1]] = txt.slice(ini, k - 1).replace(/\s+/g, ' ').trim();
      i = k;
      continue;
    }
    if (txt[i] === '{') nivel++; else if (txt[i] === '}') nivel--;
    i++;
  }
  return out;
}
function funcao(txt, nome) {
  const t = semComentario(txt);
  const i = t.indexOf('function ' + nome + '(');
  if (i < 0) return null;
  let k = t.indexOf('{', i) + 1, n = 1;
  while (n > 0 && k < t.length) { if (t[k] === '{') n++; else if (t[k] === '}') n--; k++; }
  return t.slice(i, k).replace(/\s+/g, ' ');
}
const A = blocos(atualTxt), N = blocos(novoTxt);
console.log('Regras atuais: ' + Object.keys(A).join(', '));
console.log('Regras novas:  ' + Object.keys(N).join(', ') + '\n');
Object.keys(A).forEach(k => checar('mesma regra para ' + k, N[k] === A[k], N[k] === undefined ? 'SUMIU no arquivo novo' : N[k] !== A[k] ? '\n   atual: ' + A[k] + '\n   nova:  ' + N[k] : ''));
checar('funcao ehAdmin identica', funcao(atualTxt, 'ehAdmin') === funcao(novoTxt, 'ehAdmin'));
const novas = Object.keys(N).filter(k => !(k in A));
console.log('\nColecoes novas: ' + novas.join(', '));
const raiz = k => (k.match(/^\/([^/{]+)/) || [])[1];
const antigasRaiz = Object.keys(A).map(raiz).filter(x => x && x !== '{document=**}');
checar('nenhuma regra nova cai sobre colecao antiga', novas.every(k => antigasRaiz.indexOf(raiz(k)) < 0 && raiz(k) !== undefined), novas.map(raiz).join(', '));
checar('bloqueio geral de colecoes desconhecidas continua igual', N['/{document=**}'] === A['/{document=**}']);
// colecoes que o app usa precisam ter regra (senao o bloqueio geral recusa)
if (fs.existsSync(fonte)) {
  const src = fs.readFileSync(fonte, 'utf8');
  const usadas = [...new Set([...src.matchAll(/collection\(CONFIG\.prefixo \+ "([a-z_]+)"\)/g)].map(m => 'rt_' + m[1]))];
  const comRegra = Object.keys(N).map(raiz);
  usadas.forEach(c => checar('o app usa ' + c + ' e ha regra para ela', comRegra.indexOf(c) >= 0));
}
console.log(ok ? '\nTUDO CERTO' : '\nTEM FALHA');
process.exit(ok ? 0 : 1);
