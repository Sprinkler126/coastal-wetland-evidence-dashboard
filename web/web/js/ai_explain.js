/* Day 7 deterministic AI explanation adapter. */
const AI_FORBIDDEN_PATTERNS = [
    /预测未来/, /future\s+(?:risk|probability|outcome)/i,
    /自动(?:审批|执法|判定|决定|执行|处理)/, /automatic(?:ally)?\s+(?:approve|enforce|decide|process)/i,
    /因果影响/, /将导致/, /生态机制已被证明/, /caused by/i, /proves?\s+(?:that\s+)?restoration/i,
];
const AI_CAUSAL_REQUEST_PATTERNS = [
    /导致/, /因果/, /造成/, /引起/, /证明(?:了)?(?:生态)?机制/, /归因(?:于)?/, /cau(?:se|ses|sed|sal|sation)/i,
    /\b(?:lead(?:s|ing)?\s+to|result(?:s|ing)?\s+in|prove(?:s|d)?\s+(?:a\s+)?(?:causal|ecological)\s+(?:effect|mechanism))\b/i,
];
const AI_FUTURE_REQUEST_PATTERNS = [
    /未来/, /将来/, /预测/, /预报/, /风险概率/, /明年/, /下(?:一|个)(?:年|月|季度)/,
    /\b(?:future|forecast(?:ing)?|predict(?:ion|ive|ed|s)?|project(?:ion|ed|s)?|risk\s+probability|next\s+(?:year|month|quarter)|in\s+\d+\s+(?:years?|months?|quarters?))\b/i,
    /\bwill\b.*\b(?:risk|change|increase|decrease|succeed|success|restoration)\b/i,
];
const AI_AUTOMATED_DECISION_REQUEST_PATTERNS = [
    /自动(?:审批|执法|判定|决定|执行|处理)/, /无需人工(?:审核|复核)/, /机器(?:审批|执法|判定|决定)/,
    /\b(?:automatic(?:ally)?|autonomous)\s+(?:approval|approve|enforcement|enforce|decision|decide|processing|process)\b/i,
    /\b(?:approve|enforce|decide|process)\s+(?:this\s+)?automatically\b/i,
];
const AI_RESTORATION_SUCCESS_REQUEST_PATTERNS = [
    /(?:修复|恢复)(?:是否|能否|已经|算不算|成功|成效)/, /(?:修复|恢复)(?:成功|成效)/, /面积增长.*(?:修复|恢复)/,
    /\b(?:restoration|restored)\s+(?:success|successful|succeed(?:ed|ing)?)\b/i,
    /\b(?:does|is|are|whether).*(?:increase|growth|area).*(?:mean|prove|show).*(?:restoration|restored)\b/i,
];

const aiState = { audienceMode: 'public', cluster: 'BYS', compareCluster: null, wetland: 'Tidal_Flat', unit: null, question: '' };

function aiInterpolate(text, values = {}) {
    return String(text).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

function aiIsChineseLocale() {
    return /^zh(?:-|_)/i.test(getLocale());
}

function aiText(key, english, chinese, values = {}) {
    const translated = t(key, values);
    const fallback = aiIsChineseLocale() ? chinese : english;
    return aiInterpolate(translated && translated !== key ? translated : fallback, values);
}

function aiLabel(namespace, code, english, chinese) {
    const translated = label(namespace, code);
    if (translated && translated !== code) return translated;
    return aiIsChineseLocale() ? chinese : english;
}

function aiClusterLabel(code) {
    const fallbacks = {
        BBG: ['Beibu Gulf', '北部湾'], BYS: ['Bohai Sea', '环渤海'], HX: ['West Coast of Taiwan Strait', '海峡西岸'],
        PRD: ['Pearl River Delta', '珠三角'], YRD: ['Yangtze River Delta', '长三角'],
    };
    const fallback = fallbacks[code] || [code, code];
    return aiLabel('cluster', code, fallback[0], fallback[1]);
}

function aiWetlandLabel(code) {
    const fallbacks = {
        Mangrove: ['Mangrove', '红树林'], Tidal_Flat: ['Tidal Flat', '潮滩'], Salt_Marsh: ['Salt Marsh', '盐沼'], Marsh: ['Marsh', '沼泽'],
    };
    const fallback = fallbacks[code] || [code, code];
    return aiLabel('wetland', code, fallback[0], fallback[1]);
}

function aiEvidenceTypeLabel(code) {
    const labels = {
        FACT: ['Fact', '事实'], ASSOCIATION: ['Statistical association', '统计关联'], EXPLORATORY: ['Exploratory', '探索性'],
        INSUFFICIENT: ['Insufficient evidence', '证据不足'], MODEL_ATTRIBUTION: ['Model attribution', '模型归因'],
    };
    const fallback = labels[code] || [code, code];
    return aiText(`evidenceType.${code}`, fallback[0], fallback[1]);
}

function aiAudienceLabel(mode) {
    const labels = {
        public: ['Public', '公众版'], ngo_internal: ['NGO internal', 'NGO 内部版'], funder: ['Funder', '资助方版'],
    };
    const fallback = labels[mode] || [mode, mode];
    return aiText(`audience.${mode}`, fallback[0], fallback[1]);
}

function aiSectionLabel(key) {
    const labels = {
        data_facts: ['Data facts', '数据事实'], model_or_statistical_notes: ['Statistical/model notes', '统计/模型提示'],
        cannot_conclude: ['What the evidence cannot conclude', '不能推出'], recommended_checks: ['Recommended checks', '建议补充核查'],
        human_review_note: ['Human-review statement', '人工审核声明'], citations: ['Citations', '引用'],
    };
    const fallback = labels[key] || [key, key];
    return aiText(key === 'citations' ? 'ai.citations' : `ai.section.${key}`, fallback[0], fallback[1]);
}

function aiAnswerStatusLabel(status) {
    const labels = {
        answered: ['Answered', '已生成'], needs_review: ['Needs review', '需要复核'], out_of_scope: ['Outside evidence scope', '超出证据边界'],
    };
    const fallback = labels[status] || [status, status];
    return aiText(`answerStatus.${status}`, fallback[0], fallback[1]);
}

function aiEscape(value) {
    return escapeHtml(String(value ?? ''));
}

function aiQuestionGuardrails(question) {
    const text = String(question || '');
    return {
        future: AI_FUTURE_REQUEST_PATTERNS.some(pattern => pattern.test(text)),
        causal: AI_CAUSAL_REQUEST_PATTERNS.some(pattern => pattern.test(text)),
        automatedDecision: AI_AUTOMATED_DECISION_REQUEST_PATTERNS.some(pattern => pattern.test(text)),
        restorationSuccess: AI_RESTORATION_SUCCESS_REQUEST_PATTERNS.some(pattern => pattern.test(text)),
    };
}

function aiQuestionIntent(question) {
    const text = String(question || '').trim();
    const lower = text.toLowerCase();
    const templates = getAiQuestionTemplates();
    const exactTemplate = templates.find(item => String(item.text || '').trim() === text);
    if (exactTemplate) return exactTemplate.intent;
    if (Object.values(aiQuestionGuardrails(text)).some(Boolean)) return 'out_of_scope';
    if (/(?:比较|对照)|\bcompare|comparison\b/i.test(text)) return 'compare_regions';
    if (/(?:事实|统计关联|模型归因|证据类型)|\b(?:fact|association|attribution|evidence type)\b/i.test(text)) return 'evidence_type';
    if (/(?:Figure\s*14|分类|类别)|\b(?:figure\s*14|categor(?:y|ies))\b/i.test(text)) return 'figure14_category_interpretation';
    if (/(?:公众说明|公众版)|\b(?:public summary|public explanation)\b/i.test(text)) return 'public_summary';
    if (/(?:内部核查|内部说明)|\b(?:internal (?:review|summary)|ngo)\b/i.test(text)) return 'ngo_internal_summary';
    if (/(?:资助方说明|资助说明)|\b(?:funder|funding)\b/i.test(text)) return 'funder_summary';
    if (/(?:修复|恢复)|\b(?:restoration|restored)\b/i.test(text)) return 'restoration_caveat';
    return 'explain_evidence';
}

function buildAiRequest(question, audienceMode, contextSelection) {
    return { question: question || '', audienceMode, contextSelection: { ...contextSelection } };
}

function setAiContext(cluster, wetland, unit = null, compareCluster = null, question = '') {
    aiState.cluster = cluster || aiState.cluster;
    aiState.wetland = wetland || aiState.wetland;
    aiState.unit = unit;
    aiState.compareCluster = compareCluster;
    aiState.question = question || aiState.question;
}

function openAiExplanation(cluster, wetland, unit = null, compareCluster = null, question = '') {
    setAiContext(cluster, wetland, unit, compareCluster, question);
    closeOverviewDrawer?.();
    closeUnitEvidenceCard?.();
    showPage('ai');
}

function selectedAiQuestionTemplate(question = aiState.question || document.getElementById('ai-question')?.value || '') {
    const templates = getAiQuestionTemplates();
    const intent = aiQuestionIntent(question);
    const exact = templates.find(item => String(item.text || '').trim() === String(question || '').trim());
    if (exact) return exact;
    return templates.find(item => item.intent === intent && item.cluster_code === aiState.cluster && item.wetland_code === aiState.wetland)
        || templates.find(item => item.intent === intent)
        || templates.find(item => item.cluster_code === aiState.cluster && item.wetland_code === aiState.wetland && item.intent !== 'compare_regions')
        || templates[0]
        || null;
}

function aiPacketMatchesContext(packet, contextSelection, { allowComparison = false } = {}) {
    const scope = packet?.scope || {};
    if (scope.cluster_code !== contextSelection.cluster || scope.wetland_code !== contextSelection.wetland) return false;
    if (contextSelection.unit) return scope.unit_code === contextSelection.unit && !scope.compare_cluster_code;
    if (allowComparison) return scope.compare_cluster_code === (contextSelection.compareCluster || 'BBG') && !scope.unit_code;
    return !scope.compare_cluster_code && !scope.unit_code;
}

function selectEvidencePacket(question, contextSelection) {
    if (!DATA.aiInputs) return null;
    const intent = aiQuestionIntent(question);
    const exactTemplate = getAiQuestionTemplates().find(item => String(item.text || '').trim() === String(question || '').trim());
    if (exactTemplate) {
        const exactPacket = DATA.aiInputs.input_packets.find(packet => packet.question_id === exactTemplate.question_id);
        if (aiPacketMatchesContext(exactPacket, contextSelection, { allowComparison: exactTemplate.intent === 'compare_regions' })) return exactPacket;
    }
    if (contextSelection.compareCluster || intent === 'compare_regions') {
        return getAiComparisonPacket(contextSelection.wetland, contextSelection.cluster, contextSelection.compareCluster || 'BBG');
    }
    if (contextSelection.unit) {
        return DATA.aiInputs.input_packets.find(packet => aiPacketMatchesContext(packet, contextSelection) && packet.question_intent === 'unit_evidence')
            || getAiPacketByScope(contextSelection.cluster, contextSelection.wetland, contextSelection.unit);
    }
    return DATA.aiInputs.input_packets.find(packet => aiPacketMatchesContext(packet, contextSelection) && packet.question_intent === intent)
        || DATA.aiInputs.input_packets.find(packet => aiPacketMatchesContext(packet, contextSelection) && packet.question_intent === 'explain_evidence')
        || null;
}

function aiPrimaryEvidence(packet) { return packet?.evidence_records?.find(item => item.evidence_type === 'FACT') || packet?.evidence_records?.[0] || {}; }
function aiCitations(packet) {
    return (packet.evidence_records || []).slice(0, 4).map((evidence, index) => ({
        citation_id: `C${index + 1}`,
        evidence_id: evidence.evidence_id,
        evidence_type: evidence.evidence_type,
        source_path: evidence.source?.path,
        source_sha256: evidence.source?.sha256,
        period: evidence.period?.label || aiText('ai.defaultPeriod', '2001–2022', '2001–2022'),
        scale: evidence.scale,
        metric_keys: Object.keys(evidence.metrics || {}).slice(0, 6),
    }));
}

function aiNumericClaims(evidence) {
    return ['start_value', 'end_value', 'absolute_change', 'relative_change_rate', 'slope_per_year', 'observations', 'spatial_units']
        .filter(key => evidence.metrics?.[key] !== null && evidence.metrics?.[key] !== undefined)
        .map(key => ({
            value: evidence.metrics[key],
            display_text: key === 'relative_change_rate' ? formatEvidenceRate(evidence.metrics) : formatEvidenceNumber(evidence.metrics[key], key === 'slope_per_year' ? 2 : 1),
            source_evidence_id: evidence.evidence_id,
            metric_key: key,
            unit_or_meaning: key === 'relative_change_rate'
                ? aiText('ai.numeric.relativeHistoricalChange', 'relative historical change', '相对历史变化')
                : aiText('ai.numeric.evidenceMetric', 'evidence metric', '证据指标'),
        }));
}

function aiAudiencePrefix(mode) {
    if (mode === 'ngo_internal') return aiText('ai.prefix.ngoInternal', 'Internal review framing: retain evidence types, limitations, and follow-up tasks.', '内部核查口径：保留证据类型、限制和补采任务。');
    if (mode === 'funder') return aiText('ai.prefix.funder', 'Funder framing: explain why further review may merit support; do not promise ecological outcomes.', '资助方口径：用于说明为什么值得支持进一步核查，不承诺生态结果。');
    return aiText('ai.prefix.public', 'Public framing: explain historical facts and limits in plain language.', '公众口径：用简明语言说明历史事实和边界。');
}

function aiOutOfScope(question, inputPacket = null) {
    if (inputPacket?.question_intent === 'out_of_scope' && String(question || '').trim() === String(inputPacket.question_text || '').trim()) return true;
    const exactTemplate = getAiQuestionTemplates().find(item => String(item.text || '').trim() === String(question || '').trim());
    if (exactTemplate && exactTemplate.intent !== 'out_of_scope') return false;
    return Object.values(aiQuestionGuardrails(question)).some(Boolean);
}

function generateDeterministicExplanation(inputPacket, audienceMode, question) {
    const evidence = aiPrimaryEvidence(inputPacket);
    const metrics = evidence.metrics || {};
    const citations = aiCitations(inputPacket);
    const cluster = aiClusterLabel(inputPacket.scope?.cluster_code);
    const compareCluster = inputPacket.scope?.compare_cluster_code ? aiClusterLabel(inputPacket.scope.compare_cluster_code) : '';
    const wetland = aiWetlandLabel(inputPacket.scope?.wetland_code);
    const isOut = aiOutOfScope(question || inputPacket.question_text || '', inputPacket);
    const status = isOut ? 'out_of_scope' : (inputPacket.category_notes || []).join(' ').includes('Insufficient data') ? 'needs_review' : 'answered';
    const period = evidence.period?.label || inputPacket.scope?.period || aiText('ai.defaultPeriod', '2001–2022', '2001–2022');
    const comparisonText = compareCluster ? aiText('ai.fact.comparison', '; comparison area: {cluster}', '；对照对象为{cluster}', { cluster: compareCluster }) : '';
    const factLine = aiText(
        'ai.fact.summary',
        '{prefix} Structured evidence for {cluster}{comparison} · {wetland} during {period} reports: start {start}; end {end}; absolute change {change}; change rate {rate}; annual slope {slope}.',
        '{prefix} {cluster}{comparison} · {wetland} 在 {period} 的结构化证据显示：起点 {start}，终点 {end}，绝对变化 {change}，变化率 {rate}，年斜率 {slope}。',
        {
            prefix: aiAudiencePrefix(audienceMode), cluster, comparison: comparisonText, wetland, period,
            start: formatEvidenceNumber(metrics.start_value), end: formatEvidenceNumber(metrics.end_value),
            change: formatEvidenceNumber(metrics.absolute_change), rate: formatEvidenceRate(metrics), slope: formatEvidenceNumber(metrics.slope_per_year, 2),
        },
    );
    const blockedLine = aiText(
        'ai.guardrail.blocked',
        'This request is outside the current evidence boundary. The system can explain historical evidence for {period} only; it cannot make unsupported judgments or automated decisions.',
        '这个问题触及当前证据边界。系统只能解释 {period} 历史证据，不能给出超出结构化输入的判断或自动处理结论。',
        { period },
    );
    const evidenceTypes = [...new Set((inputPacket.evidence_records || []).map(item => item.evidence_type).filter(Boolean))].map(aiEvidenceTypeLabel).join(aiText('ai.listSeparator', ', ', '、'));
    return {
        schema_version: '1.0.0',
        question: question || inputPacket.question_text,
        audience_mode: audienceMode,
        answer_status: status,
        sections: {
            data_facts: isOut ? [blockedLine] : [factLine],
            model_or_statistical_notes: [aiText(
                'ai.modelNotes',
                'Evidence types include {types}. ASSOCIATION and MODEL_ATTRIBUTION describe statistical relationships or model contributions only; they do not establish ecological mechanisms.',
                '证据类型包括 {types}。ASSOCIATION 和 MODEL_ATTRIBUTION 只用于说明统计关系或模型贡献，不作为生态机制结论。',
                { types: evidenceTypes },
            )],
            cannot_conclude: [aiText(
                'ai.cannotConclude',
                'The current evidence cannot establish future change, responsibility for a specific project, an automated approval or action decision, or restoration success from area growth alone. Matrix categories are not forward-looking probability estimates; units with insufficient data need supplementary materials.',
                '不能从当前证据推出未来变化、具体工程责任、机器自动放行结论，或把面积增加直接等同生态成效。矩阵分类不是面向未来的概率判断，Insufficient data 单元需要结合补充资料解释。',
            )],
            recommended_checks: audienceMode === 'public'
                ? [aiText('ai.checks.public', 'Have the project team verify the source, period, and scale before public use.', '建议由项目团队核对来源、时期和尺度后再公开使用。')]
                : [aiText('ai.checks.internal', 'Add ecological quality, connectivity, project boundaries, field monitoring, and expert notes before moving into a task or briefing workflow.', '补充生态质量、连通性、保护工程边界、现场监测和专家备注，再进入任务或简报流程。')],
            human_review_note: aiText('ai.humanReview', 'This explanation is a structured-evidence draft. A human expert must review it before publication, action, or funding decisions.', '本解释是结构化证据草稿，发布、行动或资助决策前必须由人类专家复核。'),
        },
        citations,
        numeric_claims: isOut ? [] : aiNumericClaims(evidence),
        guardrail_flags: ['no_new_numbers', 'not_causal', 'no_future_prediction', 'human_review_required'],
    };
}

function validateExplanationClientSide(output, inputPacket) {
    const generatedText = Object.values(output.sections || {}).flatMap(section => Array.isArray(section) ? section : [section]).join('\n');
    const errors = [];
    if (output.answer_status !== 'out_of_scope') {
        AI_FORBIDDEN_PATTERNS.forEach(pattern => {
            if (pattern.test(generatedText)) errors.push(aiText('ai.validation.forbidden', 'Forbidden wording was detected.', '检测到禁用表达。'));
        });
    }
    if (inputPacket.question_intent === 'out_of_scope' && output.answer_status !== 'out_of_scope') errors.push(aiText('ai.validation.expectedBlocked', 'This request should have been blocked at the evidence boundary.', '该请求应在证据边界处被阻止。'));
    if (!output.sections?.human_review_note) errors.push(aiText('ai.validation.missingHumanReview', 'Human-review notice is missing.', '缺少人工审核提示。'));
    const evidenceIds = new Set((inputPacket.evidence_records || []).map(item => item.evidence_id));
    (output.citations || []).forEach(citation => {
        if (!evidenceIds.has(citation.evidence_id)) errors.push(aiText('ai.validation.missingCitation', 'Citation is not present in the input evidence: {id}', '引用不存在于输入证据中：{id}', { id: citation.evidence_id }));
    });
    (output.numeric_claims || []).forEach(claim => {
        if (!evidenceIds.has(claim.source_evidence_id)) errors.push(aiText('ai.validation.unsourcedNumber', 'Numeric claim has no source: {metric}', '数字无来源：{metric}', { metric: claim.metric_key }));
    });
    return { ok: errors.length === 0, errors };
}

function renderAiCitations(citations) {
    return `<div class="citation-list">${(citations || []).map(c => `<span class="citation-chip" title="${aiEscape(c.source_sha256)}">${aiEscape(c.citation_id)} · ${aiEscape(aiEvidenceTypeLabel(c.evidence_type))} · ${aiEscape(c.scale)}<small>${aiEscape(c.evidence_id)}</small></span>`).join('')}</div>`;
}

function renderAiValidationBadges(result) {
    const badges = result.ok
        ? [
            aiText('ai.badge.noNumberHallucination', 'No unsupported numbers', '无数字幻觉'),
            aiText('ai.badge.noCausalOverreach', 'No causal overreach', '无因果越界'),
            aiText('ai.badge.noFuturePrediction', 'No future prediction overreach', '无未来预测越界'),
            aiText('ai.badge.humanReview', 'Human review required', '需人工复核'),
        ]
        : result.errors;
    return `<div class="ai-badges">${badges.map(text => `<span class="ai-badge ${result.ok ? 'pass' : 'fail'}">${aiEscape(text)}</span>`).join('')}</div>`;
}

function renderStructuredExplanation(output, validation) {
    const sections = output.sections || {};
    const title = output.answer_status === 'out_of_scope'
        ? aiText('ai.title.blocked', 'Request blocked at the evidence boundary', '已阻止越界请求')
        : aiText('ai.title.draft', 'Structured explanation draft', '结构化解释草稿');
    const sectionKeys = ['data_facts', 'model_or_statistical_notes', 'cannot_conclude', 'recommended_checks', 'human_review_note'];
    return `<article class="ai-answer-card ${output.answer_status === 'out_of_scope' ? 'blocked' : ''}"><div class="ai-answer-head"><div><span class="eyebrow">${aiEscape(aiAudienceLabel(output.audience_mode))}</span><h3>${aiEscape(title)}</h3></div><span class="status-badge badge-demo">${aiEscape(aiAnswerStatusLabel(output.answer_status))}</span></div>${renderAiValidationBadges(validation)}${sectionKeys.map(key => `<section class="ai-section"><h4>${aiEscape(aiSectionLabel(key))}</h4>${(Array.isArray(sections[key]) ? sections[key] : [sections[key]]).filter(item => item !== undefined && item !== null).map(item => `<p>${aiEscape(item)}</p>`).join('')}</section>`).join('')}<section class="ai-section"><h4>${aiEscape(aiSectionLabel('citations'))}</h4>${renderAiCitations(output.citations)}</section></article>`;
}

function submitAiQuestion() {
    aiState.audienceMode = document.getElementById('ai-audience')?.value || aiState.audienceMode;
    aiState.cluster = document.getElementById('ai-cluster')?.value || aiState.cluster;
    aiState.wetland = document.getElementById('ai-wetland')?.value || aiState.wetland;
    aiState.question = document.getElementById('ai-question')?.value || aiState.question;
    const intent = aiQuestionIntent(aiState.question);
    aiState.compareCluster = intent === 'compare_regions' ? (aiState.compareCluster || 'BBG') : null;
    const request = buildAiRequest(aiState.question, aiState.audienceMode, aiState);
    const packet = selectEvidencePacket(request.question, request.contextSelection);
    const container = document.getElementById('ai-output');
    if (!container) return;
    if (!packet) {
        container.innerHTML = `<div class="loading error-state">${aiEscape(aiText('ai.error.noPacket', 'No matching Day 7 input packet was found.', '找不到匹配的 Day 7 输入包。'))}</div>`;
        return;
    }
    const output = generateDeterministicExplanation(packet, request.audienceMode, request.question);
    const validation = validateExplanationClientSide(output, packet);
    container.innerHTML = renderStructuredExplanation(output, validation);
}

function renderAiSuggestions(suggestions) {
    const container = document.getElementById('ai-suggestions');
    if (!container) return;
    container.replaceChildren();
    suggestions.forEach(item => {
        const button = document.createElement('button');
        button.className = 'text-action ai-suggestion';
        button.type = 'button';
        button.textContent = item.text || '';
        button.addEventListener('click', () => {
            aiState.question = item.text || '';
            aiState.cluster = item.cluster_code || aiState.cluster;
            aiState.wetland = item.wetland_code || aiState.wetland;
            aiState.compareCluster = item.compare_cluster_code || null;
            renderAiPage();
            submitAiQuestion();
        });
        container.append(button);
    });
}

function renderAiPage() {
    const output = document.getElementById('ai-output');
    if (!output) return;
    if (!DATA.aiInputs) {
        const errorMessage = DATA.aiInputError?.message || aiText('ai.error.unavailableDetail', 'Unable to load the Day 7 AI input packet.', '无法加载 Day 7 AI 输入包。');
        output.innerHTML = `<div class="loading error-state"><strong>${aiEscape(aiText('ai.error.unavailableTitle', 'AI explanation is unavailable', 'AI 解释暂不可用'))}</strong><p>${aiEscape(errorMessage)}</p></div>`;
        return;
    }
    const audience = document.getElementById('ai-audience');
    const cluster = document.getElementById('ai-cluster');
    const wetland = document.getElementById('ai-wetland');
    const question = document.getElementById('ai-question');
    if (audience) audience.value = aiState.audienceMode;
    if (cluster) {
        cluster.innerHTML = CLUSTERS.map(code => `<option value="${aiEscape(code)}">${aiEscape(aiClusterLabel(code))}</option>`).join('');
        cluster.value = aiState.cluster;
    }
    if (wetland) {
        wetland.innerHTML = WETLAND_TYPES.map(code => `<option value="${aiEscape(code)}">${aiEscape(aiWetlandLabel(code))}</option>`).join('');
        wetland.value = aiState.wetland;
    }
    if (question) question.value = aiState.question || selectedAiQuestionTemplate()?.text || '';
    renderAiSuggestions(getAiQuestionTemplates().slice(0, 8));
    submitAiQuestion();
}

function rerenderAiForLocale() {
    if (document.getElementById('page-ai')?.classList.contains('active')) renderAiPage();
}

