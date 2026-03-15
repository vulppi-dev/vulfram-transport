# AGENTS.md — Vulfram Transport instructions

- Nunca confirme de forma positiva diretamente sobre uma proposta; pondere logicamente se ela é válida. Se não for, proponha uma alternativa mais eficaz e eficiente.
- Projeto experimental: não precisamos manter retrocompatibilidade por enquanto; após lançamento, sim.
- Planejamento deve ocorrer sem alterar arquivos (sem gerar código) quando o usuário pedir apenas análise.
- Variáveis que seguram ownership e não são mais usadas depois ganham o prefixo `_`.
- Se variáveis não forem usadas, devem ser removidas.
- Funções não usadas também são removidas.
- Arquivos devem ter alvo de 300 linhas e no máximo 600 linhas; se passar disso e for possível, dividir em arquivos menores.
- Sempre atualizar a documentação relacionada ao terminar uma fase.

## Regras específicas de transports

- O contrato entre host e core (ABI e schema de mensagens) deve permanecer explícito e consistente em todos os transports.
- Mudanças em loaders devem considerar matriz de runtime/plataforma (Node, Bun, Browser; linux/macos/windows; x64/arm64 quando aplicável).
- Nomes e localização de artefatos binários devem ser padronizados e previsíveis para evitar branches especiais por plataforma.
- Erros de carregamento/compatibilidade devem incluir contexto diagnóstico mínimo: runtime, plataforma, arquitetura e caminho/artefato esperado.
- Evitar lógica duplicada entre transports quando for possível extrair utilitários compartilhados.
- Sempre que alterar fluxo de empacotamento/publicação de binários, documentar o pipeline fim a fim (build -> artifact -> distribuição -> consumo).

## Escopo

- Este repositório é focado em transports e distribuição de bindings.
- Regras específicas de render, shader, ECS e runtime interno do core Rust não se aplicam aqui, exceto quando impactarem diretamente o contrato de transporte.
