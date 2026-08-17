/* Day 8 deterministic action-task and brief adapter. */
const ACTION_TASK_TYPES = ['data_supplementation', 'desktop_review', 'field_monitoring'];
const ACTION_TASK_TYPE_FALLBACKS = { data_supplementation: '数据补采', desktop_review: '桌面核查', field_monitoring: '现场监测' };
const ACTION_STATUS_FALLBACKS = { draft: '草稿', assigned: '已分配', in_progress: '进行中', blocked: '受阻', done: '已完成' };
const BRIEF_AUDIENCE_FALLBACKS = { public: '公众版', ngo_internal: 'NGO 内部版', funder: '资助方版' };

const actionState = { tasks: [], selectedTaskId: null, sourceContext: null, briefAudience: 'ngo_internal' };

function actionText(key, fallback, values = {}) {
    try {
        const translated = t(key, values);
        if (translated && translated !== key) return translated;
    } catch (error) {
        console.warn(`Translation lookup failed for ${key}:`, error);
    }
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

function actionCodeLabel(namespace, code, fallback) {
    try {
        const translated = label(namespace, code);
        if (translated && translated !== code) return translated;
    } catch (error) {
        console.warn(`Label lookup failed for ${namespace}.${code}:`, error);
    }
    return actionText(`actions.${namespace}.${code}`, fallback);
}

function taskTypeLabel(taskType) {
    return actionCodeLabel('taskType', taskType, ACTION_TASK_TYPE_FALLBACKS[taskType] || taskType);
}

function taskStatusLabel(status) {
    return actionCodeLabel('taskStatus', status, ACTION_STATUS_FALLBACKS[status] || status);
}

function briefAudienceLabel(audience) {
    return actionCodeLabel('audience', audience, BRIEF_AUDIENCE_FALLBACKS[audience] || audience);
}

function localizedSystemValue(key, fallback, values = {}) {
    return { kind: 'localized_system_text', key, fallback, values };
}

function resolveTaskValue(value) {
    if (value && typeof value === 'object' && value.kind === 'localized_system_text') {
        return actionText(value.key, value.fallback, value.values || {});
    }
    return String(value ?? '');
}

function escapeMarkdown(text) {
    return String(text ?? '').replace(/\r?\n/g, ' ').trim();
}

function sourceCaseFromCodes(source) {
    const clusterCode = source?.cluster_code || source?.source_trace?.cluster_code;
    const wetlandCode = source?.wetland_code || source?.source_trace?.wetland_code;
    const cluster = actionCodeLabel('cluster', clusterCode, clusterCode || '');
    const wetland = actionCodeLabel('wetland', wetlandCode, wetlandCode || '');
    const values = {
        cluster,
        city: source?.city || source?.source_trace?.city || '',
        wetland,
        scale: source?.scale || source?.source_trace?.scale || '',
        locale: getLocale(),
    };
    return actionText('actions.sourceCase', '{cluster} · {city} · {wetland} · {scale}', values)
        .replace(/ · (?= ·|$)/g, '')
        .replace(/^ · | · $/g, '');
}

function taskSourceCase(task) {
    return sourceCaseFromCodes(task?.source_case_codes || task?.source_trace || task);
}

function buildEvidenceContext(scopeType, cluster, city, wetland) {
    if (!DATA.evidenceBundle) return null;
    let evidence = null;
    if (scopeType === 'unit') {
        const item = DATA.evidenceBundle._unitByKey?.get(`${cluster}::${city}::${wetland}`);
        evidence = item?.evidence?.[0] || null;
    } else {
        evidence = getEvidenceSummary(wetland, cluster)?.trend || null;
    }
    if (!evidence) return null;
    const metrics = evidence.metrics || {};
    return {
        scope_type: scopeType,
        cluster_code: cluster,
        city: city || null,
        wetland_code: wetland,
        evidence_id: evidence.evidence_id,
        evidence_type: evidence.evidence_type,
        period: evidence.period?.label || '2001-2022',
        scale: evidence.scale,
        method: evidence.method,
        metrics,
        limitations: evidence.limitations || [],
        source: { path: evidence.source?.path, sha256: evidence.source?.sha256 },
        source_trace: {
            evidence_id: evidence.evidence_id,
            evidence_type: evidence.evidence_type,
            source_path: evidence.source?.path,
            source_sha256: evidence.source?.sha256,
            period: evidence.period?.label || '2001-2022',
            scale: evidence.scale,
            method: evidence.method,
            cluster_code: cluster,
            city: city || null,
            wetland_code: wetland,
            contract_id: DATA.evidenceBundle.contract_id,
            contract_version: DATA.evidenceBundle.contract_version,
            bundle_id: DATA.evidenceBundle.bundle_id,
            human_review_status: 'needs_human_review',
        },
    };
}

function defaultTaskTypeForContext(context) {
    const text = `${context.limitations.join(' ')} ${context.metrics.relative_change_status || ''}`;
    if (/Insufficient data|insufficient-data|cautionary|zero|STRUCTURAL|undefined_zero|结构性/.test(text)) return 'data_supplementation';
    if (context.scope_type === 'unit' && context.metrics.direction === 'decrease') return 'field_monitoring';
    return 'desktop_review';
}

function taskDefaults(taskType) {
    if (taskType === 'data_supplementation') return {
        question: localizedSystemValue('actions.defaults.dataSupplementation.question', '补充保护区边界、修复工程、岸线、物种或水文数据，以核查当前证据缺口。'),
        needed: [
            localizedSystemValue('actions.defaults.dataSupplementation.needed.protectedBoundary', '保护区/项目边界'),
            localizedSystemValue('actions.defaults.dataSupplementation.needed.shoreline', '岸线与围填海资料'),
            localizedSystemValue('actions.defaults.dataSupplementation.needed.ecologicalRecords', '生态质量或物种记录'),
            localizedSystemValue('actions.defaults.dataSupplementation.needed.hydrologicalConnectivity', '水文连通性资料'),
        ],
    };
    if (taskType === 'field_monitoring') return {
        question: localizedSystemValue('actions.defaults.fieldMonitoring.question', '设计现场照片、样方、水文或植被原生性核查，验证历史变化对应的生态状态。'),
        needed: [
            localizedSystemValue('actions.defaults.fieldMonitoring.needed.fieldPhotos', '现场照片'),
            localizedSystemValue('actions.defaults.fieldMonitoring.needed.quadratRecords', '样方记录'),
            localizedSystemValue('actions.defaults.fieldMonitoring.needed.hydrologicalObservations', '水文观测'),
            localizedSystemValue('actions.defaults.fieldMonitoring.needed.vegetationRecords', '植被原生性记录'),
        ],
    };
    return {
        question: localizedSystemValue('actions.defaults.desktopReview.question', '查阅地方规划、项目资料和公开遥感，解释历史变化信号。'),
        needed: [
            localizedSystemValue('actions.defaults.desktopReview.needed.localPlans', '地方规划'),
            localizedSystemValue('actions.defaults.desktopReview.needed.projectMaterials', '项目公开资料'),
            localizedSystemValue('actions.defaults.desktopReview.needed.remoteSensing', '公开遥感底图'),
            localizedSystemValue('actions.defaults.desktopReview.needed.monitoringReports', '既有监测报告'),
        ],
    };
}

function createTaskDraftFromEvidence(context, taskTypeOverride = null) {
    const taskType = taskTypeOverride || defaultTaskTypeForContext(context);
    const defaults = taskDefaults(taskType);
    const taskId = `day8-task-${String(actionState.tasks.length + 1).padStart(2, '0')}`;
    return {
        task_id: taskId,
        task_type: taskType,
        source_case_codes: { cluster_code: context.cluster_code, city: context.city, wetland_code: context.wetland_code, scale: context.scale },
        verification_question: defaults.question,
        needed_data: defaults.needed,
        owner: localizedSystemValue('actions.defaults.ownerUnassigned', '待指定'),
        due_date: '',
        status: 'draft',
        expert_notes: '',
        attachments: [],
        audit_log: [{
            action: 'created_from_evidence_card',
            source_evidence_id: context.evidence_id,
            note: localizedSystemValue('actions.audit.createdFromEvidence', 'Static MVP in-memory draft; not persisted.'),
        }],
        source_trace: context.source_trace,
    };
}

function openActionTaskFromEvidence(scopeType, cluster, city, wetland) {
    const context = buildEvidenceContext(scopeType, cluster, city, wetland);
    if (!context) return;
    const task = createTaskDraftFromEvidence(context);
    actionState.sourceContext = context;
    actionState.tasks.push(task);
    actionState.selectedTaskId = task.task_id;
    closeOverviewDrawer?.();
    closeUnitEvidenceCard?.();
    showPage('actions');
}

function selectedActionTask() {
    return actionState.tasks.find(task => task.task_id === actionState.selectedTaskId) || actionState.tasks[0] || null;
}

function updateSelectedTaskField(field, value) {
    const task = selectedActionTask();
    if (!task) return;
    task[field] = value;
    task.audit_log.push({
        action: `updated_${field}`,
        note: localizedSystemValue('actions.audit.editedField', 'Edited in static MVP UI; not persisted.', { field }),
    });
    renderActionsPage();
}

function syncActionTaskFormValues() {
    const task = selectedActionTask();
    const form = document.getElementById('action-task-form');
    if (task && form) {
        form.querySelectorAll('[data-action-task-field]').forEach(control => {
            task[control.dataset.actionTaskField] = control.value;
        });
    }
    const audience = document.getElementById('brief-audience')?.value;
    if (BRIEF_AUDIENCE_FALLBACKS[audience]) actionState.briefAudience = audience;
}

function selectActionTask(taskId) {
    syncActionTaskFormValues();
    actionState.selectedTaskId = taskId;
    renderActionsPage();
}

function buildBriefDraft(task, audience) {
    const trace = task.source_trace;
    const audienceName = briefAudienceLabel(audience);
    const sourceCase = taskSourceCase(task);
    const verificationQuestion = resolveTaskValue(task.verification_question);
    const owner = resolveTaskValue(task.owner) || actionText('actions.defaults.ownerUnassigned', '待指定');
    const expertNotes = resolveTaskValue(task.expert_notes);
    const summary = audience === 'public'
        ? actionText('actions.brief.summary.public', '这是一份基于历史证据的核查草稿，用简明语言说明为什么需要进一步了解该湿地变化。')
        : audience === 'funder'
            ? actionText('actions.brief.summary.funder', '这是一份用于资源讨论的证据草稿，说明问题、证据、拟开展行动、预算占位和预期产出，但不承诺生态结果。')
            : actionText('actions.brief.summary.ngoInternal', '这是一份 NGO 内部核查草稿，保留证据、任务、负责人、状态、专家备注和来源追踪。');
    return {
        brief_id: `brief-${audience}-${task.task_id}`,
        audience,
        title: actionText('actions.brief.title', '{audience} · {sourceCase} 行动简报', { audience: audienceName, sourceCase }),
        sections: {
            summary,
            evidence: actionText('actions.brief.evidence', '证据来自 {period}、{scale} 尺度的 {evidenceType} 记录。', { period: trace.period, scale: trace.scale, evidenceType: trace.evidence_type }),
            action_task: actionText('actions.brief.actionTask', '任务类型：{taskType}；核查问题：{question}；负责人：{owner}；状态：{status}。', { taskType: taskTypeLabel(task.task_type), question: verificationQuestion, owner, status: taskStatusLabel(task.status) }),
            expert_notes: expertNotes || actionText('actions.brief.noExpertNotes', '暂无专家备注。'),
            budget_placeholder: audience === 'funder'
                ? actionText('actions.brief.budget.funder', '预算占位：待根据补采数据、现场天数和专家投入估算。')
                : actionText('actions.brief.budget.default', '预算占位：当前静态 MVP 不估算成本。'),
            limitations: actionText('actions.brief.limitations', '本简报为任务草稿，不代表专家批准、项目审批或资助承诺；不得作为未来预测、因果判断或自动处理结论。'),
        },
        source_trace: trace,
        human_review_status: trace.human_review_status,
    };
}

function briefToMarkdown(brief) {
    const sections = brief.sections;
    const trace = brief.source_trace;
    return `# ${escapeMarkdown(brief.title)}\n\n${actionText('actions.markdown.audience', '受众')}：${escapeMarkdown(briefAudienceLabel(brief.audience))}\n\n## ${actionText('actions.markdown.summary', '摘要')}\n${escapeMarkdown(sections.summary)}\n\n## ${actionText('actions.markdown.evidence', '证据')}\n${escapeMarkdown(sections.evidence)}\n\n## ${actionText('actions.markdown.actionTask', '行动任务')}\n${escapeMarkdown(sections.action_task)}\n\n## ${actionText('actions.markdown.expertNotes', '专家备注')}\n${escapeMarkdown(sections.expert_notes)}\n\n## ${actionText('actions.markdown.budget', '预算与预期产出')}\n${escapeMarkdown(sections.budget_placeholder)}\n\n## ${actionText('actions.markdown.limitations', '限制与人工审核')}\n${escapeMarkdown(sections.limitations)}\n\n## ${actionText('actions.markdown.sourceAudit', '来源与审计')}\n- ${actionText('actions.markdown.evidenceId', 'Evidence ID')}: ${escapeMarkdown(trace.evidence_id)}\n- ${actionText('actions.markdown.evidenceType', 'Evidence type')}: ${escapeMarkdown(trace.evidence_type)}\n- ${actionText('actions.markdown.sourcePath', 'Source path')}: ${escapeMarkdown(trace.source_path)}\n- ${actionText('actions.markdown.sourceSha256', 'Source SHA-256')}: ${escapeMarkdown(trace.source_sha256)}\n- ${actionText('actions.markdown.period', 'Period')}: ${escapeMarkdown(trace.period)}\n- ${actionText('actions.markdown.scale', 'Scale')}: ${escapeMarkdown(trace.scale)}\n- ${actionText('actions.markdown.method', 'Method')}: ${escapeMarkdown(trace.method)}\n- ${actionText('actions.markdown.bundleId', 'Bundle ID')}: ${escapeMarkdown(trace.bundle_id)}\n- ${actionText('actions.markdown.contract', 'Contract')}: ${escapeMarkdown(trace.contract_id)} / ${escapeMarkdown(trace.contract_version)}\n- ${actionText('actions.markdown.humanReviewStatus', 'Human review status')}: ${escapeMarkdown(brief.human_review_status)}\n`;
}

function downloadMarkdown(filename, markdown) {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function renderSourceTrace(trace) {
    if (!trace) return `<div class="empty-state">${escapeHtml(actionText('actions.sourceTrace.empty', '尚未选择证据来源。请从证据卡点击“从此证据创建任务”。'))}</div>`;
    return `<dl class="source-trace"><div><dt>${escapeHtml(actionText('actions.sourceTrace.evidenceId', 'Evidence ID'))}</dt><dd>${escapeHtml(trace.evidence_id)}</dd></div><div><dt>${escapeHtml(actionText('actions.sourceTrace.sourcePath', 'Source path'))}</dt><dd>${escapeHtml(trace.source_path)}</dd></div><div><dt>${escapeHtml(actionText('actions.sourceTrace.sourceSha256', 'Source SHA-256'))}</dt><dd>${escapeHtml(trace.source_sha256)}</dd></div><div><dt>${escapeHtml(actionText('actions.sourceTrace.periodScale', 'Period / Scale'))}</dt><dd>${escapeHtml(trace.period)} · ${escapeHtml(trace.scale)}</dd></div><div><dt>${escapeHtml(actionText('actions.sourceTrace.contract', 'Contract'))}</dt><dd>${escapeHtml(trace.contract_id)} / ${escapeHtml(trace.contract_version)}</dd></div><div><dt>${escapeHtml(actionText('actions.sourceTrace.humanReview', 'Human review'))}</dt><dd>${escapeHtml(trace.human_review_status)}</dd></div></dl>`;
}

function renderActionsPage() {
    syncActionTaskFormValues();
    const source = document.getElementById('action-source-context');
    const form = document.getElementById('action-task-form');
    const list = document.getElementById('action-task-list');
    const preview = document.getElementById('brief-preview');
    const markdownBox = document.getElementById('markdown-export-preview');
    if (!source || !form || !list || !preview || !markdownBox) return;
    if (!DATA.evidenceBundle) {
        source.innerHTML = `<div class="loading error-state">${escapeHtml(actionText('actions.evidenceUnavailable', 'Day 3 证据包不可用，无法创建任务。'))}</div>`;
        return;
    }
    if (!actionState.tasks.length) {
        const context = buildEvidenceContext('cluster', 'BYS', null, 'Tidal_Flat');
        if (context) {
            actionState.sourceContext = context;
            const task = createTaskDraftFromEvidence(context, 'desktop_review');
            actionState.tasks.push(task);
            actionState.selectedTaskId = task.task_id;
        }
    }
    const task = selectedActionTask();
    source.innerHTML = renderSourceTrace(task?.source_trace);
    list.innerHTML = actionState.tasks.map(item => `<button class="action-task-item ${item.task_id === task?.task_id ? 'active' : ''}" type="button" onclick="selectActionTask('${item.task_id}')"><strong>${escapeHtml(taskTypeLabel(item.task_type))}</strong><span>${escapeHtml(taskSourceCase(item))}</span><small>${escapeHtml(taskStatusLabel(item.status))}</small></button>`).join('');
    form.innerHTML = `<label>${escapeHtml(actionText('actions.form.taskType', '任务类型'))}<select data-action-task-field="task_type" onchange="updateSelectedTaskField('task_type', this.value)">${ACTION_TASK_TYPES.map(type => `<option value="${type}" ${task.task_type === type ? 'selected' : ''}>${escapeHtml(taskTypeLabel(type))}</option>`).join('')}</select></label><label>${escapeHtml(actionText('actions.form.owner', '负责人'))}<input data-action-task-field="owner" value="${escapeHtml(resolveTaskValue(task.owner))}" onchange="updateSelectedTaskField('owner', this.value)" placeholder="${escapeHtml(actionText('actions.defaults.ownerUnassigned', '待指定'))}"></label><label>${escapeHtml(actionText('actions.form.dueDate', '截止时间'))}<input data-action-task-field="due_date" type="date" value="${escapeHtml(task.due_date)}" onchange="updateSelectedTaskField('due_date', this.value)"></label><label>${escapeHtml(actionText('actions.form.status', '状态'))}<select data-action-task-field="status" onchange="updateSelectedTaskField('status', this.value)">${Object.keys(ACTION_STATUS_FALLBACKS).map(status => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${escapeHtml(taskStatusLabel(status))}</option>`).join('')}</select></label><label class="wide">${escapeHtml(actionText('actions.form.expertNotes', '专家备注'))}<textarea data-action-task-field="expert_notes" rows="4" onchange="updateSelectedTaskField('expert_notes', this.value)" placeholder="${escapeHtml(actionText('actions.form.expertNotesPlaceholder', '待生态专家补充备注'))}">${escapeHtml(resolveTaskValue(task.expert_notes))}</textarea></label><div class="needed-data"><strong>${escapeHtml(actionText('actions.form.neededData', '需要的数据'))}</strong><ul>${task.needed_data.map(item => `<li>${escapeHtml(resolveTaskValue(item))}</li>`).join('')}</ul></div><div class="audit-log"><strong>${escapeHtml(actionText('actions.form.auditLog', '审计日志'))}</strong><ul>${task.audit_log.map(item => `<li>${escapeHtml(item.action)} · ${escapeHtml(resolveTaskValue(item.note))}</li>`).join('')}</ul></div>`;
    const audienceSelect = document.getElementById('brief-audience');
    if (audienceSelect) audienceSelect.value = actionState.briefAudience;
    const brief = buildBriefDraft(task, actionState.briefAudience);
    const markdown = briefToMarkdown(brief);
    preview.innerHTML = `<article class="brief-card"><h3>${escapeHtml(brief.title)}</h3><p>${escapeHtml(brief.sections.summary)}</p><p>${escapeHtml(brief.sections.evidence)}</p><p>${escapeHtml(brief.sections.action_task)}</p><p class="drawer-warning">${escapeHtml(brief.sections.limitations)}</p>${renderSourceTrace(brief.source_trace)}<button class="primary-action" type="button" onclick="downloadMarkdown('wetland-day8-${brief.audience}-${task.task_id}.md', document.getElementById('markdown-export-preview').textContent)">${escapeHtml(actionText('actions.exportMarkdown', '导出 Markdown'))}</button></article>`;
    markdownBox.textContent = markdown;
}

function setBriefAudience(audience) {
    syncActionTaskFormValues();
    actionState.briefAudience = audience;
    renderActionsPage();
}
