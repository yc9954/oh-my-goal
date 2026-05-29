#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

// Ported from the OMX question engine in src/question/types.ts. Keep the
// canonical question/answer schema aligned with omx question rather than
// inventing a plugin-only prompt format.

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeOption(raw, index) {
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) throw new Error(`options[${index}] must be a non-empty string`);
    return { label, value: label };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`options[${index}] must be a string or object`);
  }
  const label = safeString(raw.label).trim();
  const value = safeString(raw.value).trim() || label;
  const description = safeString(raw.description).trim() || undefined;
  if (!label) throw new Error(`options[${index}].label must be a non-empty string`);
  if (!value) throw new Error(`options[${index}].value must be a non-empty string`);
  return { label, value, ...(description ? { description } : {}) };
}

function parseQuestionType(raw) {
  const normalized = safeString(raw).trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'multi-answerable' || normalized === 'multi-select') return 'multi-answerable';
  if (normalized === 'single-answerable' || normalized === 'single-select') return 'single-answerable';
  throw new Error('type must be one of: single-answerable, multi-answerable');
}

function getNormalizedQuestionType(input) {
  return input.type ?? (input.multi_select === true ? 'multi-answerable' : 'single-answerable');
}

function normalizeQuestionItem(raw, index, inheritedHeader) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`questions[${index}] must be a JSON object`);
  }
  const question = safeString(raw.question).trim();
  const header = safeString(raw.header).trim() || (index === 0 ? inheritedHeader : undefined);
  const other_label = safeString(raw.other_label).trim() || 'Other';
  const allow_other = raw.allow_other !== false;
  const rawMultiSelect = raw.multi_select;
  const parsedType = parseQuestionType(raw.type);
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const id = safeString(raw.id).trim() || `q-${index + 1}`;

  if (!question) throw new Error(`questions[${index}].question must be a non-empty string`);
  if (!id) throw new Error(`questions[${index}].id must be a non-empty string`);
  if (rawOptions.length === 0 && !allow_other) {
    throw new Error(`questions[${index}].options must be a non-empty array unless allow_other is true`);
  }
  if (parsedType === 'single-answerable' && rawMultiSelect === true) {
    throw new Error(`questions[${index}] type=single-answerable conflicts with multi_select=true`);
  }
  if (parsedType === 'multi-answerable' && rawMultiSelect === false) {
    throw new Error(`questions[${index}] type=multi-answerable conflicts with multi_select=false`);
  }

  const type = getNormalizedQuestionType({
    type: parsedType,
    multi_select: rawMultiSelect === true,
  });
  return {
    id,
    ...(header ? { header } : {}),
    question,
    options: rawOptions.map((option, optionIndex) => normalizeOption(option, optionIndex)),
    allow_other,
    other_label,
    multi_select: type === 'multi-answerable',
    type,
  };
}

function normalizeLegacyQuestion(raw, header) {
  return normalizeQuestionItem({ ...raw, id: safeString(raw.id).trim() || 'q-1', header }, 0, header);
}

export function normalizeQuestionInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('question input must be a JSON object');
  }

  const header = safeString(raw.header).trim() || undefined;
  const source = safeString(raw.source).trim() || undefined;
  const session_id = safeString(raw.session_id).trim() || undefined;
  const objective = safeString(raw.objective).trim() || undefined;
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : undefined;

  const questions = rawQuestions
    ? rawQuestions.map((item, index) => normalizeQuestionItem(item, index, header))
    : [normalizeLegacyQuestion(raw, header)];

  if (questions.length === 0) throw new Error('questions must be a non-empty array');
  const seenIds = new Set();
  for (const question of questions) {
    if (seenIds.has(question.id)) throw new Error(`questions id must be unique: ${question.id}`);
    seenIds.add(question.id);
  }

  const first = questions[0];
  return {
    ...(header ? { header } : {}),
    question: first.question,
    options: first.options,
    allow_other: first.allow_other,
    other_label: first.other_label,
    multi_select: first.multi_select,
    type: first.type,
    questions,
    ...(source ? { source } : {}),
    ...(session_id ? { session_id } : {}),
    ...(objective ? { objective } : {}),
  };
}

function option(label, value, description) {
  return { label, value, ...(description ? { description } : {}) };
}

const KO_QUESTIONS = {
  deliverableScope: '이번 목표의 산출물 또는 구현 범위는 어디까지로 볼까요?',
  audience: '주요 독자는 누구인가요?',
  sourceContext: '어떤 소스 맥락을 사용해야 하나요?',
  nonGoals: '명시적으로 범위에서 제외할 것은 무엇인가요?',
  verification: '결과는 무엇으로 검증해야 하나요?',
  handoffTarget: '최종 handoff는 무엇을 만들어야 하나요?',
  stack: '어떤 스택을 사용해야 하나요?',
  ux: '어떤 UX 방향을 기준으로 삼을까요?',
  acceptance: '무엇이 완료를 증명하나요?',
  outputMode: 'intake 이후에는 무엇을 해야 하나요?',
  workerLanes: '어떤 독립 evidence lane이 유용한가요?',
  localOptimum: 'local optimum 방지 압력은 어떻게 작동해야 하나요?',
  qualityFrontier: '경로를 고르기 전에 어떤 품질 개선 방향을 탐색할까요?',
  qualityPruning: '어떤 품질 방향을 pruning 후 실행 전략에 남길까요?',
  pruningRule: '품질 후보를 어떤 기준으로 pruning할까요?',
  edgeCases: '반드시 포함해야 할 edge case나 보조 동작은 무엇인가요?',
  dataPersistence: 'history, memory, settings는 어떻게 보존해야 하나요?',
  visualPolishLevel: '어떤 visual 목표로 polish 범위를 제한할까요?',
  verificationCommand: 'leader가 사용할 구체적인 검증 경로는 무엇인가요?',
  dependencyPolicy: '구현을 제한할 dependency 정책은 무엇인가요?',
  prdDecision: '이 PRD가 어떤 결정을 가능하게 해야 하나요?',
  releaseHorizon: '어떤 planning horizon을 대상으로 하나요?',
};

const KO_OPTIONS = {
  'next-version-prd': ['다음 버전 PRD', '다음 제품/버전 방향을 계획합니다.'],
  'current-product-prd': ['현재 제품 PRD', '현재 제품 상태를 문서화합니다.'],
  'single-feature-prd': ['단일 기능 PRD', '하나의 기능이나 workflow에 집중합니다.'],
  'builder-pm': ['빌더 또는 PM', '구현 가능한 제품 언어를 사용합니다.'],
  stakeholder: ['이해관계자', '의사결정과 범위 중심 언어를 사용합니다.'],
  'codex-goal-executor': ['Codex goal 실행자', '후속 Codex goal에 바로 넣기 좋게 최적화합니다.'],
  'repo-plus-user-answers': ['repo와 사용자 답변', 'repo 파일을 확인하고 intake 답변과 결합합니다.'],
  'user-answers-only': ['사용자 답변만', 'repo 구조에서 추론하지 않습니다.'],
  'repo-plus-external-research': ['repo와 외부 리서치', '필요하면 웹/리서치 소스를 사용합니다.'],
  'no-implementation-yet': ['아직 구현하지 않음', '계획 artifact만 만듭니다.'],
  'no-broad-refactor': ['큰 refactor 제외', '관련 없는 구조 정리를 피합니다.'],
  'no-new-dependencies': ['새 dependency 제외', '기존 stack을 유지합니다.'],
  'markdown-inspection': ['Markdown 검토', '생성된 artifact를 직접 검토합니다.'],
  'repo-checks': ['repo check', '적용 가능한 가벼운 repository command를 실행합니다.'],
  'stakeholder-review': ['이해관계자 리뷰', '리뷰 피드백을 validation gate로 봅니다.'],
  'goal-prompt-plus-prd-harness': ['goal prompt와 PRD harness', '계획 문서와 goal-ready prompt를 함께 만듭니다.'],
  'prd-only': ['PRD만', 'PRD/spec artifact에서 멈춥니다.'],
  'implementation-after-approval': ['승인 후 구현', '승인 후 coding으로 넘어갈 수 있게 준비합니다.'],
  'polished-single-screen': ['완성도 있는 단일 화면 구현', '작은 web app이나 빈 폴더에 권장합니다.'],
  'minimal-working': ['최소 동작 구현', 'polish보다 동작을 우선합니다.'],
  'full-featured': ['기능이 풍부한 구현', '더 많은 상태와 보조 기능을 포함합니다.'],
  'static-html-css-js': ['정적 HTML/CSS/JS', '빈 폴더의 가장 좋은 기본값입니다.'],
  'react-vite': ['React/Vite', '현대적인 app scaffold를 사용합니다.'],
  'match-existing-repo-stack': ['기존 repo stack에 맞춤', '현재 project convention을 따릅니다.'],
  'clean-app-ui': ['깔끔한 app UI', '단순하고 완성도 있는 task-focused UI입니다.'],
  'platform-inspired-ui': ['플랫폼 스타일 UI', '익숙한 OS/app 스타일에 가깝게 만듭니다.'],
  'domain-specific-ui': ['도메인 특화 UI', '제품 도메인에 맞는 visual styling을 사용합니다.'],
  'mouse-keyboard-core-edge-cases': ['마우스+키보드와 핵심 edge case', '계산기 같은 tool에 권장합니다.'],
  'basic-click-only': ['기본 click-only 동작', '가장 작은 유용한 동작입니다.'],
  'history-memory-settings': ['history, memory, settings 포함', '더 풍부한 app behavior를 포함합니다.'],
  'browser-check-plus-lightweight-tests': ['브라우저 확인과 가벼운 테스트', '가능할 때 가장 균형 잡힌 검증입니다.'],
  'browser-check-only': ['브라우저 확인만', '수동 UI validation입니다.'],
  'tests-only': ['테스트만', '자동화 검증에 집중합니다.'],
  'harness-and-implement-after-approval': ['harness 생성 후 승인받고 구현', 'harness를 만든 뒤 승인되면 진행합니다.'],
  'harness-only': ['harness만 생성', 'goal-ready artifact에서 멈춥니다.'],
  'spec-first': ['spec 또는 PRD 먼저', 'coding 전에 요구사항을 명확히 합니다.'],
  'no-backend-auth-persistence': ['backend/auth/persistence 제외', '첫 pass는 frontend-only로 유지합니다.'],
  'no-extra-styling': ['기능 layout 외 styling 제외', 'visual을 기본 수준으로 유지합니다.'],
  'harness-plus-goal-prompt': ['repo-local harness와 goal prompt', 'Markdown artifact와 권장 Codex goal을 만듭니다.'],
  'goal-prompt-only': ['goal prompt만', 'create_goal에 넣을 prompt만 반환합니다.'],
  'implemented-code-plus-tests': ['구현 코드와 테스트', 'intake 후 구현 방향으로 진행합니다.'],
  'no-implementation-until-approval': ['승인 전 구현 금지', 'goal prompt 승인 전에는 code를 쓰지 않습니다.'],
  'no-broad-repo-refactor': ['큰 repo refactor 제외', '관련 없는 cleanup을 피합니다.'],
  'markdown-plus-lightweight-checks': ['Markdown 검토와 가벼운 check', 'artifact 검토와 작은 repo check를 사용합니다.'],
  'full-test-suite': ['전체 test suite', 'project test를 gate로 사용합니다.'],
  'manual-review-only': ['수동 리뷰만', '요청 없이는 command를 실행하지 않습니다.'],
  architect: ['Architect', 'Architecture와 boundary를 검토합니다.'],
  critic: ['Critic', '가정과 완료 주장을 공격합니다.'],
  tester: ['Tester', '검증 probe와 gap을 찾습니다.'],
  'baseline-novelty-critic': ['baseline + novelty + critic', 'commit 전에 대안을 비교합니다.'],
  'critic-review-only': ['critic review만', '더 가벼운 pressure pass입니다.'],
  'skip-local-optimum-pressure': ['local-optimum pressure 생략', 'task가 정말 trivial할 때만 사용합니다.'],
  'decision-clarity': ['의사결정 명확성', 'artifact가 구체적인 제품/구현 결정을 돕게 합니다.'],
  'execution-readiness': ['실행 준비도', '빌더나 Codex goal 실행자가 바로 쓸 수 있게 합니다.'],
  'risk-dependency-mapping': ['risk와 dependency mapping', 'blocker, unknown, sequencing risk를 먼저 드러냅니다.'],
  'stakeholder-alignment': ['이해관계자 alignment', 'tradeoff와 non-goal을 리뷰하기 쉽게 합니다.'],
  'user-workflow-polish': ['사용자 workflow polish', '실제 task flow, layout, interaction feel을 개선합니다.'],
  'reliability-edge-cases': ['신뢰성과 edge case', 'invalid input, error state, failure path를 다룹니다.'],
  'maintainable-simple-structure': ['유지보수 쉬운 단순 구조', '과한 abstraction 없이 변경하기 쉽게 만듭니다.'],
  'verification-depth': ['검증 깊이', 'happy path뿐 아니라 false completion을 잡는 check를 추가합니다.'],
  'extensibility-without-scope-creep': ['scope creep 없는 확장성', '관련 없는 feature 없이 extension point를 남깁니다.'],
  'outcome-quality': ['결과 품질', '최종 artifact나 구현의 유용성을 높입니다.'],
  'risk-reduction': ['risk 감소', '숨은 가정, blocker, false completion을 줄입니다.'],
  maintainability: ['유지보수성', '검토하고 발전시키기 쉬운 결과를 우선합니다.'],
  'verification-strength': ['검증 강도', '약한 경로를 반증할 수 있는 evidence를 선호합니다.'],
  'user-visible-value-first': ['사용자가 체감하는 가치 우선', '사용자 outcome을 분명히 개선하는 항목을 남깁니다.'],
  'verification-reliability-first': ['검증과 신뢰성 우선', 'false completion risk를 줄이는 항목을 남깁니다.'],
  'simple-maintainable-core-first': ['단순하고 유지보수 쉬운 core 우선', 'scope를 키우지 않으면서 품질을 높입니다.'],
  'novel-alternative-lane': ['새로운 대안 lane', '비교를 위해 구조적으로 다른 경로 하나를 남깁니다.'],
  'maximize-quality-within-scope': ['현재 scope 안에서 유용한 품질 최대화', 'goal을 확장하지 않고 품질을 높입니다.'],
  'minimize-false-completion-risk': ['false completion risk 최소화', '더 강한 evidence를 만드는 후보를 우선합니다.'],
  'best-quality-per-cost': ['구현 비용 대비 품질 최대화', 'leverage가 높은 개선을 남기고 비싼 polish는 자릅니다.'],
  'numeric-edge-cases': ['소수, 음수, 연속 연산', '계산기류 도구에 중요합니다.'],
  'responsive-keyboard-accessibility': ['반응형 layout과 키보드 접근성', 'web app에 중요합니다.'],
  'invalid-input-states': ['잘못된 입력의 명확한 error state', '조용히 틀린 동작이 나오는 것을 막습니다.'],
  'no-refresh-persistence': ['새로고침 후 보존하지 않음', '상태를 memory에만 둡니다.'],
  'local-browser-persistence': ['브라우저 local 저장', 'localStorage 등 browser-local storage를 사용합니다.'],
  'session-only-persistence': ['session 동안만 보존', 'tab/session이 열려 있는 동안만 유지합니다.'],
  'compact-mobile-app': ['compact mobile-app 느낌', 'touch-friendly layout을 우선합니다.'],
  'desktop-web-tool': ['desktop web tool 느낌', 'keyboard와 workspace ergonomics를 우선합니다.'],
  'distinct-branded-theme': ['뚜렷한 branded theme', '더 강한 custom visual identity를 사용합니다.'],
  'browser-core-flow-check': ['브라우저에서 core flow 확인', '단순 정적 web app에 적합합니다.'],
  'lightweight-smoke-test': ['가벼운 automated smoke test 추가 및 실행', '동작을 싸게 검증할 수 있을 때 사용합니다.'],
  'project-test-command': ['기존 project test command 사용', 'repo의 기존 check에 맞춥니다.'],
  'dev-dependencies-for-tests-only': ['test용 dev dependency만 허용', 'runtime dependency 표면을 안정적으로 유지합니다.'],
  'allow-small-framework-scaffold': ['작은 framework scaffold 허용', '속도와 구조가 더 중요할 때 사용합니다.'],
  'scope-acceptance-alignment': ['scope와 acceptance alignment', '무엇을 만들지 명확히 합니다.'],
  'roadmap-version-planning': ['roadmap 또는 version planning', '순서와 milestone을 명확히 합니다.'],
  'implementation-handoff': ['implementation handoff', '빌더나 Codex goal 실행을 위한 task로 이어지게 합니다.'],
  'immediate-next-iteration': ['바로 다음 iteration', '가까운 실행을 기준으로 최적화합니다.'],
  'next-product-version': ['다음 product version', '더 큰 coherent release를 계획합니다.'],
  'long-term-direction': ['장기 product direction', '전략과 제약을 더 강조합니다.'],
  'inspect-generated-artifacts': ['생성된 artifact 검토', '직접 file review를 사용합니다.'],
  'run-lightweight-repo-checks': ['가벼운 repo check 실행', '사용 가능한 command를 사용합니다.'],
  'run-full-project-validation': ['전체 project validation 실행', '가장 강한 available gate를 사용합니다.'],
};

export function detectLocale(objective, override) {
  const requested = safeString(override).trim().toLowerCase();
  if (requested === 'ko' || requested === 'en') return requested;
  return /[가-힣]/.test(objective) ? 'ko' : 'en';
}

export function localizeQuestionForLocale(question, locale) {
  if (locale !== 'ko') return question;
  return {
    ...question,
    question: KO_QUESTIONS[question.id] || question.question,
    other_label: '직접 입력',
    options: question.options.map((item) => {
      const translated = KO_OPTIONS[item.value];
      if (!translated) return item;
      const [label, description] = translated;
      return { ...item, label, ...(description ? { description } : {}) };
    }),
  };
}

export function localizeQuestionInput(input, locale) {
  if (locale !== 'ko') return { ...input, locale: 'en' };
  const questions = input.questions.map((question, index) => ({
    ...localizeQuestionForLocale(question, locale),
    ...(index === 0 || question.header ? { header: 'Oh My Goal 인테이크' } : {}),
  }));
  const first = questions[0];
  return {
    ...input,
    locale: 'ko',
    header: 'Oh My Goal 인테이크',
    question: first.question,
    options: first.options,
    other_label: first.other_label,
    questions,
  };
}

function qualityQuestions(kind) {
  const planning = kind === 'planning';
  const implementation = kind === 'implementation';
  const frontierOptions = planning
    ? [
        option('Decision clarity', 'decision-clarity', 'Make the artifact help a concrete product or build decision.'),
        option('Execution readiness', 'execution-readiness', 'Make the artifact directly usable by builders or Codex goal execution.'),
        option('Risk and dependency mapping', 'risk-dependency-mapping', 'Surface blockers, unknowns, and sequencing risks early.'),
        option('Stakeholder alignment', 'stakeholder-alignment', 'Make tradeoffs and non-goals easy to review.'),
      ]
    : implementation
      ? [
          option('User workflow polish', 'user-workflow-polish', 'Improve the actual task flow, layout, and interaction feel.'),
          option('Reliability and edge cases', 'reliability-edge-cases', 'Handle invalid input, error states, and failure paths.'),
          option('Maintainable simple structure', 'maintainable-simple-structure', 'Keep code easy to change without over-abstracting.'),
          option('Verification depth', 'verification-depth', 'Add checks that catch false completion, not only happy-path output.'),
          option('Extensibility without scope creep', 'extensibility-without-scope-creep', 'Leave clear extension points without adding unrelated features.'),
        ]
      : [
          option('Outcome quality', 'outcome-quality', 'Improve the usefulness of the final artifact or implementation.'),
          option('Risk reduction', 'risk-reduction', 'Reduce hidden assumptions, blockers, and false completion.'),
          option('Maintainability', 'maintainability', 'Prefer a result that remains easy to inspect and evolve.'),
          option('Verification strength', 'verification-strength', 'Prefer evidence that can disprove weak paths.'),
        ];

  return [
    {
      id: 'qualityFrontier',
      question: 'Which quality-improvement directions should be explored before choosing a path?',
      type: 'multi-answerable',
      allow_other: true,
      options: frontierOptions,
    },
    {
      id: 'qualityPruning',
      question: 'Which quality directions should survive pruning into the execution strategy?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('User-visible value first', 'user-visible-value-first', 'Keep improvements that noticeably improve the user outcome.'),
        option('Verification and reliability first', 'verification-reliability-first', 'Keep improvements that reduce false completion risk.'),
        option('Simple maintainable core first', 'simple-maintainable-core-first', 'Keep improvements that improve quality without bloating scope.'),
        option('Novel alternative lane', 'novel-alternative-lane', 'Keep one structurally different path for comparison.'),
      ],
    },
    {
      id: 'pruningRule',
      question: 'What rule should prune quality candidates?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Maximize useful quality within current scope', 'maximize-quality-within-scope', 'Improve quality without expanding the goal.'),
        option('Minimize false-completion risk', 'minimize-false-completion-risk', 'Prefer candidates that create stronger evidence.'),
        option('Best quality per implementation cost', 'best-quality-per-cost', 'Prefer high leverage improvements and reject expensive polish.'),
      ],
    },
  ];
}

function planningQuestions() {
  return [
    {
      id: 'deliverableScope',
      question: 'Which deliverable scope should this target?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Next-version PRD', 'next-version-prd', 'Plan the next product/version direction.'),
        option('Current-product PRD', 'current-product-prd', 'Document the product as it exists now.'),
        option('Single-feature PRD', 'single-feature-prd', 'Focus on one feature or workflow.'),
      ],
    },
    {
      id: 'audience',
      question: 'Who is the primary reader?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Builder or PM', 'builder-pm', 'Use implementation-ready product language.'),
        option('Stakeholder', 'stakeholder', 'Use decision and scope language.'),
        option('Codex goal executor', 'codex-goal-executor', 'Optimize for a follow-up Codex goal.'),
      ],
    },
    {
      id: 'sourceContext',
      question: 'What source context should be used?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Repo plus user answers', 'repo-plus-user-answers', 'Inspect repo files and combine them with this intake.'),
        option('User answers only', 'user-answers-only', 'Avoid inferring from repo structure.'),
        option('Repo plus external research', 'repo-plus-external-research', 'Use web/research sources where needed.'),
      ],
    },
    {
      id: 'nonGoals',
      question: 'Which non-goals must stay out of scope?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('No implementation yet', 'no-implementation-yet', 'Produce planning artifacts only.'),
        option('No broad refactor', 'no-broad-refactor', 'Avoid unrelated architecture cleanup.'),
        option('No new dependencies', 'no-new-dependencies', 'Keep the existing stack unchanged.'),
      ],
    },
    {
      id: 'verification',
      question: 'What should verify the result?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Markdown inspection', 'markdown-inspection', 'Review generated artifacts directly.'),
        option('Repo checks', 'repo-checks', 'Run lightweight repository commands where applicable.'),
        option('Stakeholder review', 'stakeholder-review', 'Treat review feedback as the validation gate.'),
      ],
    },
    {
      id: 'handoffTarget',
      question: 'What should the handoff produce?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Goal prompt plus PRD harness', 'goal-prompt-plus-prd-harness', 'Create both planning docs and a goal-ready prompt.'),
        option('PRD only', 'prd-only', 'Stop at the PRD/spec artifact.'),
        option('Implementation after approval', 'implementation-after-approval', 'Prepare for coding after you approve the plan.'),
      ],
    },
    ...qualityQuestions('planning'),
  ];
}

function implementationQuestions() {
  return [
    {
      id: 'deliverableScope',
      question: 'Which implementation scope should this target?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Polished single-screen implementation', 'polished-single-screen', 'Recommended for small web apps and empty folders.'),
        option('Minimal working implementation', 'minimal-working', 'Prioritize behavior over polish.'),
        option('Full-featured implementation', 'full-featured', 'Include richer states and secondary features.'),
      ],
    },
    {
      id: 'stack',
      question: 'Which stack should be used?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Static HTML/CSS/JS', 'static-html-css-js', 'Best default for empty folders.'),
        option('React/Vite', 'react-vite', 'Use a modern app scaffold.'),
        option('Match existing repo stack', 'match-existing-repo-stack', 'Follow current project conventions.'),
      ],
    },
    {
      id: 'ux',
      question: 'Which UX direction should guide the result?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Clean app UI', 'clean-app-ui', 'Simple, polished, and task-focused.'),
        option('Platform-inspired UI', 'platform-inspired-ui', 'Lean toward a familiar OS/app style.'),
        option('Domain-specific UI', 'domain-specific-ui', 'Use visual styling tailored to the product domain.'),
      ],
    },
    {
      id: 'acceptance',
      question: 'What functionality proves the implementation is complete?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Mouse plus keyboard and core edge cases', 'mouse-keyboard-core-edge-cases', 'Recommended for calculator-like tools.'),
        option('Basic click-only behavior', 'basic-click-only', 'Smallest useful behavior.'),
        option('History, memory, or settings included', 'history-memory-settings', 'Include richer app behavior.'),
      ],
    },
    {
      id: 'verification',
      question: 'What should verify the implementation?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Browser check plus lightweight tests', 'browser-check-plus-lightweight-tests', 'Best balance when practical.'),
        option('Browser check only', 'browser-check-only', 'Manual UI validation.'),
        option('Tests only', 'tests-only', 'Automated verification focus.'),
      ],
    },
    {
      id: 'outputMode',
      question: 'What should happen after intake?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Create harness and implement after approval', 'harness-and-implement-after-approval', 'Generate the harness, then proceed if approved.'),
        option('Create harness only', 'harness-only', 'Stop after goal-ready artifacts.'),
        option('Write spec or PRD first', 'spec-first', 'Clarify requirements before coding.'),
      ],
    },
    {
      id: 'nonGoals',
      question: 'What should stay out of scope?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('No backend, auth, or persistence', 'no-backend-auth-persistence', 'Keep the first pass frontend-only.'),
        option('No new dependencies', 'no-new-dependencies', 'Use plain platform APIs or existing packages.'),
        option('No styling beyond functional layout', 'no-extra-styling', 'Keep visuals basic.'),
      ],
    },
    ...qualityQuestions('implementation'),
  ];
}

function genericQuestions() {
  return [
    {
      id: 'acceptance',
      question: 'What concrete output proves this is complete?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Repo-local harness plus goal prompt', 'harness-plus-goal-prompt', 'Create Markdown artifacts and a recommended Codex goal.'),
        option('Goal prompt only', 'goal-prompt-only', 'Return only the create_goal-ready prompt.'),
        option('Implemented code plus tests', 'implemented-code-plus-tests', 'Proceed toward implementation after intake.'),
      ],
    },
    {
      id: 'nonGoals',
      question: 'Which non-goals must stay out of scope?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('No implementation until approval', 'no-implementation-until-approval', 'Do not code before goal prompt approval.'),
        option('No broad repo refactor', 'no-broad-refactor', 'Avoid unrelated cleanup.'),
        option('No new dependencies', 'no-new-dependencies', 'Avoid adding packages.'),
      ],
    },
    {
      id: 'verification',
      question: 'What should verify the result?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Markdown inspection plus lightweight checks', 'markdown-plus-lightweight-checks', 'Inspect artifacts and run small repo checks.'),
        option('Full test suite', 'full-test-suite', 'Use project tests as the gate.'),
        option('Manual review only', 'manual-review-only', 'No commands unless requested.'),
      ],
    },
    {
      id: 'workerLanes',
      question: 'Which independent evidence lanes are useful?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('Architect', 'architect', 'Architecture and boundaries.'),
        option('Critic', 'critic', 'Challenge assumptions and completion.'),
        option('Tester', 'tester', 'Verification probes and gaps.'),
      ],
    },
    {
      id: 'localOptimum',
      question: 'How should local-optimum pressure work?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Baseline plus novelty plus critic', 'baseline-novelty-critic', 'Compare alternatives before commitment.'),
        option('Critic review only', 'critic-review-only', 'A lighter pressure pass.'),
        option('Skip local-optimum pressure', 'skip-local-optimum-pressure', 'Only when the task is trivial.'),
      ],
    },
    ...qualityQuestions('generic'),
  ];
}

function classifyObjective(objective) {
  const text = objective.toLowerCase();
  if (/(prd|product requirements|requirements|요구사항|기획|스펙|spec)/i.test(text)) return 'planning';
  if (/(app|website|web\s*site|frontend|ui|page|tool|calculator|build|implement|make|create|앱|웹|웹사이트|사이트|페이지|도구|계산기|만들|구현)/i.test(text)) return 'implementation';
  return 'generic';
}

export function intakeQuestionsForObjective(objective) {
  const intent = classifyObjective(objective);
  if (intent === 'planning') return planningQuestions();
  if (intent === 'implementation') return implementationQuestions();
  return genericQuestions();
}

export function buildIntakeQuestionInput(objective, options = {}) {
  const normalizedObjective = safeString(objective).trim();
  if (!normalizedObjective) throw new Error('Missing objective.');
  const locale = detectLocale(normalizedObjective, options.locale);
  return localizeQuestionInput(normalizeQuestionInput({
    header: options.header || 'Oh My Goal Intake',
    source: options.source || 'oh-my-goal',
    objective: normalizedObjective,
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    questions: intakeQuestionsForObjective(normalizedObjective),
  }), locale);
}

function alphaLabel(index) {
  return String.fromCharCode(65 + index);
}

export function renderQuestionInputMarkdown(input) {
  if (input.locale === 'ko') return renderQuestionInputMarkdownKo(input);
  const lines = [
    'Before I create harness files or implementation files, answer these in one reply.',
    '',
    'OMX question schema fallback:',
    `- source: ${input.source || 'oh-my-goal'}`,
    '- contract: `questions[]` with `single-answerable` / `multi-answerable`; reply with selected option keys.',
    '- answer shape: `answers[] -> { question_id, answer: { selected_values: [...] } }`.',
    '',
    'questions[]:',
  ];
  for (const [questionIndex, question] of input.questions.entries()) {
    lines.push(
      `${questionIndex + 1}. [${question.type}] id=${question.id} multi_select=${question.multi_select ? 'true' : 'false'}`,
      `   question: ${question.question}`,
    );
    for (const [optionIndex, item] of question.options.entries()) {
      const description = item.description ? ` - ${item.description}` : '';
      lines.push(`   ${alphaLabel(optionIndex)}) label="${item.label}" value="${item.value}"${description}`);
    }
    if (question.allow_other) {
      lines.push(`   ${alphaLabel(question.options.length)}) other_label="${question.other_label}" value="<free text>"`);
    }
  }
  const example = input.questions.map((_, index) => `${index + 1}A`).join(' ');
  const multi = input.questions.find((question, index) => question.multi_select && index > 0);
  const multiExample = multi ? `; multi-select example: ${input.questions.indexOf(multi) + 1}A,B` : '';
  lines.push('', `Reply with OMX selections, for example: ${example}${multiExample}.`);
  return lines.join('\n');
}

function renderQuestionInputMarkdownKo(input) {
  const lines = [
    '하네스 파일이나 구현 파일을 만들기 전에 아래 질문에 답해주세요.',
    '',
    'OMX question schema fallback:',
    `- source: ${input.source || 'oh-my-goal'}`,
    '- contract: `questions[]` with `single-answerable` / `multi-answerable`; 선택지는 option key로 답합니다.',
    '- answer shape: `answers[] -> { question_id, answer: { selected_values: [...] } }`.',
    '',
    'questions[]:',
  ];
  for (const [questionIndex, question] of input.questions.entries()) {
    lines.push(
      `${questionIndex + 1}. [${question.type}] id=${question.id} multi_select=${question.multi_select ? 'true' : 'false'}`,
      `   질문: ${question.question}`,
    );
    for (const [optionIndex, item] of question.options.entries()) {
      const description = item.description ? ` - ${item.description}` : '';
      lines.push(`   ${alphaLabel(optionIndex)}) label="${item.label}" value="${item.value}"${description}`);
    }
    if (question.allow_other) {
      lines.push(`   ${alphaLabel(question.options.length)}) other_label="${question.other_label}" value="<free text>"`);
    }
  }
  const example = input.questions.map((_, index) => `${index + 1}A`).join(' ');
  const multi = input.questions.find((question, index) => question.multi_select && index > 0);
  const multiExample = multi ? `; multi-select 예시: ${input.questions.indexOf(multi) + 1}A,B` : '';
  lines.push('', `OMX selection 형식으로 답해주세요. 예: ${example}${multiExample}.`);
  return lines.join('\n');
}

function shellSingleQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const parsed = { format: 'markdown', source: 'oh-my-goal' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--objective') {
      parsed.objective = argv[++index];
      continue;
    }
    if (arg.startsWith('--objective=')) {
      parsed.objective = arg.slice('--objective='.length);
      continue;
    }
    if (arg === '--format') {
      parsed.format = argv[++index];
      continue;
    }
    if (arg.startsWith('--format=')) {
      parsed.format = arg.slice('--format='.length);
      continue;
    }
    if (arg === '--source') {
      parsed.source = argv[++index];
      continue;
    }
    if (arg === '--session-id') {
      parsed.sessionId = argv[++index];
      continue;
    }
    if (arg === '--locale') {
      parsed.locale = argv[++index];
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    parsed.objective = [parsed.objective, arg].filter(Boolean).join(' ');
  }
  return parsed;
}

function printHelp() {
  console.log(`oh-my-goal intake-question-engine

Usage:
  node scripts/intake-question-engine.mjs --objective "<objective>" [--format markdown|payload|omx-command] [--locale ko|en]

Formats:
  markdown     Last-resort numbered prose fallback for non-structured surfaces.
  payload      Canonical OMX question JSON payload with questions[].
  omx-command  Shell command that passes the payload to omx question --input.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const input = buildIntakeQuestionInput(args.objective, {
    source: args.source,
    sessionId: args.sessionId,
    locale: args.locale,
  });
  if (args.format === 'payload' || args.format === 'json') {
    console.log(JSON.stringify(input, null, 2));
    return;
  }
  if (args.format === 'omx-command') {
    console.log(`omx question --input ${shellSingleQuote(JSON.stringify(input))} --json`);
    return;
  }
  if (args.format === 'markdown') {
    console.log(renderQuestionInputMarkdown(input));
    return;
  }
  throw new Error(`Unknown --format: ${args.format}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(`[oh-my-goal intake-question-engine] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
