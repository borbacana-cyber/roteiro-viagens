# Regras do Firebase do Azivo: como testar e publicar

## O que tem nesta pasta

- **`firestore.rules`**: as regras novas. O bloco das coleções antigas é uma cópia sem nenhuma mudança.
- **`storage.rules`**: as regras do Storage dos Momentos. Só são usadas a partir da fase 2.
- **`firestore.rules.atual`**: o conjunto de regras publicado hoje, como está documentado no estado do projeto. Para conferir contra o console, cole aqui o texto de Firestore > Regras e rode o `compararRegras.js`.
- **`compararRegras.js`**: confere três coisas:
  - cada coleção antiga continua com a mesma regra;
  - nenhuma regra nova cai sobre uma coleção antiga;
  - toda coleção que o app usa tem regra.

  Rode com `node compararRegras.js`.
- **`testeRegras.js`**: 100 casos no Emulator Suite, com o motor oficial de regras. Perfis cobertos: dono, editor, só leitura, externo, família (sem login), admin, privado e Storage.
- **`package.json`, `firebase.json`**: configuração do emulador.
- **`.github/workflows/regras.yml`**: roda os testes no GitHub a cada mudança nas regras.

## 1. Emulator Suite (prova principal)

**Opção A, pelo GitHub (sem instalar nada):**
1. Copie a pasta `regras/` para a raiz do repositório e o arquivo `.github/workflows/regras.yml` para `.github/workflows/`.
2. Faça o push.
3. Em **Actions > Regras do Firebase** aparece a lista PASSOU/FALHOU e, no fim, "N de N".

**Opção B, no computador** (precisa de Node 20 e Java 17 ou mais novo):

```
cd regras
npm install
npm test
```

## 2. Rules Playground (antes de publicar)

Caminho: Firebase Console > Firestore > Regras > botão **Rules Playground**.

1. Cole o conteúdo de `firestore.rules` no editor. **Não clique em Publicar.**
2. Rode cada linha da tabela abaixo.

O Playground usa os dados reais do banco quando a regra consulta outro documento. Por isso, só entram aqui casos que não dependem de dados de teste. Os demais estão no Emulator.

| # | Tipo | Caminho | Autenticado | Dados | Esperado |
|---|---|---|---|---|---|
| 1 | get | `rt_viagens/<id de uma viagem sua>` | não | | Permitido (igual a hoje) |
| 2 | create | `rt_viagens/teste-playground` | não | `{"a":1}` | Permitido (igual a hoje) |
| 3 | get | `rt_usuarios/<seu uid>` | sim, seu uid | | Permitido |
| 4 | get | `rt_usuarios/<seu uid>` | sim, uid `outro` | | Negado |
| 5 | get | `rt_config/global` | não | | Permitido |
| 6 | create | `rt_claims/viagem-que-nao-existe-123` | não | `{"segredo":"abcdefghijklmnopqrstuvwxyz0123","criadoEm":1}` | Permitido |
| 7 | create | `rt_claims/<id de uma viagem sua que já está na nuvem>` | sim, uid `outro` | mesmo do 6 | **Negado** (fim do "quem chega primeiro") |
| 8 | get | `rt_claims/viagem-que-nao-existe-123` | sim | | Negado |
| 9 | create | `rt_memorias/<id da viagem>` | sim, uid `outro` | `{"viagemId":"<id>","dono":"outro","membros":{"outro":{"papel":"dono","desde":1}}}` | **Negado** (sem claim) |
| 10 | create | `rt_memorias/<id da viagem>` | sim, **seu uid** (admin) | mesmo do 9, trocando `outro` pelo seu uid | Permitido (o admin define o dono de viagem antiga) |
| 11 | get | `rt_memorias/qualquer-id` | sim | | Permitido (o documento não existe) |
| 12 | get | `rt_memorias/qualquer-id/momentos/m1` | não | | Negado (família) |
| 13 | get | `rt_memorias_privadas/<seu uid>/momentos/p1` | sim, uid `outro` | | Negado |
| 14 | get | `qualquer/coisa` | sim | | Negado |

## 3. Publicar (só depois de 1 e 2)

1. **Primeiro as regras:** Firestore > Regras > cole `firestore.rules` > Publicar.
2. **Depois o `index.html`.** A ordem importa. Se o app novo subir antes das regras, uma viagem criada nesse intervalo perde o claim de criação, e depois só o admin consegue definir o dono dela.
3. **Storage** (para a fase 2): ative o Storage e publique `storage.rules`.
