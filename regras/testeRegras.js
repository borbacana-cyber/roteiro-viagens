/* Azivo — testes das regras do Firestore e do Storage no Emulator Suite (regras reais, motor oficial).
   Rodar:  npm install  &&  npm test
   (equivale a: npx firebase emulators:exec --project demo-azivo --only firestore,storage "node testeRegras.js")
   Perfis: dono (UA), editor (UE), so leitura (UL), externo (UX), familia (sem login), admin, privado. */
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const apagar = () => firebase.firestore.FieldValue.delete();

const ADMIN = 'Lwmp7kTbzoYE7kKVobIK48AwQ9B2';
const CLAIM = 'claimDeCriacao_0123456789abcdef';
const TOK_ED = 'tokenEditor_0123456789abcdef0123';
const TOK_LE = 'tokenLeitor_0123456789abcdef01234';
let falhas = 0, total = 0;
async function caso(nome, deveFuncionar, fn) {
  total++;
  try {
    await (deveFuncionar ? assertSucceeds(fn()) : assertFails(fn()));
    console.log('PASSOU  ' + nome);
  } catch (e) {
    falhas++;
    console.log('FALHOU  ' + nome + '   ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-azivo',
    firestore: { rules: fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8') },
    storage: { rules: fs.readFileSync(path.join(__dirname, 'storage.rules'), 'utf8') }
  });
  const semear = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc('rt_viagens/velha').set({ viagem: { nome: 'Viagem antiga' } });
      await db.doc('rt_viagens/t1').set({ viagem: { nome: 'Tailandia' } });
      await db.doc('rt_claims/nova').set({ segredo: CLAIM, criadoEm: 1 });
      await db.doc('rt_usuarios/UA').set({ viagens: [] });
      await db.doc('rt_config/global').set({ admins: [] });
      await db.doc('rt_memorias/t1').set({ viagemId: 't1', dono: 'UA', criadoEm: 1, membros: { UA: { papel: 'dono', desde: 1 }, UE: { papel: 'editor', via: TOK_ED, desde: 2 }, UL: { papel: 'leitor', via: TOK_LE, desde: 3 } } });
      await db.doc('rt_memorias/t1/convites/' + TOK_ED).set({ papel: 'editor', criadoPor: 'UA', criadoEm: 1 });
      await db.doc('rt_memorias/t1/convites/' + TOK_LE).set({ papel: 'leitor', criadoPor: 'UA', criadoEm: 1 });
      await db.doc('rt_memorias/t1/acesso/convites').set({ editor: TOK_ED, leitor: TOK_LE });
      await db.doc('rt_memorias/t1/momentos/m_mig_f_f1').set({ id: 'm_mig_f_f1', autorId: null, origem: 'migrado', privacidade: 'grupo', texto: 'grupo', criadoEm: 10 });
      await db.doc('rt_memorias/t1/momentos/m_a').set({ id: 'm_a', autorId: 'UA', origem: 'momentos', privacidade: 'grupo', texto: 'do dono', criadoEm: 11 });
      await db.doc('rt_memorias/t1/momentos/m_e').set({ id: 'm_e', autorId: 'UE', origem: 'momentos', privacidade: 'grupo', texto: 'do editor', criadoEm: 12 });
      await db.doc('rt_memorias_privadas/UA/momentos/p1').set({ id: 'p1', autorId: 'UA', viagemId: 't1', privacidade: 'privado' });
    });
  };
  await semear();
  const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
  const dono = db('UA'), editor = db('UE'), leitor = db('UL'), externo = db('UX'), familia = db(null), admin = db(ADMIN);

  // ---------- 1) colecoes antigas continuam como estao ----------
  await caso('antigas: rt_viagens le e grava sem login (como hoje)', true, () => familia.doc('rt_viagens/t1').get());
  await caso('antigas: rt_viagens grava sem login', true, () => familia.doc('rt_viagens/nova-x').set({ a: 1 }));
  await caso('antigas: rt_viagens nao lista', false, () => familia.collection('rt_viagens').get());
  await caso('antigas: rt_posicoes le e grava', true, () => familia.doc('rt_posicoes/t1').set({ lat: 1 }));
  await caso('antigas: rt_pessoais le e grava', true, () => familia.doc('rt_pessoais/t1__p').set({ a: 1 }));
  await caso('antigas: rt_pessoais lista (consulta do grupo)', true, () => familia.collection('rt_pessoais').where('viagemId', '==', 't1').get());
  await caso('antigas: rt_usuarios do proprio', true, () => dono.doc('rt_usuarios/UA').get());
  await caso('antigas: rt_usuarios de outro, nao', false, () => externo.doc('rt_usuarios/UA').get());
  await caso('antigas: rt_usuarios admin le', true, () => admin.doc('rt_usuarios/UA').get());
  await caso('antigas: rt_config todos leem', true, () => familia.doc('rt_config/global').get());
  await caso('antigas: rt_config so admin grava', false, () => dono.doc('rt_config/global').set({ x: 1 }));
  await caso('antigas: rt_config admin grava', true, () => admin.doc('rt_config/global').set({ x: 1 }));
  await caso('antigas: rt_publicados le e grava', true, () => familia.doc('rt_publicados/r1').set({ a: 1 }));
  await caso('antigas: rt_conteudo le e grava, nao lista', true, () => familia.doc('rt_conteudo/r1__s').set({ a: 1 }));
  await caso('antigas: rt_conteudo nao lista', false, () => familia.collection('rt_conteudo').get());
  await caso('colecao desconhecida continua bloqueada', false, () => familia.doc('qualquer/coisa').get());

  // ---------- 2) claim de criacao ----------
  await caso('claim: viagem nova (ainda nao na nuvem) aceita claim sem login', true, () => familia.doc('rt_claims/nova2').set({ segredo: CLAIM + 'x', criadoEm: 1 }));
  await caso('claim: viagem que ja existe na nuvem nao aceita claim (fim do "quem chega primeiro")', false, () => externo.doc('rt_claims/velha').set({ segredo: CLAIM, criadoEm: 1 }));
  await caso('claim: nao sobrescreve claim existente', false, () => externo.doc('rt_claims/nova').set({ segredo: 'outroSegredo_0123456789abcdef', criadoEm: 2 }));
  await caso('claim: ninguem le', false, () => dono.doc('rt_claims/nova').get());
  await caso('claim: segredo curto recusado', false, () => familia.doc('rt_claims/nova3').set({ segredo: 'curto', criadoEm: 1 }));
  await caso('claim: campo a mais recusado', false, () => familia.doc('rt_claims/nova4').set({ segredo: CLAIM, criadoEm: 1, dono: 'UX' }));
  await caso('claim: admin pode emitir para viagem antiga', true, () => admin.doc('rt_claims/velha').set({ segredo: 'claimDoAdmin_0123456789abcdef', criadoEm: 1 }));

  // ---------- 3) quem vira dono ----------
  const docDono = (uid, extra) => Object.assign({ viagemId: 'nova', dono: uid, membros: { [uid]: { papel: 'dono', desde: 1 } }, criadoEm: 1 }, extra || {});
  await caso('dono: externo sem claim nao vira dono de viagem nova', false, () => externo.doc('rt_memorias/nova').set(docDono('UX')));
  await caso('dono: claim errado recusado', false, () => externo.doc('rt_memorias/nova').set(docDono('UX', { claim: 'claimErrado_0123456789abcdefgh' })));
  await caso('dono: dono diferente de quem grava recusado', false, () => externo.doc('rt_memorias/nova').set(Object.assign(docDono('UA', { claim: CLAIM }))));
  await caso('dono: dois membros na criacao recusado', false, () => externo.doc('rt_memorias/nova').set({ viagemId: 'nova', dono: 'UX', claim: CLAIM, membros: { UX: { papel: 'dono', desde: 1 }, UY: { papel: 'editor', desde: 1 } }, criadoEm: 1 }));
  await caso('dono: viagemId diferente do caminho recusado', false, () => externo.doc('rt_memorias/nova').set(docDono('UX', { claim: CLAIM, viagemId: 'outra' })));
  await caso('dono: viagem antiga sem claim, ninguem vira dono', false, () => externo.doc('rt_memorias/velha').set({ viagemId: 'velha', dono: 'UX', membros: { UX: { papel: 'dono', desde: 1 } }, criadoEm: 1 }));
  await caso('dono: quem tem o claim de criacao vira dono', true, () => externo.doc('rt_memorias/nova').set(docDono('UX', { claim: CLAIM })));
  await caso('dono: depois de criado, claim so pode ser apagado', true, () => externo.doc('rt_memorias/nova').update({ claim: '' }));
  await caso('dono: ninguem recria por cima', false, () => db('UY').doc('rt_memorias/nova').set(docDono('UY', { claim: CLAIM })));
  await caso('dono: admin define o dono de viagem antiga', true, () => admin.doc('rt_memorias/velha').set({ viagemId: 'velha', dono: 'UO', membros: { UO: { papel: 'dono', desde: 1 } }, criadoEm: 1 }));

  // ---------- 4) leitura do documento da viagem ----------
  await caso('viagem: participante le', true, () => leitor.doc('rt_memorias/t1').get());
  await caso('viagem: externo nao le', false, () => externo.doc('rt_memorias/t1').get());
  await caso('viagem: familia (sem login) nao le', false, () => familia.doc('rt_memorias/t1').get());
  await caso('viagem: documento que nao existe so diz que nao existe', true, () => externo.doc('rt_memorias/nao-existe').get());
  await caso('viagem: ninguem lista', false, () => dono.collection('rt_memorias').get());

  // ---------- 5) entrar com convite e adulterar membros ----------
  await caso('convite: token de editor entra como editor', true, () => db('UB').doc('rt_memorias/t1').update({ 'membros.UB': { papel: 'editor', via: TOK_ED, desde: 5 } }));
  await caso('convite: token de leitor nao entra como editor', false, () => db('UC').doc('rt_memorias/t1').update({ 'membros.UC': { papel: 'editor', via: TOK_LE, desde: 5 } }));
  await caso('convite: token de leitor entra como leitor', true, () => db('UC').doc('rt_memorias/t1').update({ 'membros.UC': { papel: 'leitor', via: TOK_LE, desde: 5 } }));
  await caso('convite: token inventado recusado', false, () => externo.doc('rt_memorias/t1').update({ 'membros.UX': { papel: 'editor', via: 'inventado_0123456789abcdef0123', desde: 5 } }));
  await caso('convite: ninguem entra como dono', false, () => externo.doc('rt_memorias/t1').update({ 'membros.UX': { papel: 'dono', via: TOK_ED, desde: 5 } }));
  await caso('convite: nao coloca outra pessoa junto', false, () => externo.doc('rt_memorias/t1').update({ 'membros.UX': { papel: 'editor', via: TOK_ED, desde: 5 }, 'membros.UZ': { papel: 'editor', via: TOK_ED, desde: 5 } }));
  await caso('convite: nao muda outros campos ao entrar', false, () => externo.doc('rt_memorias/t1').update({ 'membros.UX': { papel: 'editor', via: TOK_ED, desde: 5 }, dono: 'UX' }));
  await caso('leitor nao se promove a editor', false, () => leitor.doc('rt_memorias/t1').update({ 'membros.UL': { papel: 'editor', via: TOK_ED, desde: 3 } }));
  await caso('editor nao acrescenta ninguem', false, () => editor.doc('rt_memorias/t1').update({ 'membros.UZ': { papel: 'editor', desde: 9 } }));
  await caso('editor nao vira dono', false, () => editor.doc('rt_memorias/t1').update({ dono: 'UE' }));
  await caso('dono remove um participante', true, () => dono.doc('rt_memorias/t1').update({ 'membros.UC': apagar() }));
  await caso('participante removido nao le mais os momentos', false, () => db('UC').collection('rt_memorias/t1/momentos').get());
  await caso('membro anulado (valor nulo) nao conta como participante', false, () => env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('rt_memorias/t1').update({ 'membros.UN': null })).then(() => db('UN').doc('rt_memorias/t1/momentos/m_a').get()));
  await caso('dono nao muda o proprio papel', false, () => dono.doc('rt_memorias/t1').update({ 'membros.UA': { papel: 'editor', desde: 1 } }));
  await caso('dono nao muda viagemId', false, () => dono.doc('rt_memorias/t1').update({ viagemId: 'outra' }));
  await caso('ninguem apaga o documento da viagem', false, () => dono.doc('rt_memorias/t1').delete());

  // ---------- 6) convites e lista de tokens ----------
  await caso('convites: editor cria token de editor', true, () => editor.doc('rt_memorias/t1/convites/novoToken_0123456789abcdef0123').set({ papel: 'editor', criadoPor: 'UE', criadoEm: 1 }));
  await caso('convites: leitor nao cria token', false, () => leitor.doc('rt_memorias/t1/convites/tokenDoLeitor_0123456789abcdef01').set({ papel: 'leitor', criadoPor: 'UL', criadoEm: 1 }));
  await caso('convites: ninguem cria token de dono', false, () => dono.doc('rt_memorias/t1/convites/tokenDono_0123456789abcdef01234').set({ papel: 'dono', criadoPor: 'UA', criadoEm: 1 }));
  await caso('convites: criadoPor forjado recusado', false, () => editor.doc('rt_memorias/t1/convites/forjado_0123456789abcdef012345').set({ papel: 'editor', criadoPor: 'UA', criadoEm: 1 }));
  await caso('convites: ninguem le um token', false, () => dono.doc('rt_memorias/t1/convites/' + TOK_ED).get());
  await caso('acesso: editor le a lista de tokens', true, () => editor.doc('rt_memorias/t1/acesso/convites').get());
  await caso('acesso: leitor nao le a lista de tokens', false, () => leitor.doc('rt_memorias/t1/acesso/convites').get());
  await caso('acesso: externo nao le', false, () => externo.doc('rt_memorias/t1/acesso/convites').get());

  // ---------- 7) momentos do grupo ----------
  await caso('momentos: leitor le', true, () => leitor.collection('rt_memorias/t1/momentos').get());
  await caso('momentos: externo nao le', false, () => externo.collection('rt_memorias/t1/momentos').get());
  await caso('momentos: familia nao le', false, () => familia.doc('rt_memorias/t1/momentos/m_a').get());
  await caso('momentos: editor cria o seu', true, () => editor.doc('rt_memorias/t1/momentos/m_e2').set({ id: 'm_e2', autorId: 'UE', origem: 'momentos', privacidade: 'grupo' }));
  await caso('momentos: autorId forjado recusado', false, () => editor.doc('rt_memorias/t1/momentos/m_f').set({ id: 'm_f', autorId: 'UA', origem: 'momentos', privacidade: 'grupo' }));
  await caso('momentos: privado nunca entra no grupo', false, () => editor.doc('rt_memorias/t1/momentos/m_p').set({ id: 'm_p', autorId: 'UE', origem: 'momentos', privacidade: 'privado' }));
  await caso('momentos: id diferente do documento recusado', false, () => editor.doc('rt_memorias/t1/momentos/m_x').set({ id: 'm_y', autorId: 'UE', origem: 'momentos', privacidade: 'grupo' }));
  await caso('momentos: leitor nao grava', false, () => leitor.doc('rt_memorias/t1/momentos/m_l').set({ id: 'm_l', autorId: 'UL', origem: 'momentos', privacidade: 'grupo' }));
  await caso('momentos: migrado (sem autor) entra como Participantes', true, () => editor.doc('rt_memorias/t1/momentos/m_mig_f_f9').set({ id: 'm_mig_f_f9', autorId: null, origem: 'migrado', privacidade: 'grupo' }));
  await caso('momentos: sem autor so com id de migracao', false, () => editor.doc('rt_memorias/t1/momentos/m_anon').set({ id: 'm_anon', autorId: null, origem: 'migrado', privacidade: 'grupo' }));
  await caso('momentos: migrado nao nasce publico', false, () => editor.doc('rt_memorias/t1/momentos/m_mig_f_f8').set({ id: 'm_mig_f_f8', autorId: null, origem: 'migrado', privacidade: 'publico' }));
  await caso('momentos: autor edita o seu', true, () => editor.doc('rt_memorias/t1/momentos/m_e').update({ texto: 'editado' }));
  await caso('momentos: editor nao edita o do dono', false, () => editor.doc('rt_memorias/t1/momentos/m_a').update({ texto: 'mexi' }));
  await caso('momentos: editor nao torna o do outro publico', false, () => editor.doc('rt_memorias/t1/momentos/m_a').update({ privacidade: 'publico' }));
  await caso('momentos: editor edita registro do grupo', true, () => editor.doc('rt_memorias/t1/momentos/m_mig_f_f1').update({ texto: 'grupo editado' }));
  await caso('momentos: registro do grupo nao vira publico por editor', false, () => editor.doc('rt_memorias/t1/momentos/m_mig_f_f1').update({ privacidade: 'publico' }));
  await caso('momentos: editor nao assume registro do grupo', false, () => editor.doc('rt_memorias/t1/momentos/m_mig_f_f1').update({ autorId: 'UE' }));
  await caso('momentos: dono assume registro do grupo', true, () => dono.doc('rt_memorias/t1/momentos/m_mig_f_f1').update({ autorId: 'UA', removido: 'movido' }));
  await caso('momentos: autor nao troca a origem', false, () => editor.doc('rt_memorias/t1/momentos/m_e').update({ origem: 'migrado' }));
  await caso('momentos: autor nao passa a autoria', false, () => editor.doc('rt_memorias/t1/momentos/m_e').update({ autorId: 'UL' }));
  await caso('momentos: ninguem apaga (so marca removido)', false, () => dono.doc('rt_memorias/t1/momentos/m_a').delete());

  // ---------- 8) privados ----------
  await caso('privado: o dono le o seu', true, () => dono.doc('rt_memorias_privadas/UA/momentos/p1').get());
  await caso('privado: o dono grava o seu', true, () => dono.doc('rt_memorias_privadas/UA/momentos/p2').set({ id: 'p2', autorId: 'UA', viagemId: 't1', privacidade: 'privado' }));
  await caso('privado: participante da viagem nao le o privado do outro', false, () => editor.doc('rt_memorias_privadas/UA/momentos/p1').get());
  await caso('privado: participante nao lista o privado do outro', false, () => editor.collection('rt_memorias_privadas/UA/momentos').where('viagemId', '==', 't1').get());
  await caso('privado: familia nao le', false, () => familia.doc('rt_memorias_privadas/UA/momentos/p1').get());
  await caso('privado: ninguem grava na area do outro', false, () => editor.doc('rt_memorias_privadas/UA/momentos/p9').set({ id: 'p9', autorId: 'UE' }));
  await caso('privado: id diferente recusado', false, () => dono.doc('rt_memorias_privadas/UA/momentos/p3').set({ id: 'outro' }));

  // ---------- 9) Storage ----------
  const st = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
  const img = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  await env.withSecurityRulesDisabled(async ctx => { await ctx.storage().ref('memorias/t1/m_a/foto.png').put(img, { contentType: 'image/png' }); await ctx.storage().ref('memorias_privadas/UA/t1/p1/foto.png').put(img, { contentType: 'image/png' }); });
  await caso('storage: editor envia foto da viagem', true, () => st('UE').ref('memorias/t1/m_e/foto.png').put(img, { contentType: 'image/png' }));
  await caso('storage: leitor nao envia', false, () => st('UL').ref('memorias/t1/m_l/foto.png').put(img, { contentType: 'image/png' }));
  await caso('storage: leitor ve a foto da viagem', true, () => st('UL').ref('memorias/t1/m_a/foto.png').getDownloadURL());
  await caso('storage: externo nao ve', false, () => st('UX').ref('memorias/t1/m_a/foto.png').getDownloadURL());
  await caso('storage: familia nao ve', false, () => st(null).ref('memorias/t1/m_a/foto.png').getDownloadURL());
  await caso('storage: tipo que nao e midia recusado', false, () => st('UE').ref('memorias/t1/m_e/a.txt').put(Buffer.from('oi'), { contentType: 'text/plain' }));
  await caso('storage: acima de 50 MB recusado', false, () => st('UE').ref('memorias/t1/m_e/grande.mp4').put(Buffer.alloc(50 * 1024 * 1024 + 1), { contentType: 'video/mp4' }));
  await caso('storage: privado so o dono ve', true, () => st('UA').ref('memorias_privadas/UA/t1/p1/foto.png').getDownloadURL());
  await caso('storage: privado de outro, nao', false, () => st('UE').ref('memorias_privadas/UA/t1/p1/foto.png').getDownloadURL());
  await caso('storage: ninguem envia na area privada do outro', false, () => st('UE').ref('memorias_privadas/UA/t1/x/foto.png').put(img, { contentType: 'image/png' }));

  await env.cleanup();
  console.log('\n' + (total - falhas) + ' de ' + total + (falhas ? '\nTEM FALHA' : '\nTUDO CERTO'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
